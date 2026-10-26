import { describe, expect, it, vi } from "vitest";

import { event, file, simpleValue } from "../helpers/tfevents-bytes";
import { loadRun, runKey, streamChunks } from "@/utils/metrics-loader";

// a run of event files whose "network" is a map from path to bytes (or an error), with a delay per file
const makeRun = (specs, kind = "tfevents") => ({
  id: "runs/x",
  label: "runs/x",
  kind,
  files: specs.map((s, i) => ({ path: `runs/x/events.out.tfevents.${100 + i}`, size: s.bytes?.length ?? 10, oid: `oid${s.id ?? i}` })),
  bytes: specs.reduce((n, s) => n + (s.bytes?.length ?? 10), 0),
});

function fakeFetch(specs, stats = { active: 0, max: 0, calls: 0 }) {
  const impl = async (url) => {
    const i = Number(url.split(".").at(-1)) - 100;
    const spec = specs[i];
    stats.calls++;
    stats.active++;
    stats.max = Math.max(stats.max, stats.active);
    try {
      await new Promise((r) => setTimeout(r, spec.delay ?? 0));
    } finally {
      stats.active--;
    }
    if (spec.status) return { ok: false, status: spec.status };
    if (spec.json) return { ok: true, status: 200, json: async () => spec.json };
    let sent = false;
    return {
      ok: true,
      status: 200,
      body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: spec.bytes })), releaseLock() {} }) },
    };
  };
  impl.stats = stats;
  return impl;
}

const evFile = (...pairs) => file(...pairs.map(([step, v]) => event({ step, wall: step, values: [simpleValue("loss", v)] })));
const base = { urlFor: (p) => p, repoKey: "model/a/b@main", useCache: false, partialEveryMs: 0 };

describe("streamChunks", () => {
  it("yields what the reader gives and releases the lock", async () => {
    const chunks = [Uint8Array.of(1), Uint8Array.of(2, 3)];
    const release = vi.fn();
    const body = { getReader: () => ({ read: async () => (chunks.length ? { done: false, value: chunks.shift() } : { done: true }), releaseLock: release }) };
    const got = [];
    for await (const c of streamChunks(body)) got.push([...c]);
    expect(got).toEqual([[1], [2, 3]]);
    expect(release).toHaveBeenCalled();
  });
});

describe("loadRun", () => {
  it("merges the files of a run in write order even when they finish out of order", async () => {
    const specs = [
      { bytes: evFile([1, 1], [2, 2], [3, 3]), delay: 30 }, // slow, but written first
      { bytes: evFile([3, 33], [4, 44]), delay: 0 }, // a restart from step 3, finishes first
    ];
    const run = makeRun(specs);
    const res = await loadRun(run, { ...base, fetchImpl: fakeFetch(specs) });
    const s = res.scalars.get("loss");
    expect([...s.step]).toEqual([1, 2, 3, 4]);
    expect([...s.value]).toEqual([1, 2, 33, 44]); // the later file wins step 3
    expect(res.warnings).toEqual([]);
    expect(res.files).toBe(2);
  });

  it("reads at most `concurrency` files at a time", async () => {
    const specs = Array.from({ length: 10 }, (_, i) => ({ bytes: evFile([i, i]), delay: 5 }));
    const stats = { active: 0, max: 0, calls: 0 };
    await loadRun(makeRun(specs), { ...base, concurrency: 3, fetchImpl: fakeFetch(specs, stats) });
    expect(stats.calls).toBe(10);
    expect(stats.max).toBe(3);
  });

  it("offers a view of what has been read so far, merged like the final result, and reports progress", async () => {
    const specs = [{ bytes: evFile([1, 1]), delay: 0 }, { bytes: evFile([2, 2]), delay: 20 }, { bytes: evFile([3, 3]), delay: 40 }];
    const views = [];
    const progress = [];
    const res = await loadRun(makeRun(specs), {
      ...base,
      concurrency: 1,
      fetchImpl: fakeFetch(specs),
      onPartial: (v) => views.push([...v.scalars.get("loss").step]),
      onProgress: (p) => progress.push(`${p.filesDone}/${p.files}`),
    });
    expect(views).toEqual([[1], [1, 2], [1, 2, 3]]);
    expect([...res.scalars.get("loss").step]).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toBe("3/3");
  });

  it("shows the curves of a single big file before it has been read to the end", async () => {
    const bytes = evFile(...Array.from({ length: 3000 }, (_, i) => [i, i]));
    const fetchImpl = async () => {
      let at = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (at >= bytes.length) return { done: true };
              await new Promise((r) => setTimeout(r, 1));
              const value = bytes.subarray(at, (at += 20000));
              return { done: false, value };
            },
            releaseLock() {},
          }),
        },
      };
    };
    const lengths = [];
    const specs = [{ bytes }];
    const res = await loadRun(makeRun(specs), {
      ...base,
      fetchImpl,
      onPartial: (v) => lengths.push(v.scalars.get("loss")?.step.length ?? 0),
      progressEveryBytes: 20000,
    });
    expect(lengths.length).toBeGreaterThan(1);
    expect(lengths[0]).toBeGreaterThan(0);
    expect(lengths[0]).toBeLessThan(3000); // a view while the file was still coming in
    expect(lengths.every((l, i) => i === 0 || l >= lengths[i - 1])).toBe(true);
    expect(res.scalars.get("loss").step.length).toBe(3000);
  });

  it("never holds more points than the run budget, however many files are read at once", async () => {
    const specs = Array.from({ length: 8 }, (_, i) => ({ bytes: evFile(...Array.from({ length: 10 }, (_, k) => [i * 100 + k, k])), delay: 2 }));
    for (const concurrency of [1, 3, 8]) {
      const res = await loadRun(makeRun(specs.map((s, i) => ({ ...s, id: `${concurrency}-${i}` }))), { ...base, concurrency, maxRunPoints: 25, fetchImpl: fakeFetch(specs) });
      expect(res.scalars.get("loss").step.length).toBeLessThanOrEqual(25);
      expect(res.warnings.some((w) => /limit/.test(w))).toBe(true);
    }
  });

  it("with one file at a time the budget is used exactly, and files after it are not read", async () => {
    const specs = Array.from({ length: 6 }, (_, i) => ({ bytes: evFile(...Array.from({ length: 10 }, (_, k) => [i * 100 + k, k])) }));
    const stats = { active: 0, max: 0, calls: 0 };
    const res = await loadRun(makeRun(specs), { ...base, concurrency: 1, maxRunPoints: 25, fetchImpl: fakeFetch(specs, stats) });
    expect(res.scalars.get("loss").step.length).toBe(25);
    expect(stats.calls).toBe(3); // the third file ran the budget out; the other three were never requested
  });

  it("stops downloading a file as soon as the budget is spent", async () => {
    const bytes = evFile(...Array.from({ length: 3000 }, (_, i) => [i, i]));
    let at = 0;
    const cancel = vi.fn();
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (at >= bytes.length ? { done: true } : { done: false, value: bytes.subarray(at, (at += 5000)) }),
          cancel,
          releaseLock() {},
        }),
      },
    });
    const res = await loadRun(makeRun([{ bytes, id: "budget-single" }]), { ...base, fetchImpl, maxRunPoints: 100 });
    expect(res.scalars.get("loss").step.length).toBe(100);
    expect(at).toBeLessThan(bytes.length); // it did not read to the end
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps the files it could read and reports the one it could not", async () => {
    const specs = [{ bytes: evFile([1, 1]) }, { status: 500 }, { bytes: evFile([2, 2]) }];
    const res = await loadRun(makeRun(specs), { ...base, fetchImpl: fakeFetch(specs) });
    expect([...res.scalars.get("loss").step]).toEqual([1, 2]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/HTTP 500/);
  });

  it("flags a file that stops in the middle of a record, and keeps its readable part", async () => {
    const whole = evFile([1, 1], [2, 2]);
    const specs = [{ bytes: whole.subarray(0, whole.length - 6) }];
    const res = await loadRun(makeRun(specs), { ...base, fetchImpl: fakeFetch(specs) });
    expect([...res.scalars.get("loss").step]).toEqual([1]);
    expect(res.warnings[0]).toMatch(/cut off/);
  });

  it("fails when no file at all can be read", async () => {
    const specs = [{ status: 404 }, { status: 404 }];
    await expect(loadRun(makeRun(specs), { ...base, fetchImpl: fakeFetch(specs) })).rejects.toThrow(/HTTP 404/);
  });

  it("stops on an aborted signal", async () => {
    const specs = [{ bytes: evFile([1, 1]), delay: 10 }, { bytes: evFile([2, 2]), delay: 10 }];
    const ctl = new AbortController();
    ctl.abort();
    await expect(loadRun(makeRun(specs), { ...base, signal: ctl.signal, fetchImpl: fakeFetch(specs) })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads trainer_state.json through json()", async () => {
    const specs = [{ json: { log_history: [{ step: 5, loss: 1.5 }] } }];
    const run = makeRun(specs, "trainer_state");
    const res = await loadRun(run, { ...base, fetchImpl: fakeFetch(specs) });
    expect([...res.scalars.get("train/loss").value]).toEqual([1.5]);
  });

  it("answers a second request for the same run from memory", async () => {
    const specs = [{ bytes: evFile([1, 1]) }];
    const run = makeRun(specs);
    run.files[0].oid = "memory-test";
    const fetchImpl = fakeFetch(specs);
    const a = await loadRun(run, { ...base, fetchImpl });
    const b = await loadRun(run, { ...base, fetchImpl });
    expect(b).toBe(a);
    expect(fetchImpl.stats.calls).toBe(1);
    expect(runKey(run)).toContain("memory-test");
  });
});
