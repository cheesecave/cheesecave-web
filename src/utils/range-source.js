// src/utils/range-source.js
//
// A range source is `{ size, read(offset, length, options) }`: a file that can be
// read from the middle, the way the readers of safetensors, parquet and other
// formats need (a header at the front, a footer at the end).
//
// A member of an indexed tar is stored as it is, and so is a zip member stored
// without compression. Such a member is a window of the archive: reading inside
// it is reading the archive at `member offset + offset`, so a reader can take the
// head or the footer of a member of any size without fetching the rest. A member
// that is compressed (a deflated zip member) has no such window; it has to be
// extracted whole.
//
// `read` resolves to a Uint8Array and never to less than it was asked for, except
// at the end of the file, where it returns what is left (nothing past the end).
// `options.signal` aborts the request.

function checkRange(offset, length) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(length) ||
    length < 0
  ) {
    throw new RangeError(
      `Not a range: offset ${offset}, length ${length} (whole numbers, not negative)`,
    );
  }
}

/** A source over bytes already in memory. */
export function bytesSource(bytes) {
  return {
    size: bytes.length,
    read: async (offset, length) => {
      checkRange(offset, length);
      return bytes.subarray(offset, offset + length);
    },
  };
}

/**
 * A source over the window `[start, start + size)` of a larger file.
 * `readRaw(offset, length, options)` reads that file at an absolute offset.
 */
export function memberSource(readRaw, start, size) {
  return {
    size,
    read: async (offset, length, options) => {
      checkRange(offset, length);
      const wanted = Math.min(length, size - offset);
      if (wanted <= 0) return new Uint8Array(0);
      const bytes = await readRaw(start + offset, wanted, options);
      // A server that cuts an answer short must not become a wrong parse
      if (bytes.length !== wanted) {
        throw new Error(
          `Short read: wanted ${wanted} bytes at ${start + offset}, got ${bytes.length}`,
        );
      }
      return bytes;
    },
  };
}
