// A range source is `{ size, read(offset, length, options) }`: a file that can
// be read from the middle. A member of an indexed tar, or a stored member of a
// zip, is a window of the archive, so reading inside the member is reading the
// archive at `member offset + offset`, without fetching the rest.

import { describe, expect, it, vi } from "vitest";

import { bytesSource, memberSource } from "@/utils/range-source";

const seq = (n) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("bytesSource", () => {
  it("reads the bytes it holds", async () => {
    const source = bytesSource(seq(100));
    expect(source.size).toBe(100);
    expect(Array.from(await source.read(10, 4))).toEqual([10, 11, 12, 13]);
  });

  it("stops at the end instead of failing", async () => {
    const source = bytesSource(seq(10));
    expect(Array.from(await source.read(8, 50))).toEqual([8, 9]);
    expect((await source.read(10, 5)).length).toBe(0);
    expect((await source.read(99, 5)).length).toBe(0);
    expect((await source.read(0, 0)).length).toBe(0);
  });

  it("refuses an offset or a length that is not a whole non-negative number", async () => {
    const source = bytesSource(seq(10));
    await expect(source.read(-1, 2)).rejects.toThrow(RangeError);
    await expect(source.read(0, -2)).rejects.toThrow(RangeError);
    await expect(source.read(1.5, 2)).rejects.toThrow(RangeError);
    await expect(source.read(0, Number.NaN)).rejects.toThrow(RangeError);
  });
});

describe("memberSource", () => {
  // `archive` stands for the file the member lives in
  const archive = seq(1000);
  const raw = () =>
    vi.fn(async (offset, length) => archive.slice(offset, offset + length));

  it("reads inside the member at the member's place in the archive", async () => {
    const readRaw = raw();
    const source = memberSource(readRaw, 300, 200);
    expect(source.size).toBe(200);
    const bytes = await source.read(10, 5);
    expect(Array.from(bytes)).toEqual(Array.from(archive.slice(310, 315)));
    expect(readRaw).toHaveBeenCalledTimes(1);
    expect(readRaw.mock.calls[0][0]).toBe(310);
    expect(readRaw.mock.calls[0][1]).toBe(5);
  });

  it("does not read past the end of the member", async () => {
    const readRaw = raw();
    const source = memberSource(readRaw, 300, 200);
    const bytes = await source.read(195, 100);
    expect(bytes.length).toBe(5);
    expect(readRaw.mock.calls[0][1]).toBe(5);
  });

  it("answers an empty read without asking the archive", async () => {
    const readRaw = raw();
    const source = memberSource(readRaw, 300, 200);
    expect((await source.read(200, 10)).length).toBe(0);
    expect((await source.read(5000, 10)).length).toBe(0);
    expect((await source.read(7, 0)).length).toBe(0);
    expect(readRaw).not.toHaveBeenCalled();
  });

  it("hands the options (the abort signal) on", async () => {
    const readRaw = raw();
    const source = memberSource(readRaw, 0, 100);
    const signal = new AbortController().signal;
    await source.read(0, 4, { signal });
    expect(readRaw.mock.calls[0][2]).toEqual({ signal });
  });

  it("refuses to hand back less than it asked for", async () => {
    // A server that cuts the answer short must not become a silently wrong parse
    const short = vi.fn(async (_offset, length) => new Uint8Array(length - 1));
    const source = memberSource(short, 0, 100);
    await expect(source.read(0, 10)).rejects.toThrow(/short read/i);
  });

  it("passes a failure of the archive through", async () => {
    const failing = vi.fn(async () => {
      throw new Error("HTTP 503");
    });
    const source = memberSource(failing, 0, 100);
    await expect(source.read(0, 4)).rejects.toThrow("HTTP 503");
  });

  it("refuses an offset or a length that is not a whole non-negative number", async () => {
    const source = memberSource(raw(), 0, 100);
    await expect(source.read(-1, 2)).rejects.toThrow(RangeError);
    await expect(source.read(0, -2)).rejects.toThrow(RangeError);
    await expect(source.read(0.5, 2)).rejects.toThrow(RangeError);
  });
});
