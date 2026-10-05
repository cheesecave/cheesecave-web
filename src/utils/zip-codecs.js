// src/utils/zip-codecs.js
//
// Decoders for the ZIP compression methods zip.js does not ship (it has
// stored, deflate and deflate64). zip-archive.js imports this module only
// when an opened archive uses one of these methods, so the decoders stay
// out of the bundle for ordinary zips.
//
// zip.js hands each DecompressionStream the entry's
// { compressionMethod, rawBitFlag, uncompressedSize }, after decryption.

import { registerCodec } from "@zip.js/zip.js";
import { Decompress as ZstdDecompress } from "fzstd";
import { decompress as lzmaAloneDecompress } from "lzma1";
// UMD bundle: the named export is only reachable through the default import.
import xzDecompress from "xz-decompress";
import Bunzip from "@/vendor/seek-bzip/index.js";
import { expand } from "@/vendor/hwzip/expand.js";
import { explode } from "@/vendor/hwzip/explode.js";
import { unshrink } from "@/vendor/hwzip/unshrink.js";

const LZMA_EOS_FLAG = 0x2;
const IMPLODE_LARGE_WINDOW_FLAG = 0x2;
const IMPLODE_LITERAL_TREE_FLAG = 0x4;

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// The legacy and block-based decoders work on whole buffers: collect the
// member, decode once on flush. Preview-sized members only.
function bufferedStream(decode) {
  return class extends TransformStream {
    constructor(format, options = {}) {
      const chunks = [];
      super({
        transform: (chunk) => {
          chunks.push(chunk);
        },
        flush: (controller) => {
          controller.enqueue(decode(concat(chunks), options));
        },
      });
    }
  };
}

// Method 14 stores [2-byte SDK version][2-byte props size][props][raw LZMA].
// Rebuild the 13-byte ".lzma alone" header: 5 props bytes, then the 64-bit
// size, or all 0xFF when GP bit 1 says the stream ends with an EOS marker.
export function decodeZipLzma(data, { uncompressedSize, rawBitFlag = 0 }) {
  const propsSize = data[2] | (data[3] << 8);
  const header = new Uint8Array(13);
  header.set(data.subarray(4, 9));
  if (rawBitFlag & LZMA_EOS_FLAG) header.fill(0xff, 5);
  else
    new DataView(header.buffer).setBigUint64(5, BigInt(uncompressedSize), true);
  return lzmaAloneDecompress(concat([header, data.subarray(4 + propsSize)]));
}

// PKZIP 1.01/1.02 wrote Implode streams that only decode with the
// "PK 1.01 quirk" flag; retry with it when the strict read fails or does
// not consume the whole input (same fallback as hwzip and 7-Zip).
export function decodeImplode(data, { uncompressedSize, rawBitFlag = 0 }) {
  const largeWindow = Boolean(rawBitFlag & IMPLODE_LARGE_WINDOW_FLAG);
  const literalTree = Boolean(rawBitFlag & IMPLODE_LITERAL_TREE_FLAG);
  try {
    const strict = explode(
      data,
      uncompressedSize,
      largeWindow,
      literalTree,
      false,
    );
    if (strict.bytesRead === data.length) return strict.output;
  } catch {
    // fall through to the quirk mode
  }
  return explode(data, uncompressedSize, largeWindow, literalTree, true).output;
}

class ZstdStream extends TransformStream {
  constructor() {
    let decoder;
    super({
      start: (controller) => {
        decoder = new ZstdDecompress((chunk) => controller.enqueue(chunk));
      },
      transform: (chunk) => decoder.push(chunk),
      flush: () => decoder.push(new Uint8Array(0), true),
    });
  }
}

class XzStream {
  constructor() {
    const passThrough = new TransformStream();
    this.writable = passThrough.writable;
    this.readable = new xzDecompress.XzReadableStream(passThrough.readable);
  }
}

export const ZIP_CODECS = [
  [
    1,
    "shrink",
    bufferedStream(
      (data, { uncompressedSize }) => unshrink(data, uncompressedSize).output,
    ),
  ],
  // Reduce with compression factor 1..4 is stored as methods 2..5.
  ...[2, 3, 4, 5].map((method) => [
    method,
    "reduce",
    bufferedStream(
      (data, { uncompressedSize, compressionMethod }) =>
        expand(data, uncompressedSize, compressionMethod - 1).output,
    ),
  ]),
  [6, "implode", bufferedStream(decodeImplode)],
  [
    12,
    "bzip2",
    bufferedStream((data, { uncompressedSize }) =>
      Bunzip.decode(data, uncompressedSize, true),
    ),
  ],
  [14, "lzma", bufferedStream(decodeZipLzma)],
  [93, "zstd", ZstdStream],
  [95, "xz", XzStream],
];

let registered = false;

export function registerZipCodecs() {
  if (registered) return;
  for (const [compressionMethod, format, DecompressionStream] of ZIP_CODECS) {
    registerCodec({ compressionMethod, format, DecompressionStream });
  }
  registered = true;
}
