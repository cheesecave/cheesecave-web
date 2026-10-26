// A tiny protobuf + TFRecord encoder: just what a TensorBoard event file contains.
// Shared by the parser and the loader tests.


export const enc = new TextEncoder();
export const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
export const varint = (n) => {
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Uint8Array.from(out);
};
export const key = (field, wire) => varint(field * 8 + wire);
export const lenField = (field, bytes) => cat(key(field, 2), varint(bytes.length), bytes);
export const strField = (field, s) => lenField(field, enc.encode(s));
export const f32 = (x) => new Uint8Array(new Float32Array([x]).buffer);
export const f64 = (x) => new Uint8Array(new Float64Array([x]).buffer);

export const metadata = (plugin) => lenField(9, lenField(1, strField(1, plugin)));
export const simpleValue = (tag, v) => lenField(1, cat(strField(1, tag), key(2, 5), f32(v)));
// TF2 style: a `tensor` holding a float scalar, plugin name only when asked
export const tensorValue = (tag, v, { plugin = "scalars", packed = true } = {}) =>
  lenField(
    1,
    cat(
      strField(1, tag),
      plugin ? metadata(plugin) : new Uint8Array(0),
      lenField(8, cat(key(1, 0), varint(1), packed ? lenField(5, f32(v)) : cat(key(5, 5), f32(v)))),
    ),
  );
export const imageValue = (tag) => lenField(1, cat(strField(1, tag), lenField(4, cat(key(1, 0), varint(2)))));
export const event = ({ wall = 1000, step = 0, values = [], emptySummary = false, fileVersion = null }) =>
  cat(
    key(1, 1),
    f64(wall),
    key(2, 0),
    varint(step),
    fileVersion ? strField(3, fileVersion) : new Uint8Array(0),
    values.length ? lenField(5, cat(...values)) : emptySummary ? lenField(5, new Uint8Array(0)) : new Uint8Array(0),
  );
// u64le length, a crc slot (not checked by the reader), the data, a crc slot
export const record = (data) => {
  const len = new Uint8Array(8);
  new DataView(len.buffer).setUint32(0, data.length, true);
  return cat(len, new Uint8Array(4), data, new Uint8Array(4));
};
export const file = (...events) => cat(...events.map(record));

