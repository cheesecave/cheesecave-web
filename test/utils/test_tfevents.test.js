import { describe, expect, it } from "vitest";

import { cat, enc, event, f64, file, imageValue, key, lenField, record, simpleValue, tensorValue, varint } from "../helpers/tfevents-bytes";
import { mergeSeries, readEventFile, settleSeries, singleChunk } from "@/utils/tfevents";

async function* inPieces(bytes, size) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

describe("readEventFile", () => {
  it("reads simple_value scalars with step and wall time", async () => {
    const bytes = file(
      event({ fileVersion: "brain.Event:2" }),
      event({ wall: 10, step: 1, values: [simpleValue("loss", 0.5), simpleValue("acc", 1)] }),
      event({ wall: 20, step: 2, values: [simpleValue("loss", 0.25)] }),
    );
    const { scalars, stats } = await readEventFile(singleChunk(bytes));
    expect([...scalars.keys()].sort()).toEqual(["acc", "loss"]);
    expect([...scalars.get("loss").step]).toEqual([1, 2]);
    expect([...scalars.get("loss").wall]).toEqual([10, 20]);
    expect([...scalars.get("loss").value]).toEqual([0.5, 0.25]);
    expect(stats).toMatchObject({ records: 3, truncated: false, emptyEvents: 0 });
    expect(stats.wallStart).toBe(10); // the earliest wall time of any event, the file_version event (1000) included
  });

  it("reads TF2 tensor scalars, and remembers the plugin of a tag whose later events have no metadata", async () => {
    const bytes = file(
      event({ step: 1, values: [tensorValue("train/loss", 2)] }),
      event({ step: 2, values: [tensorValue("train/loss", 1.5, { plugin: "" })] }),
      event({ step: 3, values: [tensorValue("train/loss", 1.25, { plugin: "", packed: false })] }),
    );
    const { scalars, other } = await readEventFile(singleChunk(bytes));
    expect([...scalars.get("train/loss").value]).toEqual([2, 1.5, 1.25]);
    expect(other.size).toBe(0);
  });

  it("lists what it does not draw instead of failing on it", async () => {
    const bytes = file(
      event({ step: 5, values: [imageValue("samples")] }),
      event({ step: 6, values: [tensorValue("notes", 0, { plugin: "text" })] }),
      event({ step: 7, values: [simpleValue("loss", 1)] }),
    );
    const { scalars, other } = await readEventFile(singleChunk(bytes));
    expect(scalars.has("loss")).toBe(true);
    expect(other.get("samples")).toMatchObject({ kind: "image", count: 1, firstStep: 5 });
    expect(other.get("notes")).toMatchObject({ kind: "tensor", plugin: "text" });
  });

  it("counts events with an empty summary and keeps going", async () => {
    const bytes = file(event({ step: 1, emptySummary: true }), event({ step: 2, values: [simpleValue("x", 3)] }));
    const { scalars, stats } = await readEventFile(singleChunk(bytes));
    expect(stats.emptyEvents).toBe(1);
    expect([...scalars.get("x").value]).toEqual([3]);
  });

  it("gives the same answer however the bytes are cut into chunks", async () => {
    const bytes = file(
      event({ step: 1, values: [simpleValue("a", 1), tensorValue("b", 2)] }),
      event({ step: 2, values: [simpleValue("a", 3)] }),
    );
    const whole = await readEventFile(singleChunk(bytes));
    for (const size of [1, 2, 3, 7, 13, 64]) {
      const cut = await readEventFile(inPieces(bytes, size));
      expect([...cut.scalars.get("a").value]).toEqual([...whole.scalars.get("a").value]);
      expect([...cut.scalars.get("b").value]).toEqual([...whole.scalars.get("b").value]);
      expect(cut.stats.records).toBe(whole.stats.records);
    }
  });

  it("skips a record above maxRecordBytes without buffering it, and carries on", async () => {
    const big = event({ step: 1, values: [imageValue("huge")] });
    const bytes = file(event({ step: 0, values: [simpleValue("a", 1)] }), big, event({ step: 2, values: [simpleValue("a", 2)] }));
    const { scalars, stats } = await readEventFile(inPieces(bytes, 5), { maxRecordBytes: big.length - 1 });
    expect([...scalars.get("a").value]).toEqual([1, 2]);
    expect(stats).toMatchObject({ skippedRecords: 1, skippedBytes: big.length, truncated: false });
  });

  it("marks a file that ends inside a record as truncated and keeps what it read", async () => {
    const bytes = file(event({ step: 1, values: [simpleValue("a", 1)] }), event({ step: 2, values: [simpleValue("a", 2)] }));
    const { scalars, stats } = await readEventFile(singleChunk(bytes.subarray(0, bytes.length - 9)));
    expect([...scalars.get("a").value]).toEqual([1]);
    expect(stats.truncated).toBe(true);
  });

  it("stops keeping points past its limits and says how many it dropped", async () => {
    const bytes = file(...Array.from({ length: 50 }, (_, i) => event({ step: i, values: [simpleValue("a", i), simpleValue(`t${i % 5}`, i)] })));
    const capped = await readEventFile(singleChunk(bytes), { maxPoints: 40 });
    expect([...capped.scalars.values()].reduce((n, s) => n + s.step.length, 0)).toBe(40);
    expect(capped.stats.droppedPoints).toBe(60);
    const fewTags = await readEventFile(singleChunk(bytes), { maxTags: 3 });
    expect(fewTags.scalars.size).toBe(3);
    expect(fewTags.stats.droppedPoints).toBeGreaterThan(0);
    expect((await readEventFile(singleChunk(bytes))).stats.droppedPoints).toBe(0);
  });

  it("marks bytes that are not an event file as truncated, with the reason", async () => {
    const junk = record(Uint8Array.from([0x0f, 0x00]));
    const { scalars, stats } = await readEventFile(singleChunk(junk));
    expect(scalars.size).toBe(0);
    expect(stats.truncated).toBe(true);
    expect(stats.error).toMatch(/wire type/);
    const hugeLength = new Uint8Array(12);
    new DataView(hugeLength.buffer).setUint32(4, 5, true); // a length above 2^32: a misaligned read
    expect((await readEventFile(singleChunk(hugeLength))).stats.truncated).toBe(true);
  });

  it("reports progress and honours an aborted signal", async () => {
    const bytes = file(...Array.from({ length: 4000 }, (_, i) => event({ step: i, values: [simpleValue("a", i)] })));
    const seen = [];
    await readEventFile(inPieces(bytes, 4096), { onProgress: (p) => seen.push(p.bytes), progressEveryBytes: 1024 });
    expect(seen.length).toBeGreaterThan(0);
    const ctl = new AbortController();
    ctl.abort();
    await expect(readEventFile(inPieces(bytes, 4096), { signal: ctl.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("limits on untrusted input", () => {
  it("bounds the inventory of tags it does not draw, and a tag name of any length", async () => {
    const images = Array.from({ length: 50 }, (_, i) => event({ step: i, values: [imageValue(`img${i}`)] }));
    const capped = await readEventFile(singleChunk(file(...images)), { maxTags: 10 });
    expect(capped.other.size).toBe(10);
    expect(capped.stats.droppedPoints).toBe(40);
    const longName = "x".repeat(5000);
    const { scalars, stats } = await readEventFile(singleChunk(file(event({ step: 1, values: [simpleValue(longName, 1), simpleValue("ok", 2)] }))));
    expect([...scalars.keys()]).toEqual(["ok"]);
    expect(stats.droppedPoints).toBe(1);
  });

  it("stops reading when the run's shared budget is spent", async () => {
    const bytes = file(...Array.from({ length: 200 }, (_, i) => event({ step: i, values: [simpleValue("a", i)] })));
    const budget = { left: 30 };
    const first = await readEventFile(singleChunk(bytes), { budget });
    expect([...first.scalars.get("a").step].length).toBe(30);
    expect(first.stats.budgetSpent).toBe(true);
    expect(first.stats.records).toBeLessThan(200); // it stopped, it did not read on and drop
    const second = await readEventFile(singleChunk(bytes), { budget });
    expect(second.scalars.size).toBe(0); // nothing is left for the next file
  });
});

describe("hostile input", () => {
  // the record's last bytes are a varint with its continuation bit set, the CRC slot after it is 0xFF too, and the
  // file ends there: a reader that does not stop at the record's end runs off the buffer (an endless loop)
  const hostile = (data) => {
    const len = new Uint8Array(8);
    new DataView(len.buffer).setUint32(0, data.length, true);
    return cat(len, Uint8Array.of(0xff, 0xff, 0xff, 0xff), data, Uint8Array.of(0xff, 0xff, 0xff, 0xff));
  };

  it("stops at the end of the record when a varint never ends", async () => {
    const data = cat(key(1, 1), f64(1), key(2, 0), Uint8Array.of(0x80)); // a step whose varint is cut by the record's end
    const { stats } = await readEventFile(singleChunk(hostile(data)));
    expect(stats.truncated).toBe(true);
    expect(stats.error).toMatch(/varint/);
  });

  it("refuses a varint longer than ten bytes", async () => {
    const data = cat(key(2, 0), new Uint8Array(12).fill(0xff));
    const { stats } = await readEventFile(singleChunk(record(data)));
    expect(stats.truncated).toBe(true);
    expect(stats.error).toMatch(/varint/);
  });

  it("refuses a field that claims to run past its record", async () => {
    const data = cat(key(5, 2), varint(1000), enc.encode("short")); // a summary of 1000 bytes inside a 7-byte record
    const { stats } = await readEventFile(singleChunk(record(data)));
    expect(stats.truncated).toBe(true);
    expect(stats.error).toMatch(/past the record/);
    const nested = cat(key(5, 2), varint(11), lenField(1, cat(key(1, 2), varint(500)))); // a tag longer than the value around it
    expect((await readEventFile(singleChunk(record(nested)))).stats.truncated).toBe(true);
  });

  it("does not read a fixed-size field across the record's end", async () => {
    const data = cat(key(1, 1), Uint8Array.of(1, 2, 3)); // a double with 3 of its 8 bytes
    expect((await readEventFile(singleChunk(record(data)))).stats.truncated).toBe(true);
  });
});

describe("settleSeries", () => {
  const series = (steps, values = steps.map((s) => s * 10), wall = steps.map((s) => s + 0.5)) => ({ step: steps, wall, value: values });

  it("returns a clean ascending series untouched when it is already typed", () => {
    const s = { step: Float64Array.of(1, 2, 3), wall: Float64Array.of(1, 2, 3), value: Float64Array.of(4, 5, 6) };
    expect(settleSeries(s)).toBe(s);
  });

  it("converts plain arrays to Float64Array", () => {
    const out = settleSeries(series([1, 2]));
    expect(out.step).toBeInstanceOf(Float64Array);
    expect([...out.value]).toEqual([10, 20]);
  });

  it("keeps the later write of a step written twice", () => {
    const out = settleSeries({ step: [1, 2, 2, 3], wall: [1, 2, 9, 3], value: [10, 20, 99, 30] });
    expect([...out.step]).toEqual([1, 2, 3]);
    expect([...out.value]).toEqual([10, 99, 30]);
    expect([...out.wall]).toEqual([1, 9, 3]);
  });

  it("drops the orphaned points of a run that restarted from an earlier checkpoint", () => {
    // first attempt reached 100; the restart begins at 60 and stops at 70: 71..100 are orphans, as in TensorBoard
    const first = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const out = settleSeries({ step: [...first, 60, 70], wall: new Array(12).fill(0), value: [...first.map((s) => s), 600, 700] });
    expect([...out.step]).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect([...out.value]).toEqual([10, 20, 30, 40, 50, 600, 700]);
  });

  it("copes with an empty series", () => {
    expect(settleSeries(series([])).step.length).toBe(0);
  });
});

describe("mergeSeries", () => {
  it("concatenates per tag in file order, with one allocation per tag", () => {
    const f1 = new Map([["a", { step: Float64Array.of(1, 2), wall: Float64Array.of(0, 0), value: Float64Array.of(1, 2) }]]);
    const f2 = new Map([
      ["a", { step: Float64Array.of(2, 3), wall: Float64Array.of(0, 0), value: Float64Array.of(20, 30) }],
      ["b", { step: Float64Array.of(1), wall: Float64Array.of(0), value: Float64Array.of(7) }],
    ]);
    const merged = mergeSeries([f1, f2]);
    expect([...merged.get("a").step]).toEqual([1, 2, 2, 3]);
    expect([...merged.get("b").value]).toEqual([7]);
    // settled: the second file's write of step 2 wins
    expect([...settleSeries(merged.get("a")).value]).toEqual([1, 20, 30]);
  });
});