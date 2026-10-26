// src/utils/metrics-loader.js
//
// Load one run (see metrics-discovery.js) from a repository into scalar series, in
// the browser: stream each file through the /resolve/ URL (same-origin session cookie;
// the 302 to the object store answers CORS and Range), parse as it arrives, keep only
// the numbers. A tfevents file has no index, so every byte is read once; what is kept
// is tiny (measured: a 546 MB file whose 99.8 % is images leaves 0.8 MB of scalars).
//
// A run can be many files (bigscience/bloom: 117 event files, 281 MB, in one directory) and
// each file can be large, so:
//   - files are fetched `concurrency` at a time and parsed as they stream in
//   - a view of what has been read so far (`onPartial`) is offered while the rest loads, merged
//     exactly as the final result is (files in write order), so nothing jumps afterwards
//   - every finished file is cached on its own (metrics-cache.js): the next visit, or the
//     restart of a cancelled load, does not read it again
//   - one unreadable file does not lose the others: it is reported in `warnings`

import { hubFetch } from "@/errors";
import { getCached, putCached } from "@/utils/metrics-cache";
import { mergeSeries, readEventFile, settleSeries } from "@/utils/tfevents";
import { parseTrainerState } from "@/utils/trainer-state";

// bump when the parser's output changes: cached results of an older parser are not used
export const PARSER_VERSION = 2;

/** An async iterable over a fetch body; `Symbol.asyncIterator` on ReadableStream is not in every browser. */
export async function* streamChunks(body) {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // the consumer may stop early (a spent budget, an abort): do not keep downloading what nobody reads
    try {
      await reader.cancel?.();
    } catch {
      /* already closed */
    }
    reader.releaseLock?.();
  }
}

const memory = new Map(); // finished runs of this session: leaving the tab and coming back costs nothing

export const runKey = (run) => run.files.map((f) => `${f.path}:${f.size}:${f.oid ?? ""}`).join("|");
export const cachedRun = (run) => memory.get(runKey(run));

const fileKey = (repoKey, f) => `v${PARSER_VERSION}|${repoKey}|${f.path}|${f.size}|${f.oid ?? ""}`;

/** Merge finished files, given in write order, into settled series. */
function build(partsInOrder) {
  const merged = mergeSeries(partsInOrder.map((p) => p.scalars));
  for (const [tag, s] of merged) merged.set(tag, settleSeries(s));
  const other = new Map();
  for (const p of partsInOrder) {
    for (const [tag, info] of p.other) {
      const cur = other.get(tag);
      if (!cur) other.set(tag, { ...info });
      else {
        cur.count += info.count;
        cur.firstStep = Math.min(cur.firstStep, info.firstStep);
        cur.lastStep = Math.max(cur.lastStep, info.lastStep);
      }
    }
  }
  return { scalars: merged, other };
}

/**
 * @typedef {import("@/utils/metrics-discovery").MetricRun} MetricRun
 * @param {MetricRun} run
 * @param {object} options
 * @param {(path: string) => string} options.urlFor      absolute /resolve/ URL of a file of the repository
 * @param {string} options.repoKey                       identifies the repository in the cache key
 * @param {AbortSignal} [options.signal]
 * @param {(p: {bytes: number, total: number, filesDone: number, files: number}) => void} [options.onProgress]
 * @param {(view: {scalars: Map<string, object>, other: Map<string, object>}) => void} [options.onPartial]
 * @param {number} [options.concurrency=6]
 * @param {number} [options.partialEveryMs=500]
 * @param {number} [options.progressEveryBytes]  how often a streaming file reports (default: every MiB)
 * @param {number} [options.maxRunPoints=20000000]  stop starting files once this many points are held
 * @param {typeof fetch} [options.fetchImpl]
 * @param {boolean} [options.useCache=true]
 */
export async function loadRun(run, options) {
  const {
    urlFor,
    repoKey,
    signal,
    onProgress,
    onPartial,
    concurrency = 6,
    partialEveryMs = 500,
    progressEveryBytes,
    maxRunPoints = 20_000_000,
    fetchImpl = hubFetch,
    useCache = true,
  } = options;
  const mkey = runKey(run);
  if (memory.has(mkey)) return memory.get(mkey);

  const t0 = performance.now();
  const n = run.files.length;
  const parts = new Array(n); // per file, in write order
  const peeks = new Array(n); // for a file still being read: a function copying what it has so far
  const got = new Array(n).fill(0); // bytes read per file, for the progress bar
  const warnings = [];
  let filesDone = 0;
  let cachedFiles = 0;
  let skippedBytes = 0;
  let next = 0;
  let lastPartial = 0;
  let lastBuildMs = 0;

  // points kept by the whole run, finished files and files still streaming alike: one budget, shared
  const budget = { left: maxRunPoints };

  const report = () => {
    const bytes = got.reduce((a, b) => a + b, 0);
    onProgress?.({ bytes, total: run.bytes, filesDone, files: n });
  };

  const partial = (force = false) => {
    if (!onPartial) return;
    const now = performance.now();
    // a view costs a merge of everything read so far: space the views out by at least 4 merges,
    // so the cost stays a fifth of the loading time however many files there are
    if (!force && partialEveryMs > 0 && now - lastPartial < Math.max(partialEveryMs, lastBuildMs * 4)) return; // 0: unthrottled
    // finished files, and the part already read of the ones still streaming (a single big file gets curves early too)
    // Array.from, not parts.map: `parts` has holes for the files not finished, and map skips holes
    const done = Array.from({ length: n }, (_, i) => parts[i] ?? peeks[i]?.()).filter(Boolean);
    if (!done.length) return;
    const view = build(done);
    lastBuildMs = performance.now() - now;
    lastPartial = performance.now();
    onPartial(view);
  };

  async function readFile(i) {
    const file = run.files[i];
    const key = fileKey(repoKey, file);
    if (useCache) {
      const hit = await getCached(key);
      if (hit) {
        parts[i] = hit;
        got[i] = file.size;
        cachedFiles++;
        for (const s of hit.scalars.values()) budget.left -= s.step.length; // a cached file counts against the budget too
        return;
      }
    }
    const res = await fetchImpl(urlFor(file.path), { mode: "cors", credentials: "same-origin", signal });
    if (!res.ok) throw new Error(`${file.path}: HTTP ${res.status}`);
    let result;
    let final = true; // false for a file that ends in the middle of a record: it may still be written to
    if (run.kind === "trainer_state") {
      const scalars = new Map();
      for (const [tag, s] of parseTrainerState(await res.json())) scalars.set(tag, settleSeries(s));
      result = { scalars, other: new Map(), bytes: file.size, skippedBytes: 0 };
      got[i] = file.size;
    } else {
      const parsed = await readEventFile(streamChunks(res.body), {
        signal,
        budget,
        progressEveryBytes,
        onProgress: (p) => {
          got[i] = p.bytes;
          peeks[i] = p.peek;
          report();
          partial();
        },
      });
      if (parsed.stats.droppedPoints) warnings.push(`${file.path}: ${parsed.stats.droppedPoints.toLocaleString("en-US")} values not kept (limit)`);
      if (parsed.stats.truncated) {
        final = false;
        warnings.push(`${file.path}: cut off after ${parsed.stats.records} records${parsed.stats.error ? ` (${parsed.stats.error})` : ""}`);
      }
      result = { scalars: parsed.scalars, other: parsed.other, bytes: parsed.stats.bytes, skippedBytes: parsed.stats.skippedBytes };
      got[i] = parsed.stats.bytes;
    }
    if (useCache && final) await putCached(key, result);
    parts[i] = result;
    peeks[i] = null;
    skippedBytes += result.skippedBytes ?? 0;
  }

  async function worker() {
    while (next < n) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (budget.left <= 0) {
        warnings.push(`stopped reading: the limit of ${maxRunPoints.toLocaleString("en-US")} points is reached (${n - next} files not read)`);
        next = n;
        break;
      }
      const i = next++;
      try {
        await readFile(i);
        filesDone++;
        report();
        partial();
      } catch (e) {
        if (e?.name === "AbortError" || signal?.aborted) throw e;
        warnings.push(e?.message || String(e));
        filesDone++;
        report();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, worker));

  const done = parts.filter(Boolean);
  if (!done.length) throw new Error(warnings[0] || "nothing could be read");
  const result = {
    ...build(done),
    bytes: got.reduce((a, b) => a + b, 0),
    ms: performance.now() - t0,
    skippedBytes,
    cachedFiles,
    files: n,
    warnings,
  };
  if (!warnings.length) memory.set(mkey, result);
  return result;
}
