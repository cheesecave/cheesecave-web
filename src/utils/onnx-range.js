// src/utils/onnx-range.js
//
// Reads the structure of an ONNX model with HTTP Range requests, never the
// whole file. ONNX is a protobuf (ModelProto) and protobuf writers emit fields in
// ascending field-number order, which gives the file a layout that is friendly to
// partial reads:
//
//   ModelProto   ir_version(1) producer(2..4) ... graph(7) opset_import(8) metadata_props(14)
//   GraphProto   node(1)*  name(2)  initializer(5)*  ...  input(11)* output(12)* value_info(13)*
//
// - the nodes come first, contiguous, small (the graph);
// - the initializers (the weights) are the bulk of the file, in the middle;
// - the inputs, outputs and intermediate shapes (value_info) are at the very end
//   of the graph, and the graph's length is in its prefix, so the end is exact.
//
// What this module does with that:
//   1. readStructure()  head + tail reads: model info, nodes, inputs/outputs,
//                       value_info. A handful of requests whatever the file size.
//   2. buildModel()     splices a *stripped* but valid ONNX out of those bytes (no
//                       weights), which a stock viewer such as Netron can open.
//   3. readWeights()    walks the initializers by their length prefixes. This is a
//                       chain: the position of the next one is only known once the
//                       previous header is read, so it costs about one request per
//                       tensor bigger than the read window. It runs in the
//                       background and reports progress.
//
// The reader asks for ranges of one URL; the browser follows the backend's 302 to
// the presigned object URL transparently, and later requests go straight to it.

const decoder = new TextDecoder();

export class OnnxFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "OnnxFormatError";
  }
}

export class OnnxFetchError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} reading ${url}`);
    this.name = "OnnxFetchError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ bytes */

export function concat(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function encodeVarint(value) {
  const out = [];
  let n = value;
  while (n >= 0x80) {
    out.push(n % 0x80 | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return Uint8Array.from(out);
}

function readVarint(buf, pos) {
  let result = 0;
  let multiplier = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new RangeError("truncated varint");
    const byte = buf[pos++];
    result += (byte & 0x7f) * multiplier;
    multiplier *= 128;
    if (byte < 0x80) return [result, pos];
  }
  throw new OnnxFormatError("varint longer than 10 bytes");
}

const str = (bytes) => decoder.decode(bytes);

/**
 * Walk the fields of a (possibly truncated) message held in memory. A
 * length-delimited field that runs past the end is yielded once with
 * `truncated: true` and the walk stops.
 */
function* iterFields(buf, start = 0, end = buf.length) {
  let pos = start;
  while (pos < end) {
    const fieldStart = pos;
    let tag;
    try {
      [tag, pos] = readVarint(buf, pos);
    } catch (error) {
      if (error instanceof RangeError) return;
      throw error;
    }
    const field = Math.floor(tag / 8);
    const wt = tag % 8;
    try {
      if (wt === 0) {
        let value;
        [value, pos] = readVarint(buf, pos);
        yield { field, wt, value, start: fieldStart, end: pos };
      } else if (wt === 2) {
        let len;
        [len, pos] = readVarint(buf, pos);
        if (pos + len > end) {
          yield { field, wt, len, truncated: true, start: fieldStart };
          return;
        }
        yield {
          field,
          wt,
          len,
          bytes: buf.subarray(pos, pos + len),
          start: fieldStart,
          end: pos + len,
        };
        pos += len;
      } else if (wt === 1 || wt === 5) {
        const size = wt === 1 ? 8 : 4;
        if (pos + size > end) return;
        yield {
          field,
          wt,
          bytes: buf.subarray(pos, pos + size),
          start: fieldStart,
          end: pos + size,
        };
        pos += size;
      } else {
        throw new OnnxFormatError(`unsupported protobuf wire type ${wt}`);
      }
    } catch (error) {
      if (error instanceof RangeError) return;
      throw error;
    }
  }
}

/* ----------------------------------------------------------------- reader */

/**
 * A range reader over one URL. `read(offset, length, { window })` returns the
 * bytes; a miss fetches `max(length, window)` so neighbouring reads are free.
 * `size` is known after the first read; `stats` counts requests and bytes.
 */
export function createRangeReader(
  url,
  { signal, fetchImpl = (...args) => fetch(...args), maxWindows = 24 } = {},
) {
  const stats = { requests: 0, bytes: 0 };
  let finalUrl = url;
  let size = null;
  let windows = [];

  async function request(start, end) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchImpl(finalUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
        mode: "cors",
        credentials: "same-origin",
      });
      // The presigned link may have expired during a long read: go back through
      // the backend once to get a fresh one.
      if (response.status === 403 && finalUrl !== url) {
        finalUrl = url;
        continue;
      }
      if (response.status !== 200 && response.status !== 206) {
        throw new OnnxFetchError(response.status, url);
      }
      if (finalUrl === url && response.url && response.url !== url) {
        finalUrl = response.url;
      }
      const buf = new Uint8Array(await response.arrayBuffer());
      stats.requests += 1;
      stats.bytes += buf.length;
      if (response.status === 206) {
        const match = /\/(\d+)$/.exec(
          response.headers.get("content-range") || "",
        );
        if (match) size = Number(match[1]);
        return { start, buf };
      }
      // The server ignored the Range header and sent the whole file.
      size = buf.length;
      return { start: 0, buf };
    }
    throw new OnnxFetchError(403, url);
  }

  function remember(window) {
    windows.push(window);
    if (windows.length > maxWindows) windows = windows.slice(-maxWindows);
  }

  function cached(offset, length) {
    for (let i = windows.length - 1; i >= 0; i--) {
      const w = windows[i];
      if (w.start <= offset && offset + length <= w.start + w.buf.length) {
        return w.buf.subarray(offset - w.start, offset - w.start + length);
      }
    }
    return null;
  }

  return {
    stats,
    get size() {
      return size;
    },
    get url() {
      return url;
    },
    async read(offset, length, { window = 65536 } = {}) {
      if (size === null) {
        const first = await request(0, Math.max(window, offset + length) - 1);
        remember(first);
      }
      const wanted = Math.min(length, size - offset);
      if (wanted <= 0) return new Uint8Array(0);
      const hit = cached(offset, wanted);
      if (hit) return hit;
      const span = Math.max(wanted, window);
      const end = Math.min(size, offset + span) - 1;
      const fetched = await request(offset, end);
      remember(fetched);
      return fetched.buf.subarray(
        offset - fetched.start,
        offset - fetched.start + wanted,
      );
    },
  };
}

/* ----------------------------------------------------------- field headers */

async function readHeader(reader, pos, window) {
  const buf = await reader.read(pos, Math.min(16, reader.size - pos), {
    window,
  });
  let tag;
  let p;
  [tag, p] = readVarint(buf, 0);
  const field = Math.floor(tag / 8);
  const wt = tag % 8;
  if (wt === 2) {
    let len;
    [len, p] = readVarint(buf, p);
    return {
      field,
      wt,
      start: pos,
      dataStart: pos + p,
      len,
      end: pos + p + len,
    };
  }
  if (wt === 0) {
    let value;
    [value, p] = readVarint(buf, p);
    return {
      field,
      wt,
      start: pos,
      dataStart: pos + p,
      len: 0,
      end: pos + p,
      value,
    };
  }
  if (wt === 1 || wt === 5) {
    const size = wt === 1 ? 8 : 4;
    return {
      field,
      wt,
      start: pos,
      dataStart: pos + p,
      len: size,
      end: pos + p + size,
    };
  }
  throw new OnnxFormatError(`unsupported protobuf wire type ${wt} at ${pos}`);
}

/* -------------------------------------------------------------- constants */

export const DATA_TYPES = {
  1: "float32",
  2: "uint8",
  3: "int8",
  4: "uint16",
  5: "int16",
  6: "int32",
  7: "int64",
  8: "string",
  9: "bool",
  10: "float16",
  11: "float64",
  12: "uint32",
  13: "uint64",
  14: "complex64",
  15: "complex128",
  16: "bfloat16",
  17: "float8e4m3fn",
  18: "float8e4m3fnuz",
  19: "float8e5m2",
  20: "float8e5m2fnuz",
  21: "uint4",
  22: "int4",
  23: "float4e2m1",
};

// Bytes per element, for the weight totals. Sub-byte types are packed two or
// four per byte.
const ELEMENT_BITS = {
  1: 32,
  2: 8,
  3: 8,
  4: 16,
  5: 16,
  6: 32,
  7: 64,
  9: 8,
  10: 16,
  11: 64,
  12: 32,
  13: 64,
  14: 64,
  15: 128,
  16: 16,
  17: 8,
  18: 8,
  19: 8,
  20: 8,
  21: 4,
  22: 4,
  23: 4,
};

// A node or tensor bigger than this is re-encoded without its payload when the
// stripped model is built (a Constant node can carry a 12 MB position cache).
const STRIP_THRESHOLD = 64 * 1024;
const NODE_PREFIX = 2048;
const NODE_WINDOW = 256 * 1024;
const TENSOR_HEAD = 2048;
const TAIL_FIELDS = new Set([10, 11, 12, 13, 14, 16]);

/* ------------------------------------------------------------ small parsers */

function parseOpset(bytes) {
  let domain = "";
  let version = null;
  for (const f of iterFields(bytes)) {
    if (f.field === 1) domain = str(f.bytes);
    else if (f.field === 2) version = f.value;
  }
  return { domain: domain || "ai.onnx", version };
}

function parseEntry(bytes) {
  let key = "";
  let value = "";
  for (const f of iterFields(bytes)) {
    if (f.field === 1) key = str(f.bytes);
    else if (f.field === 2) value = str(f.bytes);
  }
  return [key, value];
}

function parseNodePrefix(buf) {
  const node = { op: "", name: "", domain: "", inputs: [], outputs: [] };
  for (const f of iterFields(buf)) {
    if (f.truncated) break;
    if (f.field === 1) node.inputs.push(str(f.bytes));
    else if (f.field === 2) node.outputs.push(str(f.bytes));
    else if (f.field === 3) node.name = str(f.bytes);
    else if (f.field === 4) node.op = str(f.bytes);
    else if (f.field === 7) node.domain = str(f.bytes);
    else if (f.field === 5) continue;
  }
  return node;
}

function parseDimension(bytes) {
  for (const f of iterFields(bytes)) {
    if (f.field === 1) return f.value;
    if (f.field === 2) return str(f.bytes);
  }
  return null;
}

function parseValueInfo(bytes) {
  const info = { name: "", dataType: null, shape: null, kind: "tensor" };
  for (const f of iterFields(bytes)) {
    if (f.field === 1) info.name = str(f.bytes);
    else if (f.field === 2) {
      let tensor = null;
      for (const t of iterFields(f.bytes)) {
        if (t.field === 1) tensor = t.bytes;
        else if (t.field === 4 || t.field === 5 || t.field === 9) {
          info.kind =
            t.field === 4 ? "sequence" : t.field === 5 ? "map" : "optional";
        }
      }
      if (tensor) {
        for (const t of iterFields(tensor)) {
          if (t.field === 1) info.dataType = t.value;
          else if (t.field === 2) {
            info.shape = [];
            for (const d of iterFields(t.bytes)) {
              if (d.field === 1) info.shape.push(parseDimension(d.bytes));
            }
          }
        }
      }
    }
  }
  return info;
}

/**
 * The part of a TensorProto that says what it is, without its payload: dims,
 * data type, name, external-data entries. `descriptor` is the re-encoded tensor
 * with no data, ready to be spliced into a stripped model.
 */
export function parseTensorHead(buf) {
  const tensor = {
    name: "",
    dims: [],
    dataType: null,
    external: null,
    dataBytes: 0,
  };
  const kept = [];
  const entries = {};
  for (const f of iterFields(buf)) {
    if (f.truncated) {
      if (f.field === 9) tensor.dataBytes = f.len;
      break;
    }
    if (f.field === 1) {
      if (f.wt === 0) tensor.dims.push(f.value);
      else {
        let p = 0;
        while (p < f.bytes.length) {
          let v;
          [v, p] = readVarint(f.bytes, p);
          tensor.dims.push(v);
        }
      }
      kept.push(buf.subarray(f.start, f.end));
    } else if (f.field === 2) {
      tensor.dataType = f.value;
      kept.push(buf.subarray(f.start, f.end));
    } else if (f.field === 8) {
      tensor.name = str(f.bytes);
      kept.push(buf.subarray(f.start, f.end));
    } else if (f.field === 9) {
      tensor.dataBytes = f.len;
    } else if ([4, 5, 6, 7, 10].includes(f.field)) {
      tensor.dataBytes += f.len;
    } else if (f.field === 13) {
      const [key, value] = parseEntry(f.bytes);
      entries[key] = value;
      kept.push(buf.subarray(f.start, f.end));
    } else if (f.field === 14) {
      tensor.dataLocation = f.value;
      kept.push(buf.subarray(f.start, f.end));
    } else if (f.field === 3 || f.field === 12) {
      kept.push(buf.subarray(f.start, f.end));
    }
  }
  if (entries.location !== undefined) {
    tensor.external = {
      location: entries.location,
      offset: Number(entries.offset || 0),
      length: entries.length === undefined ? null : Number(entries.length),
    };
  }
  tensor.descriptor = concat(kept);
  return tensor;
}

export function elementCount(dims) {
  return dims.reduce((a, b) => a * b, 1);
}

/** Bytes a tensor would occupy, from its shape and type (not from the file). */
export function tensorBytes(dims, dataType) {
  const bits = ELEMENT_BITS[dataType];
  if (!bits) return null;
  return Math.ceil((elementCount(dims) * bits) / 8);
}

/* ----------------------------------------------------- stripping big nodes */

async function copyField(reader, field, window) {
  return reader.read(field.start, field.end - field.start, { window });
}

async function stripTensor(reader, start, end) {
  const parts = [];
  let pos = start;
  while (pos < end) {
    const f = await readHeader(reader, pos, 4096);
    pos = f.end;
    const payload = [4, 5, 6, 7, 9, 10].includes(f.field);
    if (payload && f.len > 1024) continue;
    if (f.len > STRIP_THRESHOLD) continue;
    parts.push(await copyField(reader, f, 4096));
  }
  return concat(parts);
}

async function stripAttribute(reader, start, end) {
  const parts = [];
  let pos = start;
  while (pos < end) {
    const f = await readHeader(reader, pos, 4096);
    pos = f.end;
    if (f.field === 5 && f.len > STRIP_THRESHOLD) {
      const body = await stripTensor(reader, f.dataStart, f.end);
      parts.push(Uint8Array.of(0x2a), encodeVarint(body.length), body);
    } else if (f.len > STRIP_THRESHOLD) {
      // A big subgraph or string: leave it out
      continue;
    } else {
      parts.push(await copyField(reader, f, 4096));
    }
  }
  return concat(parts);
}

async function stripNode(reader, header) {
  const parts = [];
  let pos = header.dataStart;
  while (pos < header.end) {
    const f = await readHeader(reader, pos, 4096);
    pos = f.end;
    if (f.field === 5 && f.len > STRIP_THRESHOLD) {
      const body = await stripAttribute(reader, f.dataStart, f.end);
      parts.push(Uint8Array.of(0x2a), encodeVarint(body.length), body);
    } else if (f.len > STRIP_THRESHOLD) {
      continue;
    } else {
      parts.push(await copyField(reader, f, 4096));
    }
  }
  const body = concat(parts);
  return concat([Uint8Array.of(0x0a), encodeVarint(body.length), body]);
}

/* ------------------------------------------------------------- the tail */

function chainEndsAt(buf, from) {
  let pos = from;
  while (pos < buf.length) {
    let tag;
    try {
      [tag, pos] = readVarint(buf, pos);
    } catch {
      return false;
    }
    const field = Math.floor(tag / 8);
    if (tag % 8 !== 2 || !TAIL_FIELDS.has(field)) return false;
    let len;
    try {
      [len, pos] = readVarint(buf, pos);
    } catch {
      return false;
    }
    pos += len;
    if (pos > buf.length) return false;
  }
  return pos === buf.length;
}

/** Earliest offset in `buf` where a run of input/output/value_info fields ends exactly at the end. */
function earliestTailStart(buf) {
  for (let i = 0; i < buf.length; i++) {
    const tag = buf[i];
    // 0x52 doc_string, 0x5a input, 0x62 output, 0x6a value_info, 0x72 quantization, 0x82 metadata
    if (
      tag !== 0x52 &&
      tag !== 0x5a &&
      tag !== 0x62 &&
      tag !== 0x6a &&
      tag !== 0x72 &&
      tag !== 0x82
    ) {
      continue;
    }
    if (chainEndsAt(buf, i)) return i;
  }
  return -1;
}

async function readTail(reader, lowerBound, graphEnd) {
  let window = 1024 * 1024;
  for (let attempt = 0; attempt < 8; attempt++) {
    const start = Math.max(lowerBound, graphEnd - window);
    const buf = await reader.read(start, graphEnd - start, { window: 0 });
    const found = earliestTailStart(buf);
    // Every field boundary of the run validates, so the earliest match is the
    // start of the run only if there is data before it that failed to match.
    if (found >= 0 && (found > 4096 || start === lowerBound)) {
      return { start: start + found, bytes: buf.subarray(found) };
    }
    if (start === lowerBound) break;
    window *= 4;
  }
  throw new OnnxFormatError(
    "could not find the input/output section at the end of the graph",
  );
}

/* ------------------------------------------------------- structure reader */

/**
 * Reads the model header, the nodes and the tail (inputs, outputs, value_info).
 * Returns what the Summary needs plus the byte pieces the stripped model is made of.
 */
export async function readStructure(reader, { signal, onProgress } = {}) {
  const progress = (phase, detail) => onProgress && onProgress(phase, detail);
  // The first read learns the file size from Content-Range.
  await reader.read(0, 1, { window: 64 * 1024 });
  const check = () => {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  };

  progress("header");
  const model = {
    irVersion: null,
    producer: "",
    producerVersion: "",
    domain: "",
    modelVersion: null,
    doc: "",
  };
  let graph = null;
  let pos = 0;
  while (pos < reader.size) {
    const h = await readHeader(reader, pos, 64 * 1024);
    check();
    if (h.field === 7 && h.wt === 2) {
      graph = h;
      break;
    }
    if (h.wt === 0 && h.field === 1) model.irVersion = h.value;
    else if (h.wt === 0 && h.field === 5) model.modelVersion = h.value;
    else if (h.wt === 2 && h.len < 65536) {
      const bytes = await reader.read(h.dataStart, h.len, {
        window: 64 * 1024,
      });
      if (h.field === 2) model.producer = str(bytes);
      else if (h.field === 3) model.producerVersion = str(bytes);
      else if (h.field === 4) model.domain = str(bytes);
      else if (h.field === 6) model.doc = str(bytes);
    }
    pos = h.end;
  }
  if (!graph)
    throw new OnnxFormatError("no graph in this file; is it an ONNX model?");
  const prefix = await reader.read(0, graph.start, { window: 64 * 1024 });

  // What follows the graph: opset_import, metadata_props, functions
  const opsets = [];
  const metadata = {};
  let functions = 0;
  const restParts = [];
  pos = graph.end;
  while (pos < reader.size) {
    const h = await readHeader(reader, pos, 256 * 1024);
    if (h.wt === 2 && h.len > STRIP_THRESHOLD) {
      if (h.field === 25) functions += 1;
      pos = h.end;
      continue;
    }
    const bytes = await reader.read(h.start, h.end - h.start, {
      window: 256 * 1024,
    });
    restParts.push(bytes);
    if (h.wt === 2) {
      const body = bytes.subarray(h.dataStart - h.start);
      if (h.field === 8) opsets.push(parseOpset(body));
      else if (h.field === 14) {
        const [key, value] = parseEntry(body);
        metadata[key] = value;
      } else if (h.field === 25) functions += 1;
    }
    pos = h.end;
  }
  const rest = concat(restParts);

  // Nodes at the head of the graph
  progress("nodes");
  const nodeChunks = [];
  const ops = new Map();
  let nodeCount = 0;
  let graphName = "";
  let big = 0;
  pos = graph.dataStart;
  let firstOther = graph.end;
  while (pos < graph.end) {
    const h = await readHeader(reader, pos, NODE_WINDOW);
    if (h.field === 1) {
      let chunk;
      let body;
      if (h.len <= STRIP_THRESHOLD) {
        chunk = await reader.read(h.start, h.end - h.start, {
          window: NODE_WINDOW,
        });
        body = chunk.subarray(h.dataStart - h.start);
      } else {
        big += 1;
        chunk = await stripNode(reader, h);
        const [, bodyStart] = readVarint(chunk, 1);
        body = chunk.subarray(bodyStart);
      }
      nodeChunks.push(chunk);
      const node = parseNodePrefix(body.subarray(0, NODE_PREFIX));
      const key =
        node.domain && node.domain !== "ai.onnx"
          ? `${node.op} (${node.domain})`
          : node.op;
      ops.set(key, (ops.get(key) || 0) + 1);
      nodeCount += 1;
      if (nodeCount % 500 === 0) {
        progress("nodes", { nodes: nodeCount });
        check();
      }
    } else if (h.field === 2) {
      const bytes = await reader.read(h.start, h.end - h.start, {
        window: NODE_WINDOW,
      });
      nodeChunks.push(bytes);
      graphName = str(bytes.subarray(h.dataStart - h.start));
    } else {
      firstOther = h.start;
      break;
    }
    pos = h.end;
  }
  progress("nodes", { nodes: nodeCount });

  // The tail: inputs, outputs, value_info
  progress("tail");
  const tail = await readTail(reader, firstOther, graph.end);
  const inputs = [];
  const outputs = [];
  const valueInfo = [];
  for (const f of iterFields(tail.bytes)) {
    if (f.field === 11) inputs.push(parseValueInfo(f.bytes));
    else if (f.field === 12) outputs.push(parseValueInfo(f.bytes));
    else if (f.field === 13) valueInfo.push(parseValueInfo(f.bytes));
  }

  return {
    size: reader.size,
    model,
    opsets,
    metadata,
    functions,
    graph: {
      name: graphName,
      nodeCount,
      bigNodes: big,
      ops: [...ops.entries()].sort((a, b) => b[1] - a[1]),
      inputs,
      outputs,
      valueInfoCount: valueInfo.length,
      valueInfo,
    },
    initializerRegion: { start: firstOther, end: tail.start },
    pieces: { prefix, nodeChunks, tail: tail.bytes, rest },
  };
}

/* --------------------------------------------------------------- weights */

/**
 * Walks the initializers between `region.start` and `region.end`. Each header is
 * read from the position the previous one ended at, so this is serial: about one
 * request per tensor bigger than `window`. `onBatch(tensors, done)` is called as
 * tensors arrive; pass `resume` (the tensors so far) to continue a cancelled walk.
 */
export async function readWeights(
  reader,
  region,
  { signal, onBatch, window = 16 * 1024, resume = [] } = {},
) {
  const tensors = [...resume];
  let pos = region.start;
  if (resume.length) pos = resume[resume.length - 1].next;
  let lastReport = Date.now();
  while (pos < region.end) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const h = await readHeader(reader, pos, window);
    if (h.field === 5) {
      const head = await reader.read(
        h.dataStart,
        Math.min(h.len, TENSOR_HEAD),
        { window },
      );
      const tensor = parseTensorHead(head);
      tensor.next = h.end;
      tensor.offset = h.start;
      tensors.push(tensor);
    }
    pos = h.end;
    if (onBatch && (Date.now() - lastReport > 150 || pos >= region.end)) {
      lastReport = Date.now();
      onBatch(tensors, {
        position: pos - region.start,
        total: region.end - region.start,
      });
    }
  }
  if (onBatch)
    onBatch(tensors, {
      position: region.end - region.start,
      total: region.end - region.start,
    });
  return tensors;
}

export function summarizeWeights(tensors) {
  const byType = new Map();
  let parameters = 0;
  let externalBytes = 0;
  let inlineBytes = 0;
  const files = new Map();
  for (const t of tensors) {
    const n = elementCount(t.dims);
    parameters += n;
    const type = DATA_TYPES[t.dataType] || `type ${t.dataType}`;
    const entry = byType.get(type) || { tensors: 0, parameters: 0 };
    entry.tensors += 1;
    entry.parameters += n;
    byType.set(type, entry);
    if (t.external) {
      const bytes = t.external.length ?? tensorBytes(t.dims, t.dataType) ?? 0;
      externalBytes += bytes;
      const file = files.get(t.external.location) || {
        location: t.external.location,
        tensors: 0,
        bytes: 0,
        end: 0,
      };
      file.tensors += 1;
      file.bytes += bytes;
      file.end = Math.max(file.end, t.external.offset + bytes);
      files.set(t.external.location, file);
    } else {
      inlineBytes += t.dataBytes;
    }
  }
  return {
    count: tensors.length,
    parameters,
    types: [...byType.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.parameters - a.parameters),
    externalBytes,
    inlineBytes,
    files: [...files.values()].sort((a, b) =>
      a.location < b.location ? -1 : 1,
    ),
  };
}

/* --------------------------------------------------------------- the model */

/**
 * The stripped model: the nodes, the tail and (optionally) the weight descriptors,
 * with no weight data. It is a valid ONNX file a stock viewer can open.
 */
export function buildModel(structure, tensors = null) {
  const { prefix, nodeChunks, tail, rest } = structure.pieces;
  const parts = [...nodeChunks];
  if (tensors) {
    for (const t of tensors) {
      parts.push(
        Uint8Array.of(0x2a),
        encodeVarint(t.descriptor.length),
        t.descriptor,
      );
    }
  }
  parts.push(tail);
  const graph = concat(parts);
  return concat([
    prefix,
    Uint8Array.of(0x3a),
    encodeVarint(graph.length),
    graph,
    rest,
  ]);
}

/* ---------------------------------------------------------- external data */

/** The URL of a file next to the model, for an external-data `location`. */
export function siblingUrl(modelUrl, location) {
  const url = new URL(
    modelUrl,
    typeof window === "undefined" ? "http://localhost" : window.location.href,
  );
  const parts = url.pathname.split("/");
  parts.pop();
  const encoded = location.split("/").map(encodeURIComponent).join("/");
  url.pathname = `${parts.join("/")}/${encoded}`;
  url.search = "";
  return url.toString();
}
