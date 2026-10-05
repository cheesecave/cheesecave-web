// Unit tests for the stream wrappers in utils/zip-codecs.js that the
// fixture-driven tests in test_zip_archive.test.js cannot reach.

import { describe, expect, it, vi } from "vitest";

const explode = vi.hoisted(() => vi.fn());
vi.mock("@/vendor/hwzip/explode.js", () => ({ explode }));

import { ZIP_CODECS, decodeImplode, decodeZipLzma } from "@/utils/zip-codecs";

describe("decodeImplode", () => {
  it("returns the strict decode when it consumes the whole input", () => {
    explode.mockReturnValueOnce({ output: Uint8Array.of(1), bytesRead: 3 });
    expect(
      Array.from(
        decodeImplode(new Uint8Array(3), {
          uncompressedSize: 1,
          rawBitFlag: 6,
        }),
      ),
    ).toEqual([1]);
    expect(explode).toHaveBeenLastCalledWith(
      expect.any(Uint8Array),
      1,
      true,
      true,
      false,
    );
  });

  it("retries in PKZIP 1.01 quirk mode when the strict decode stops early", () => {
    explode
      .mockReturnValueOnce({ output: Uint8Array.of(1), bytesRead: 2 })
      .mockReturnValueOnce({ output: Uint8Array.of(2), bytesRead: 3 });
    expect(
      Array.from(decodeImplode(new Uint8Array(3), { uncompressedSize: 1 })),
    ).toEqual([2]);
    expect(explode).toHaveBeenLastCalledWith(
      expect.any(Uint8Array),
      1,
      false,
      false,
      true,
    );
  });

  it("retries in quirk mode when the strict decode throws", () => {
    explode
      .mockImplementationOnce(() => {
        throw new Error("bad tree");
      })
      .mockReturnValueOnce({ output: Uint8Array.of(3), bytesRead: 1 });
    expect(
      Array.from(decodeImplode(new Uint8Array(1), { uncompressedSize: 1 })),
    ).toEqual([3]);
  });
});

describe("codec table", () => {
  it("covers shrink, reduce 1-4, implode, bzip2, lzma, zstd and xz", () => {
    expect(ZIP_CODECS.map(([method]) => method)).toEqual([
      1, 2, 3, 4, 5, 6, 12, 14, 93, 95,
    ]);
  });

  it("rejects a truncated LZMA header", () => {
    expect(() =>
      decodeZipLzma(Uint8Array.of(9, 20, 5, 0, 0x5d), { uncompressedSize: 1 }),
    ).toThrow();
  });
});
