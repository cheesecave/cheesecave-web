// src/utils/metrics-discovery.js
//
// Which training logs does a repository hold? Pure functions over the flat file
// list (`tree?recursive=true`), no network.
//
// The Hub's TensorBoard tab treats the DIRECTORY of an event file as a "run" and
// merges the files of one directory (checked against the Hub's hosted TensorBoard:
// `runs/<name>` and the `runs/<name>/<timestamp>` sub-directory HF Trainer writes
// its hparams to are two runs; several files in one directory are one run, the
// later file wins for a step). We use the same definition so the two views agree.
//
// Sources recognised:
//   - TensorBoard event files   `*tfevents*`            (HF Trainer, Lightning, Keras, Flax, Megatron, ...)
//   - HF Trainer state          `trainer_state.json`    (the `log_history` list; no TensorBoard needed)

const TFEVENTS = /tfevents/;
const TRAINER_STATE = /(^|\/)trainer_state\.json$/;
const CHECKPOINT_DIR = /(^|\/)checkpoint-(\d+)\//;

export const dirname = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const basename = (p) => p.slice(p.lastIndexOf("/") + 1);

// events.out.tfevents.<unix start time>.<host>.<pid>.<n>[.v2]: files of a run sort by start time
function startTime(path) {
  const m = basename(path).match(/tfevents\.(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * @typedef {{path: string, size: number, oid?: string}} LogFile  (oid: content id, the cache key)
 * @typedef {{id: string, label: string, kind: "tfevents"|"trainer_state", files: LogFile[], bytes: number}} MetricRun
 */

/**
 * @param {Array<{type?: string, path: string, size?: number}>} entries  tree entries (directories are ignored)
 * @returns {{runs: MetricRun[], totalBytes: number}}
 */
export function findMetricRuns(entries) {
  const files = entries.filter((e) => (e.type ?? "file") === "file" && e.path);
  const byDir = new Map();
  for (const f of files) {
    if (!TFEVENTS.test(basename(f.path))) continue;
    const d = dirname(f.path);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push({ path: f.path, size: f.size ?? 0, oid: f.lfs?.oid ?? f.oid });
  }
  /** @type {MetricRun[]} */
  const runs = [];
  for (const [d, list] of byDir) {
    list.sort((a, b) => startTime(a.path) - startTime(b.path) || a.path.localeCompare(b.path));
    runs.push({
      id: d || "(root)",
      label: d || "(root)",
      kind: "tfevents",
      files: list,
      bytes: list.reduce((n, f) => n + f.size, 0),
    });
  }

  // trainer_state.json: Trainer writes one into every checkpoint directory, each one
  // a longer prefix of the same history. Keep the root one, else the latest checkpoint per parent.
  const best = new Map();
  for (const f of files) {
    if (!TRAINER_STATE.test(f.path)) continue;
    const m = f.path.match(CHECKPOINT_DIR);
    // `out/checkpoint-500/trainer_state.json` belongs to `out`; a file outside any checkpoint directory
    // outranks every checkpoint of its parent
    const key = m ? f.path.slice(0, m.index) : dirname(f.path);
    const rank = m ? Number(m[2]) : Infinity;
    const cur = best.get(key);
    if (!cur || rank > cur.rank) best.set(key, { rank, file: { path: f.path, size: f.size ?? 0, oid: f.lfs?.oid ?? f.oid } });
  }
  for (const [key, { file }] of best) {
    const where = key.replace(/\/$/, "") || "(root)";
    runs.push({
      id: `${where} · trainer_state`,
      label: `${where} · trainer_state.json`,
      kind: "trainer_state",
      files: [file],
      bytes: file.size,
    });
  }
  runs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return { runs, totalBytes: runs.reduce((n, r) => n + r.bytes, 0) };
}

/** `train/loss` -> "train"; a tag without a slash goes under "(other)" like TensorBoard's tag groups. */
export const tagGroup = (tag) => (tag.includes("/") ? tag.slice(0, tag.indexOf("/")) : "(other)");

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Names for a list of runs that tell them apart: the leading directories they all share are left off
 * (`lightning_logs/version_3` and `lightning_logs/version_4` become `version_3` and `version_4`),
 * but never the whole name. A single run keeps its full path.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function shortRunLabels(ids) {
  if (ids.length < 2) return [...ids];
  const parts = ids.map((id) => id.split("/"));
  const limit = Math.min(...parts.map((p) => p.length)) - 1; // always keep the last segment
  let common = 0;
  while (common < limit && parts.every((p) => p[common] === parts[0][common])) common++;
  return parts.map((p) => p.slice(common).join("/"));
}
