// Builds tiny, valid PSD / PSB files for tests: header, image resources
// (with an optional embedded JPEG thumbnail), an empty layer-and-mask
// section, and the composite image data (raw or PackBits RLE). Real PSDs
// are private artwork and far too big to commit.

const MAGIC = [0x38, 0x42, 0x50, 0x53]; // "8BPS"

const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const u64 = (n) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const pushAll = (out, items) => {
  for (const item of items) out.push(item);
};
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/** PackBits: runs of 3+ equal bytes become run packets, the rest literals. */
export function packBits(row, { noop = false } = {}) {
  const out = noop ? [0x80] : [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && row[i + run] === row[i] && run < 128) run++;
    if (run >= 3) {
      out.push((257 - run) & 0xff, row[i]);
      i += run;
      continue;
    }
    let end = i;
    while (
      end < row.length &&
      end - i < 128 &&
      !(
        end + 2 < row.length &&
        row[end] === row[end + 1] &&
        row[end] === row[end + 2]
      )
    ) {
      end++;
    }
    if (end === i) end = i + 1;
    out.push(end - i - 1, ...row.slice(i, end));
    i = end;
  }
  return out;
}

/** An image resource block: 8BIM, id, pascal name (even padded), data (even padded). */
export function resourceBlock(id, data, name = "") {
  const nameBytes = [name.length, ...ascii(name)];
  if (nameBytes.length % 2) nameBytes.push(0);
  const body = [...data];
  if (body.length % 2) body.push(0);
  return [
    ...ascii("8BIM"),
    ...u16(id),
    ...nameBytes,
    ...u32(data.length),
    ...body,
  ];
}

/** Resource 1036: the JPEG thumbnail, behind its 28-byte header. */
export function thumbnailResource({ width, height, jpeg }) {
  const header = [
    ...u32(1),
    ...u32(width),
    ...u32(height),
    ...u32(width * 3),
    ...u32(width * height * 3),
    ...u32(jpeg.length),
    ...u16(24),
    ...u16(1),
  ];
  return resourceBlock(1036, [...header, ...jpeg]);
}

/**
 * @param {object} o
 * @param {number} o.width
 * @param {number} o.height
 * @param {number} [o.mode=3]             1 gray, 3 RGB, 4 CMYK, anything else is "unsupported"
 * @param {number} [o.depth=8]            8 or 16
 * @param {boolean} [o.psb=false]
 * @param {0|1|2} [o.compression=1]       0 raw, 1 RLE, 2 zip (not decoded; filler bytes)
 * @param {number} [o.extraChannels=0]    alpha planes after the colour ones
 * @param {(x:number,y:number)=>number[]} [o.pixel]  one value per colour plane
 * @param {number[][]} [o.resources]      pre-built resource blocks
 * @param {number} [o.layerBytes=0]       size of the (zeroed) layer-and-mask body
 * @param {boolean} [o.noop=false]        put a 0x80 no-op byte at the start of each RLE row
 * @param {number} [o.truncateBy=0]       drop this many bytes from the end
 */
export function buildPsd(o) {
  const {
    width,
    height,
    mode = 3,
    depth = 8,
    psb = false,
    compression = 1,
    extraChannels = 0,
    resources = [],
    layerBytes = 0,
    noop = false,
    truncateBy = 0,
  } = o;
  const colour = mode === 4 ? 4 : mode === 3 ? 3 : 1;
  const channels = colour + extraChannels;
  const bpp = depth / 8;
  const pixel =
    o.pixel ||
    ((x, y) =>
      Array.from(
        { length: colour },
        (_, c) => (x * 16 + y * 8 + c * 40) & 0xff,
      ));

  const planes = [];
  for (let c = 0; c < channels; c++) {
    const rows = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const v = c < colour ? pixel(x, y)[c] : 255;
        if (bpp === 2) row.push(...u16(v));
        else row.push(v);
      }
      rows.push(row);
    }
    planes.push(rows);
  }

  const out = [
    ...MAGIC,
    ...u16(psb ? 2 : 1),
    0,
    0,
    0,
    0,
    0,
    0,
    ...u16(channels),
    ...u32(height),
    ...u32(width),
    ...u16(depth),
    ...u16(mode),
  ];
  out.push(...u32(0)); // colour mode data
  const res = resources.flat();
  out.push(...u32(res.length));
  pushAll(out, res);
  const layerBody = new Array(layerBytes).fill(0);
  out.push(...(psb ? u64(layerBody.length) : u32(layerBody.length)));
  pushAll(out, layerBody);

  out.push(...u16(compression));
  if (compression === 0) {
    for (const rows of planes) for (const row of rows) pushAll(out, row);
  } else if (compression === 1) {
    const packed = planes.map((rows) =>
      rows.map((row) => packBits(row, { noop })),
    );
    for (const rows of packed)
      for (const p of rows) out.push(...(psb ? u32(p.length) : u16(p.length)));
    for (const rows of packed) for (const p of rows) pushAll(out, p);
  } else {
    out.push(...new Array(32).fill(0xaa));
  }
  const bytes = new Uint8Array(out);
  return truncateBy ? bytes.subarray(0, bytes.length - truncateBy) : bytes;
}

/** A source that serves `bytes` the way createHttpRangeSource does, counting reads. */
export function countingSource(bytes) {
  const reads = [];
  return {
    reads,
    size: bytes.length,
    async read(offset, length) {
      reads.push([offset, length]);
      return bytes.subarray(offset, offset + length);
    },
  };
}
