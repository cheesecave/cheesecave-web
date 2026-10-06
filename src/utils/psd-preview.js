// A preview image of a PSD without downloading it.
//
// A PSD ends with the flattened image Photoshop saves for programs that do
// not read layers, and often carries a small JPEG thumbnail in the header.
// Reading only those costs a fraction of the file (median 41%, and about
// 20 KB when the thumbnail is there). Order of preference:
//
//   1. the embedded thumbnail, when it is at least `minThumbSide` pixels;
//   2. the composite image, RLE-decoded row by row straight into a
//      box-filtered `maxSide` image: no full-size bitmap is ever built;
//   3. the thumbnail again, when the composite cannot be decoded.
//
// A `source` is `{ size, read(offset, length) }`: `size` is a number or a
// function returning one (sync or async), `read` returns a Uint8Array.
// An indexed tar member serves ranges, a zip member is read whole first.

export const PSD_HEAD_BYTES = 64 * 1024;
// A list preview never downloads more than this
export const LIST_PREVIEW_MAX_BYTES = 32 * 1024 * 1024;
export const LIST_PREVIEW_SIDE = 256;
// The page a PSD opens on: big enough to look at, still bounded in memory
export const DETAIL_PREVIEW_SIDE = 2048;

const SIGNATURE = 0x38425053; // "8BPS"
const RESOURCE_SIGNATURE = 0x3842494d; // "8BIM"
const THUMBNAIL_RESOURCE = 1036;
const THUMBNAIL_HEADER_BYTES = 28;
const COMPRESSION_RAW = 0;
const COMPRESSION_RLE = 1;
const MODE_GRAY = 1;
const MODE_RGB = 3;
const MODE_CMYK = 4;
// A PSD saved without "Maximize Compatibility" keeps a blank placeholder as its
// flattened image (a 70 MB file with 26 layers had a white one): a composite
// whose luminance barely varies is not a preview of anything
const BLANK_STD = 0.5;

export function isPsdPath(path) {
  return typeof path === "string" && /\.psd$/i.test(path);
}

function abortError() {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

const view = (bytes) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * @param {{size:number|(()=>number|Promise<number>), read:(offset:number,length:number)=>Promise<Uint8Array>}} source
 * @param {{maxSide?:number, maxBytes?:number, minThumbSide?:number, rowsPerOutput?:number, signal?:AbortSignal}} [options]
 *   `rowsPerOutput`: source rows averaged into one output row (0 = every row)
 * @returns {Promise<
 *   {kind:"thumbnail", jpeg:Uint8Array, width:number, height:number, docWidth:number, docHeight:number} |
 *   {kind:"composite", rgba:Uint8ClampedArray, width:number, height:number, docWidth:number, docHeight:number} |
 *   {kind:"too-large", bytes:number, docWidth:number, docHeight:number} |
 *   {kind:"blank", reason:string, docWidth:number, docHeight:number} |
 *   {kind:"unsupported", reason:string, docWidth:number, docHeight:number}>}
 */
export async function readPsdPreview(
  source,
  {
    maxSide = LIST_PREVIEW_SIDE,
    maxBytes = Infinity,
    minThumbSide = 0,
    rowsPerOutput = 3,
    signal,
  } = {},
) {
  const size =
    typeof source.size === "function" ? await source.size() : source.size;
  const read = (offset, length) => {
    if (signal?.aborted) throw abortError();
    return source.read(offset, Math.min(length, size - offset));
  };

  let head = await read(0, PSD_HEAD_BYTES);
  let v = view(head);
  if (head.length < 26 || v.getUint32(0) !== SIGNATURE)
    throw new Error("not a PSD");
  const large = v.getUint16(4) === 2;
  const channels = v.getUint16(12);
  const docHeight = v.getUint32(14);
  const docWidth = v.getUint32(18);
  const depth = v.getUint16(22);
  const mode = v.getUint16(24);
  const doc = { docWidth, docHeight };

  // Colour mode data, then the image resources: a big ICC profile can push
  // them past the first read
  let p = 26;
  p += 4 + v.getUint32(p);
  const resourcesEnd = p + 4 + v.getUint32(p);
  if (resourcesEnd + 12 > head.length) {
    head = await read(0, resourcesEnd + 12);
    v = view(head);
  }

  let thumbnail = null;
  for (let q = p + 4; q + 12 <= resourcesEnd; ) {
    if (v.getUint32(q) !== RESOURCE_SIGNATURE) break;
    const id = v.getUint16(q + 4);
    const nameLength = v.getUint8(q + 6);
    let data = q + 7 + nameLength + ((1 + nameLength) % 2);
    const length = v.getUint32(data);
    data += 4;
    if (data + length > resourcesEnd) break;
    if (id === THUMBNAIL_RESOURCE && length > THUMBNAIL_HEADER_BYTES) {
      thumbnail = {
        kind: "thumbnail",
        width: v.getUint32(data + 4),
        height: v.getUint32(data + 8),
        jpeg: head.slice(data + THUMBNAIL_HEADER_BYTES, data + length),
        ...doc,
      };
    }
    q = data + length + (length % 2);
  }
  if (thumbnail && Math.max(thumbnail.width, thumbnail.height) >= minThumbSide)
    return thumbnail;

  const fallback = (reason) =>
    thumbnail || { kind: "unsupported", reason, ...doc };
  if (![MODE_GRAY, MODE_RGB, MODE_CMYK].includes(mode))
    return fallback(`colour mode ${mode}`);
  if (depth !== 8 && depth !== 16) return fallback(`${depth}-bit`);

  const layerSectionLength = large
    ? Number(v.getBigUint64(resourcesEnd))
    : v.getUint32(resourcesEnd);
  const compositeStart = resourcesEnd + (large ? 8 : 4) + layerSectionLength;
  if (compositeStart + 2 > size)
    throw new Error("PSD is truncated before its composite image");
  const bytes = size - compositeStart;
  if (bytes > maxBytes) return { kind: "too-large", bytes, ...doc };

  const section = await read(compositeStart, bytes);
  const s = view(section);
  const compression = s.getUint16(0);
  if (compression !== COMPRESSION_RAW && compression !== COMPRESSION_RLE) {
    return fallback(`compression ${compression}`);
  }

  const planes = mode === MODE_CMYK ? 4 : mode === MODE_RGB ? 3 : 1;
  const bytesPerSample = depth / 8;
  const scale = Math.min(1, maxSide / Math.max(docWidth, docHeight));
  const width = Math.max(1, Math.round(docWidth * scale));
  const height = Math.max(1, Math.round(docHeight * scale));
  const rowStep =
    rowsPerOutput > 0
      ? Math.max(1, Math.floor(docHeight / height / rowsPerOutput))
      : 1;

  // Where each colour row starts. Planes are stored one after the other,
  // alpha and spot channels after the colour ones.
  const rowStart = new Float64Array(docHeight * planes);
  if (compression === COMPRESSION_RLE) {
    const countBytes = large ? 4 : 2;
    let offset = 2 + docHeight * channels * countBytes;
    for (let c = 0; c < planes; c++) {
      for (let y = 0; y < docHeight; y++) {
        rowStart[c * docHeight + y] = offset;
        const at = 2 + (c * docHeight + y) * countBytes;
        offset += large ? s.getUint32(at) : s.getUint16(at);
      }
    }
    if (offset > section.length)
      throw new Error("PSD composite image is truncated");
  } else {
    const rowBytes = docWidth * bytesPerSample;
    for (let i = 0; i < docHeight * planes; i++) rowStart[i] = 2 + i * rowBytes;
    if (rowStart[docHeight * planes - 1] + rowBytes > section.length) {
      throw new Error("PSD composite image is truncated");
    }
  }

  const column = new Uint16Array(docWidth);
  const columns = new Uint32Array(width);
  for (let x = 0; x < docWidth; x++) {
    column[x] = Math.min(width - 1, Math.floor((x * width) / docWidth));
    columns[column[x]]++;
  }
  const rows = new Uint32Array(height);
  const sums = new Uint32Array(width * height * planes);
  const row = new Uint8Array(docWidth * bytesPerSample);
  for (let y = 0; y < docHeight; y += rowStep) {
    const ty = Math.min(height - 1, Math.floor((y * height) / docHeight));
    rows[ty]++;
    for (let c = 0; c < planes; c++) {
      let at = rowStart[c * docHeight + y];
      if (compression === COMPRESSION_RAW) {
        row.set(section.subarray(at, at + row.length));
      } else {
        // PackBits: a count byte, then that many literals or one repeated byte
        for (let o = 0; o < row.length; ) {
          const n = s.getInt8(at++);
          if (n >= 0) {
            for (let k = 0; k <= n && o < row.length; k++)
              row[o++] = section[at++];
          } else if (n !== -128) {
            const value = section[at++];
            for (let k = 0; k <= -n && o < row.length; k++) row[o++] = value;
          }
        }
      }
      const base = ty * width * planes + c;
      for (let x = 0; x < docWidth; x++)
        sums[base + column[x] * planes] += row[x * bytesPerSample];
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const n = rows[ty] * columns[tx];
      const a = (ty * width + tx) * planes;
      const o = (ty * width + tx) * 4;
      if (mode === MODE_RGB) {
        rgba[o] = sums[a] / n;
        rgba[o + 1] = sums[a + 1] / n;
        rgba[o + 2] = sums[a + 2] / n;
      } else if (mode === MODE_GRAY) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = sums[a] / n;
      } else {
        // Adobe stores CMYK inverted (255 = no ink); without a colour profile
        // this is the plain multiply
        const k = sums[a + 3] / n / 255;
        rgba[o] = (sums[a] / n) * k;
        rgba[o + 1] = (sums[a + 1] / n) * k;
        rgba[o + 2] = (sums[a + 2] / n) * k;
      }
      rgba[o + 3] = 255;
    }
  }
  let sum = 0;
  let sumOfSquares = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const luminance =
      0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    sum += luminance;
    sumOfSquares += luminance * luminance;
  }
  const pixels = width * height;
  const mean = sum / pixels;
  if (Math.sqrt(Math.max(0, sumOfSquares / pixels - mean * mean)) < BLANK_STD) {
    return (
      thumbnail || {
        kind: "blank",
        reason: "the flattened image is a single colour",
        ...doc,
      }
    );
  }
  return { kind: "composite", rgba, width, height, ...doc };
}

/** A source over bytes already in memory (a zip member, a downloaded file). */
export function createBytesSource(bytes) {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}

/**
 * A source over a URL that honours Range. The first request learns the
 * size from Content-Range and doubles as the header read; a server that
 * ignores Range and answers 200 hands over the whole file once.
 */
export function createHttpRangeSource(url, { signal } = {}) {
  let total = null;
  let head = null;

  async function fetchRange(offset, length) {
    const response = await fetch(url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
      mode: "cors",
      credentials: "same-origin",
    });
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`HTTP ${response.status} reading ${url}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.status === 200) {
      total = bytes.length;
      head = bytes;
      return bytes.subarray(offset, offset + length);
    }
    const match = /\/(\d+)$/.exec(response.headers.get("content-range") || "");
    if (match) total = Number(match[1]);
    if (offset === 0 && !head) head = bytes;
    return bytes;
  }

  return {
    async size() {
      if (total === null) await fetchRange(0, PSD_HEAD_BYTES);
      if (total === null)
        throw new Error("size unknown: no Content-Range in the response");
      return total;
    },
    async read(offset, length) {
      if (head && offset + length <= head.length)
        return head.subarray(offset, offset + length);
      return fetchRange(
        offset,
        total === null ? length : Math.min(length, total - offset),
      );
    },
  };
}

/** Encode decoded pixels, to hand to an <img>. */
export async function rgbaToBlob(
  rgba,
  width,
  height,
  type = "image/png",
  quality,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context unavailable");
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas.toBlob produced null")),
      type,
      quality,
    );
  });
}
