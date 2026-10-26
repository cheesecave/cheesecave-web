// src/utils/tfevents.js
//
// Pure-client reader for TensorBoard event files (`events.out.tfevents.*`).
// No dependency: the format is two thin layers.
//
//   1. TFRecord framing:  u64le length | u32 crc(length) | data | u32 crc(data)
//   2. `Event` protobuf (tensorboard/compat/proto/event.proto) holding a `Summary`
//      whose `Value`s are what the TensorBoard tabs show.
//
// Only the fields the viewer needs are decoded; everything else is skipped by
// wire type. CRCs are not checked (a wrong length shows up as a failed parse).
//
// Streaming: `readEventFile` takes any async iterable of Uint8Array (a
// `fetch().body`, `Blob.stream()`, a Node stream), so a large file is never held
// in memory; records bigger than `maxRecordBytes` (graphs, big images) are skipped
// without being buffered.
//
// What is extracted:
//   - scalars, in both encodings: `simple_value` (PyTorch, tensorboardX, Lightning,
//     HF Trainer) and `tensor` with plugin "scalars" (TF2 / Flax / Keras)
//   - an inventory of the other kinds (image, histogram, audio, text, hparams, ...)
//     so the UI can say what is in the file without decoding it
//
// Not done: purging of steps after a restart (`SessionLog.START`), CRC checks,
// image / histogram / text decoding.

const utf8 = new TextDecoder("utf-8");

// tensorflow DataType enum values that can hold a scalar
const DT_FLOAT = 1;
const DT_DOUBLE = 2;
const DT_INT32 = 3;
const DT_INT64 = 9;
const DT_BOOL = 10;

// ---- minimal protobuf reading over one Uint8Array --------------------------

let P = 0; // cursor shared by the helpers below (single-threaded, reset per use)
// End of the record being decoded. An event file is untrusted input (anyone can put one in a public
// repository) and its CRCs are not checked, so nothing may be read, or looped over, past this point:
// a varint with the continuation bit set at the end of the buffer used to be an endless loop.
let E = 0;

function varint(b) {
  let r = 0;
  let m = 1;
  for (let n = 0; n < 10; n++) {
    if (P >= E) throw new Error("truncated varint");
    const x = b[P++];
    r += (x & 127) * m;
    if (x < 128) return r;
    m *= 128;
  }
  throw new Error("varint longer than 10 bytes");
}

/** Move the cursor n bytes forward, inside the record. (Not `skip`: readEventFile has a stream skipper of that name.) */
function advance(n) {
  if (!(n >= 0) || P + n > E) throw new Error("field runs past the record");
  P += n;
}

function skipField(b, wire) {
  if (wire === 0) varint(b);
  else if (wire === 1) advance(8);
  else if (wire === 5) advance(4);
  else if (wire === 2) {
    const l = varint(b); // not `P += varint(b)`: the left side would be read before varint moves P
    advance(l);
  }
  else throw new Error(`unsupported protobuf wire type ${wire}`);
}

function readFloat32(b, p) {
  if (p + 4 > E) throw new Error("field runs past the record");
  return new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true);
}

function readFloat64(b, p) {
  if (p + 8 > E) throw new Error("field runs past the record");
  return new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true);
}

function str(b, from, len) {
  if (from + len > E) throw new Error("field runs past the record");
  return utf8.decode(b.subarray(from, from + len));
}

// TensorProto -> number, for a scalar-shaped numeric tensor (NaN otherwise)
function tensorScalar(b, start, end) {
  P = start;
  let dtype = 0;
  let content = null;
  let value = NaN;
  while (P < end) {
    const key = varint(b);
    const f = key >>> 3;
    const w = key & 7;
    if (f === 1 && w === 0) dtype = varint(b);
    else if (f === 4 && w === 2) {
      const l = varint(b);
      content = [P, l];
      advance(l);
    } else if (f === 5) {
      // float_val: packed (w=2) or a lone fixed32 (w=5)
      if (w === 2) {
        const l = varint(b);
        if (l >= 4) value = readFloat32(b, P);
        advance(l);
      } else {
        value = readFloat32(b, P);
        advance(4);
      }
    } else if (f === 6) {
      if (w === 2) {
        const l = varint(b);
        if (l >= 8) value = readFloat64(b, P);
        advance(l);
      } else {
        value = readFloat64(b, P);
        advance(8);
      }
    } else if (f === 7 || f === 10 || f === 11) {
      // int_val / int64_val / bool_val
      if (w === 2) {
        const l = varint(b);
        const stop = P + l;
        if (l > 0) value = varint(b);
        P = stop;
      } else value = varint(b);
    } else skipField(b, w);
  }
  if (content && !Number.isFinite(value)) {
    const [p, l] = content;
    if (dtype === DT_FLOAT && l === 4) value = readFloat32(b, p);
    else if (dtype === DT_DOUBLE && l === 8) value = readFloat64(b, p);
    else if (dtype === DT_INT32 && l === 4)
      value = new DataView(b.buffer, b.byteOffset + p, 4).getInt32(0, true);
    else if (dtype === DT_BOOL && l === 1) value = b[p];
    else if (dtype === DT_INT64 && l === 8)
      value = Number(new DataView(b.buffer, b.byteOffset + p, 8).getBigInt64(0, true));
  }
  return value;
}

// SummaryMetadata -> plugin name ("" when absent)
function pluginName(b, start, end) {
  P = start;
  while (P < end) {
    const key = varint(b);
    const f = key >>> 3;
    const w = key & 7;
    if (f === 1 && w === 2) {
      // plugin_data { plugin_name = 1; content = 2 }
      const l = varint(b);
      const stop = P + l;
      while (P < stop) {
        const k2 = varint(b);
        if (k2 >>> 3 === 1 && (k2 & 7) === 2) {
          const n = varint(b);
          return str(b, P, n);
        }
        skipField(b, k2 & 7);
      }
      P = stop;
    } else skipField(b, w);
  }
  return "";
}

// ---- the reader --------------------------------------------------------------

/**
 * @typedef {{step: number[], wall: number[], value: number[]}} ScalarSeries
 * @typedef {{kind: string, plugin: string, count: number, firstStep: number, lastStep: number}} TagInfo
 */

/**
 * Read one event file.
 *
 * @param {AsyncIterable<Uint8Array>} chunks
 * @param {object} [options]
 * @param {number} [options.maxRecordBytes=4194304]  records larger than this are skipped unread
 * @param {(p: {bytes: number, records: number, peek: () => {scalars: Map<string, ScalarSeries>, other: Map<string, TagInfo>}}) => void} [options.onProgress]
 *   `peek()` copies what has been read so far (write order, not settled): ask for it when you will use it
 * @param {number} [options.progressEveryBytes=1048576]  how often onProgress fires
 * @param {number} [options.maxPoints=5000000]  scalar points kept from this file; the rest are counted, not stored
 * @param {number} [options.maxTags=20000]       tags kept from this file: scalar tags, and separately the tags of other kinds
 * @param {number} [options.maxTagLength=1024]   a tag name longer than this (bytes) is dropped: a name can be as long as its record
 * @param {{left: number}} [options.budget]      points a whole run may keep, shared by every file read for it; when it is spent the read stops
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{
 *   scalars: Map<string, ScalarSeries>,
 *   other: Map<string, TagInfo>,
 *   stats: {records: number, bytes: number, emptyEvents: number, skippedRecords: number,
 *           skippedBytes: number, truncated: boolean, wallStart: number, wallEnd: number},
 * }>}
 */
export async function readEventFile(chunks, options = {}) {
  const {
    maxRecordBytes = 4 * 1024 * 1024,
    onProgress,
    signal,
    progressEveryBytes = 1 << 20,
    maxPoints = 5_000_000,
    maxTags = 20_000,
    maxTagLength = 1024,
    budget = null,
  } = options;
  const it = chunks[Symbol.asyncIterator]();

  const scalars = new Map();
  const other = new Map();
  const pluginOfTag = new Map(); // TF2 writes the metadata on the first event of a tag only
  const stats = {
    records: 0,
    bytes: 0,
    emptyEvents: 0,
    skippedRecords: 0,
    skippedBytes: 0,
    truncated: false,
    droppedPoints: 0, // beyond the limits (points, tags, tag length, run budget): an event file is untrusted input, a viewer's memory is not unlimited
    budgetSpent: false,
    wallStart: Infinity,
    wallEnd: -Infinity,
  };

  let buf = new Uint8Array(0);
  let pos = 0;
  let done = false;

  // make at least n bytes available at buf[pos..]; false if the stream ended first
  async function need(n) {
    while (buf.length - pos < n) {
      if (done) return false;
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const r = await it.next();
      if (r.done) {
        done = true;
        return buf.length - pos >= n;
      }
      const c = r.value;
      stats.bytes += c.length;
      if (pos === buf.length) {
        buf = c;
        pos = 0;
      } else {
        const rest = buf.length - pos;
        const nb = new Uint8Array(rest + c.length);
        nb.set(buf.subarray(pos), 0);
        nb.set(c, rest);
        buf = nb;
        pos = 0;
      }
    }
    return true;
  }

  // drop n bytes without keeping them
  async function skip(n) {
    while (n > 0) {
      if (pos === buf.length) {
        if (done) return false;
        const r = await it.next();
        if (r.done) {
          done = true;
          return false;
        }
        stats.bytes += r.value.length;
        buf = r.value;
        pos = 0;
      }
      const t = Math.min(n, buf.length - pos);
      pos += t;
      n -= t;
    }
    return true;
  }

  function note(tag, kind, plugin, step) {
    let e = other.get(tag);
    if (!e) {
      if (other.size >= maxTags) {
        stats.droppedPoints++; // the inventory of what is not drawn is bounded too
        return;
      }
      e = { kind, plugin, count: 0, firstStep: step, lastStep: step };
      other.set(tag, e);
    }
    e.count++;
    if (step < e.firstStep) e.firstStep = step;
    if (step > e.lastStep) e.lastStep = step;
  }

  let kept = 0;
  function addScalar(tag, step, wall, value) {
    let s = scalars.get(tag);
    if (budget && budget.left <= 0) {
      stats.budgetSpent = true;
      stats.droppedPoints++;
      return;
    }
    if (kept >= maxPoints || (!s && scalars.size >= maxTags)) {
      stats.droppedPoints++;
      return;
    }
    kept++;
    if (budget) budget.left--;
    if (!s) {
      s = { n: 0, step: new Float64Array(64), wall: new Float64Array(64), value: new Float64Array(64) };
      scalars.set(tag, s);
    } else if (s.n === s.step.length) {
      const cap = s.n * 2;
      for (const k of ["step", "wall", "value"]) {
        const bigger = new Float64Array(cap);
        bigger.set(s[k]);
        s[k] = bigger;
      }
    }
    const i = s.n++;
    s.step[i] = step;
    s.wall[i] = wall;
    s.value[i] = value;
  }

  function readValue(b, start, end, step, wall) {
    P = start;
    let tag = "";
    let tagTooLong = false;
    let simple = NaN;
    let hasSimple = false;
    let kind = "";
    let tensor = null;
    let plugin = "";
    while (P < end) {
      const key = varint(b);
      const f = key >>> 3;
      const w = key & 7;
      if (f === 1 && w === 2) {
        const l = varint(b);
        if (l > maxTagLength) {
          if (P + l > E) throw new Error("field runs past the record");
          tagTooLong = true;
        } else tag = str(b, P, l);
        advance(l);
      } else if (f === 2 && w === 5) {
        simple = readFloat32(b, P);
        hasSimple = true;
        advance(4);
      } else if (f === 8 && w === 2) {
        const l = varint(b);
        tensor = [P, P + l];
        advance(l);
      } else if (f === 9 && w === 2) {
        const l = varint(b);
        const from = P;
        plugin = pluginName(b, from, from + l); // moves the shared cursor
        P = from + l;
      } else if ((f === 4 || f === 5 || f === 6 || f === 3) && w === 2) {
        kind = f === 4 ? "image" : f === 5 ? "histogram" : f === 6 ? "audio" : "histogram";
        const l = varint(b);
        advance(l);
      } else skipField(b, w);
    }
    if (tagTooLong) {
      stats.droppedPoints++;
      return;
    }
    if (plugin && (pluginOfTag.has(tag) || pluginOfTag.size < maxTags)) pluginOfTag.set(tag, plugin);
    else plugin = pluginOfTag.get(tag) || "";

    if (hasSimple) return addScalar(tag, step, wall, simple);
    if (tensor) {
      if (plugin === "scalars" || plugin === "") {
        const v = tensorScalar(b, tensor[0], tensor[1]);
        if (Number.isFinite(v) || plugin === "scalars") return addScalar(tag, step, wall, v);
      }
      return note(tag, "tensor", plugin || "tensor", step);
    }
    if (kind) return note(tag, kind, plugin || kind, step);
    return note(tag, "empty", plugin, step);
  }

  function readEvent(b, start, end) {
    P = start;
    E = end;
    let wall = NaN;
    let step = 0;
    let summary = null;
    let other_ = "";
    while (P < end) {
      const key = varint(b);
      const f = key >>> 3;
      const w = key & 7;
      if (f === 1 && w === 1) {
        wall = readFloat64(b, P);
        advance(8);
      } else if (f === 2 && w === 0) step = varint(b);
      else if (f === 5 && w === 2) {
        const l = varint(b);
        summary = [P, P + l];
        advance(l);
      } else if ((f === 3 || f === 4 || f === 6 || f === 7 || f === 8 || f === 9) && w === 2) {
        other_ = { 3: "file_version", 4: "graph_def", 6: "log_message", 7: "session_log", 8: "run_metadata", 9: "meta_graph_def" }[f];
        const l = varint(b);
        advance(l);
      } else skipField(b, w);
    }
    if (Number.isFinite(wall)) {
      if (wall < stats.wallStart) stats.wallStart = wall;
      if (wall > stats.wallEnd) stats.wallEnd = wall;
    }
    if (!summary) {
      if (other_ && other_ !== "file_version") note(`(${other_})`, other_, other_, step);
      return;
    }
    if (summary[1] === summary[0]) {
      stats.emptyEvents++;
      return;
    }
    P = summary[0];
    while (P < summary[1]) {
      const key = varint(b);
      if (key >>> 3 === 1 && (key & 7) === 2) {
        const l = varint(b);
        const stop = P + l;
        readValue(b, P, stop, step, wall);
        P = stop;
      } else skipField(b, key & 7);
    }
  }

  const trimmed = () => {
    const out = new Map();
    for (const [tag, s] of scalars) {
      // finished files hold trimmed arrays already; the one being read holds spare capacity
      out.set(tag, s.n === undefined ? s : { step: s.step.slice(0, s.n), wall: s.wall.slice(0, s.n), value: s.value.slice(0, s.n) });
    }
    return out;
  };
  const peek = () => ({ scalars: trimmed(), other: new Map([...other].map(([k, v]) => [k, { ...v }])) });

  let lastReport = 0;
  try {
    for (;;) {
      if (!(await need(12))) {
        if (buf.length - pos > 0) stats.truncated = true;
        break;
      }
      const lo = buf[pos] + buf[pos + 1] * 256 + buf[pos + 2] * 65536 + buf[pos + 3] * 16777216;
      const hi = buf[pos + 4] + buf[pos + 5] * 256 + buf[pos + 6] * 65536 + buf[pos + 7] * 16777216;
      const len = hi * 4294967296 + lo;
      if (hi > 0 || len > 1 << 30) {
        stats.truncated = true; // misaligned or not an event file
        break;
      }
      if (len > maxRecordBytes) {
        pos += 12;
        stats.skippedRecords++;
        stats.skippedBytes += len;
        if (!(await skip(len + 4))) {
          stats.truncated = true;
          break;
        }
        continue;
      }
      if (!(await need(12 + len + 4))) {
        stats.truncated = true;
        break;
      }
      try {
        readEvent(buf, pos + 12, pos + 12 + len);
      } catch (e) {
        stats.truncated = true;
        stats.error = String(e && e.message ? e.message : e);
        break;
      }
      stats.records++;
      pos += 12 + len + 4;
      if (stats.budgetSpent) break; // nothing more can be kept: stop reading, and let the caller stop the download
      if (onProgress && stats.bytes - lastReport > progressEveryBytes) {
        lastReport = stats.bytes;
        onProgress({ bytes: stats.bytes, records: stats.records, peek });
      }
    }
  } finally {
    // stopped before the end (a spent budget, an abort, an error): close the source so the download stops too
    if (!done) {
      try {
        await it.return?.();
      } catch {
        /* the source is gone already */
      }
    }
  }
  if (stats.wallStart === Infinity) stats.wallStart = stats.wallEnd = NaN;
  // trim the spare capacity: what is kept is exactly the points read
  for (const [tag, s] of scalars) {
    scalars.set(tag, { step: s.step.slice(0, s.n), wall: s.wall.slice(0, s.n), value: s.value.slice(0, s.n) });
  }
  return { scalars, other, stats };
}

/**
 * Concatenate the series of several files of one run, in the order the files were written.
 * One allocation per series, however many files (117 for bloom): copying the growing result
 * once per file would be quadratic.
 *
 * @param {Array<Map<string, ScalarSeries>>} parts per-file scalars in write order
 * @returns {Map<string, {step: Float64Array, wall: Float64Array, value: Float64Array}>} NOT yet settled
 */
export function mergeSeries(parts) {
  const per = new Map();
  for (const part of parts) {
    for (const [tag, s] of part) {
      let list = per.get(tag);
      if (!list) per.set(tag, (list = []));
      list.push(s);
    }
  }
  const out = new Map();
  for (const [tag, list] of per) {
    const n = list.reduce((a, s) => a + s.step.length, 0);
    const m = { step: new Float64Array(n), wall: new Float64Array(n), value: new Float64Array(n) };
    let at = 0;
    for (const s of list) {
      m.step.set(s.step, at);
      m.wall.set(s.wall, at);
      m.value.set(s.value, at);
      at += s.step.length;
    }
    out.set(tag, m);
  }
  return out;
}

/**
 * Make a series what TensorBoard shows. Points are in write order; a point whose step is not above
 * the one before it means the run went back (a duplicate write of a step, or a restart from an
 * earlier checkpoint), and every earlier point with a step at or above it is dropped as orphaned.
 * Measured against the Hub's TensorBoard on bigscience/bloom (117 files, restarts from
 * earlier checkpoints: a file starting at step 90696 after earlier files had written up to 90752
 * removes exactly the 6 points between) and on an HF Trainer run (`epoch` logged twice at
 * evaluation steps: the later wall time wins, the count drops by the duplicates).
 * The result is strictly ascending in step. Input and output may be plain arrays or typed
 * arrays; the output is always Float64Array.
 *
 * @param {{step: ArrayLike<number>, wall: ArrayLike<number>, value: ArrayLike<number>}} s
 */
export function settleSeries(s) {
  const n = s.step.length;
  let clean = true;
  for (let i = 1; i < n; i++) {
    if (!(s.step[i] > s.step[i - 1])) {
      clean = false;
      break;
    }
  }
  if (clean) {
    return s.step instanceof Float64Array && s.wall instanceof Float64Array && s.value instanceof Float64Array
      ? s
      : { step: Float64Array.from(s.step), wall: Float64Array.from(s.wall), value: Float64Array.from(s.value) };
  }
  const keep = new Uint32Array(n); // a stack of input positions
  let top = 0;
  for (let i = 0; i < n; i++) {
    while (top > 0 && s.step[keep[top - 1]] >= s.step[i]) top--;
    keep[top++] = i;
  }
  const out = { step: new Float64Array(top), wall: new Float64Array(top), value: new Float64Array(top) };
  for (let k = 0; k < top; k++) {
    out.step[k] = s.step[keep[k]];
    out.wall[k] = s.wall[keep[k]];
    out.value[k] = s.value[keep[k]];
  }
  return out;
}

/** Wrap one Uint8Array as the async iterable `readEventFile` expects (tests, small files). */
export async function* singleChunk(bytes) {
  yield bytes;
}
