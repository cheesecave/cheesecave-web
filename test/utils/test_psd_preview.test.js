import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "@/testing/msw";

import { server } from "../setup/msw-server";
import {
  buildPsd,
  countingSource,
  resourceBlock,
  thumbnailResource,
} from "../helpers/psd-builder";

import {
  DETAIL_PREVIEW_SIDE,
  LIST_PREVIEW_MAX_BYTES,
  LIST_PREVIEW_SIDE,
  PSD_HEAD_BYTES,
  createBytesSource,
  createHttpRangeSource,
  isPsdPath,
  readPsdPreview,
  rgbaToBlob,
} from "@/utils/psd-preview";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9];
const THUMB = { width: 4, height: 3, jpeg: JPEG };
const px = (out, x, y) => [
  ...out.rgba.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 4),
];
const expected = (x, y, mode = 3) =>
  Array.from(
    { length: mode === 3 ? 3 : 1 },
    (_, c) => (x * 16 + y * 8 + c * 40) & 0xff,
  );

describe("limits", () => {
  it("keeps the list cap at 32 MB and the detail preview larger than a thumbnail", () => {
    expect(LIST_PREVIEW_MAX_BYTES).toBe(32 * 1024 * 1024);
    expect(LIST_PREVIEW_SIDE).toBe(256);
    expect(DETAIL_PREVIEW_SIDE).toBeGreaterThan(LIST_PREVIEW_SIDE);
    expect(PSD_HEAD_BYTES).toBe(64 * 1024);
  });
});

describe("isPsdPath", () => {
  it("matches .psd in any case and nothing else", () => {
    expect(isPsdPath("a/b/Art.PSD")).toBe(true);
    expect(isPsdPath("art.psd")).toBe(true);
    expect(isPsdPath("art.psb")).toBe(false);
    expect(isPsdPath("psd")).toBe(false);
    expect(isPsdPath("art.psd.txt")).toBe(false);
    expect(isPsdPath(undefined)).toBe(false);
  });
});

describe("readPsdPreview · composite", () => {
  it("decodes an RLE RGB composite pixel for pixel", async () => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 8, height: 6 })),
      { maxSide: 64 },
    );
    expect(out.kind).toBe("composite");
    expect([out.width, out.height, out.docWidth, out.docHeight]).toEqual([
      8, 6, 8, 6,
    ]);
    for (const [x, y] of [
      [0, 0],
      [3, 2],
      [7, 5],
      [5, 1],
    ]) {
      expect(px(out, x, y)).toEqual([...expected(x, y), 255]);
    }
  });

  it("copes with runs, literals and the PackBits no-op byte", async () => {
    // each row is two long runs
    const halves = (x) => (x < 100 ? [10, 20, 30] : [200, 20, 30]);
    const out = await readPsdPreview(
      createBytesSource(
        buildPsd({ width: 200, height: 3, pixel: halves, noop: true }),
      ),
      { maxSide: 400 },
    );
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(out, 199, 2)).toEqual([200, 20, 30, 255]);
  });

  it("decodes a raw (uncompressed) composite", async () => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 5, height: 4, compression: 0 })),
      { maxSide: 64 },
    );
    expect(px(out, 4, 3)).toEqual([...expected(4, 3), 255]);
  });

  it("ignores alpha planes after the colour ones", async () => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 4, height: 4, extraChannels: 1 })),
      { maxSide: 64 },
    );
    expect(px(out, 3, 3)).toEqual([...expected(3, 3), 255]);
  });

  it("reads grayscale, CMYK (stored inverted) and 16-bit files", async () => {
    const gray = await readPsdPreview(
      createBytesSource(buildPsd({ width: 4, height: 4, mode: 1 })),
      { maxSide: 64 },
    );
    const [g] = expected(2, 1, 1);
    expect(px(gray, 2, 1)).toEqual([g, g, g, 255]);

    const cmyk = await readPsdPreview(
      createBytesSource(
        buildPsd({
          width: 2,
          height: 2,
          mode: 4,
          pixel: (x) => (x ? [200, 100, 50, 255] : [0, 0, 0, 255]),
        }),
      ),
      { maxSide: 64 },
    );
    // r = c * k / 255 with k = 255: no black ink left in the stored (inverted) value
    expect(px(cmyk, 1, 0)).toEqual([200, 100, 50, 255]);
    const dark = await readPsdPreview(
      createBytesSource(
        buildPsd({
          width: 2,
          height: 2,
          mode: 4,
          pixel: (x) => (x ? [255, 255, 255, 128] : [0, 0, 0, 255]),
        }),
      ),
      { maxSide: 64 },
    );
    expect(px(dark, 1, 1)).toEqual([128, 128, 128, 255]);

    const deep = await readPsdPreview(
      createBytesSource(
        buildPsd({
          width: 3,
          height: 3,
          depth: 16,
          pixel: (x) => (x ? [0xabcd, 0x1234, 0xff00] : [0, 0, 0]),
        }),
      ),
      { maxSide: 64 },
    );
    expect(px(deep, 1, 1)).toEqual([0xab, 0x12, 0xff, 255]);
  });

  it("reads a large-format PSB (8-byte section length, 4-byte row counts)", async () => {
    const out = await readPsdPreview(
      createBytesSource(
        buildPsd({ width: 6, height: 5, psb: true, layerBytes: 10 }),
      ),
      { maxSide: 64 },
    );
    expect(px(out, 5, 4)).toEqual([...expected(5, 4), 255]);
    const raw = await readPsdPreview(
      createBytesSource(
        buildPsd({ width: 6, height: 5, psb: true, compression: 0 }),
      ),
      { maxSide: 64 },
    );
    expect(px(raw, 2, 2)).toEqual([...expected(2, 2), 255]);
  });

  it("skips the layer data between the header and the composite", async () => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 4, height: 4, layerBytes: 5000 })),
      { maxSide: 64 },
    );
    expect(px(out, 1, 1)).toEqual([...expected(1, 1), 255]);
  });

  it("box-filters down to maxSide, sampling a few rows per output row", async () => {
    // columns of 0 and 200: a 2:1 box filter gives 100 everywhere
    const stripes = (x, y) => [x % 2 ? 200 : 0, y < 8 ? 0 : 90, 0];
    const all = await readPsdPreview(
      createBytesSource(buildPsd({ width: 16, height: 16, pixel: stripes })),
      { maxSide: 8, rowsPerOutput: 0 },
    );
    expect([all.width, all.height]).toEqual([8, 8]);
    expect(px(all, 3, 3)).toEqual([100, 0, 0, 255]);
    const sampled = await readPsdPreview(
      createBytesSource(buildPsd({ width: 16, height: 48, pixel: stripes })),
      { maxSide: 8 },
    );
    expect([sampled.width, sampled.height]).toEqual([3, 8]);
    expect(px(sampled, 1, 4)[0]).toBeGreaterThanOrEqual(80);
    expect(px(sampled, 1, 4)[0]).toBeLessThanOrEqual(120);
  });

  it("calls a composite of one single colour blank: the picture is in the layers", async () => {
    // a PSD saved without "Maximize Compatibility" keeps a white placeholder
    const white = () => [255, 255, 255];
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 40, height: 30, pixel: white })),
      { maxSide: 64 },
    );
    expect(out.kind).toBe("blank");
    expect([out.docWidth, out.docHeight]).toEqual([40, 30]);
    expect(out.reason).toContain("single colour");
  });

  it("does not call a nearly white page with a few marks blank", async () => {
    const mark = (x, y) => (x < 4 && y < 4 ? [0, 0, 0] : [255, 255, 255]);
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 40, height: 30, pixel: mark })),
      { maxSide: 64 },
    );
    expect(out.kind).toBe("composite");
  });

  it("falls back to the thumbnail when the composite is blank", async () => {
    const bytes = buildPsd({
      width: 40,
      height: 30,
      pixel: () => [255, 255, 255],
      resources: [thumbnailResource(THUMB)],
    });
    const out = await readPsdPreview(createBytesSource(bytes), {
      maxSide: 64,
      minThumbSide: 1024,
    });
    expect(out.kind).toBe("thumbnail");
  });

  it("never upscales", async () => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 4, height: 2 })),
      { maxSide: 2048 },
    );
    expect([out.width, out.height]).toEqual([4, 2]);
  });

  it("reads the header and the composite only: two requests", async () => {
    const source = countingSource(
      buildPsd({ width: 8, height: 8, layerBytes: 100000 }),
    );
    await readPsdPreview(source, { maxSide: 64 });
    const [head, ...rest] = source.reads;
    expect(head).toEqual([0, PSD_HEAD_BYTES]);
    expect(rest).toHaveLength(1);
    expect(rest[0][0]).toBeGreaterThan(100000); // starts after the layer data
  });
});

describe("readPsdPreview · embedded thumbnail", () => {
  const withThumb = (extra = {}) =>
    buildPsd({
      width: 8,
      height: 6,
      resources: [
        resourceBlock(1005, [1, 2, 3], "odd"),
        resourceBlock(1006, [9], "ab"),
        thumbnailResource(THUMB),
      ],
      ...extra,
    });

  it("returns the embedded JPEG without touching the composite", async () => {
    const source = countingSource(withThumb({ layerBytes: 4000 }));
    const out = await readPsdPreview(source, { maxSide: 64 });
    expect(out.kind).toBe("thumbnail");
    expect([...out.jpeg]).toEqual(JPEG);
    expect([out.width, out.height, out.docWidth, out.docHeight]).toEqual([
      4, 3, 8, 6,
    ]);
    expect(source.reads).toHaveLength(1);
  });

  it("prefers the composite when the thumbnail is smaller than minThumbSide", async () => {
    const out = await readPsdPreview(createBytesSource(withThumb()), {
      maxSide: 64,
      minThumbSide: 1024,
    });
    expect(out.kind).toBe("composite");
  });

  it("returns the thumbnail even when the composite is over the byte cap", async () => {
    const out = await readPsdPreview(createBytesSource(withThumb()), {
      maxBytes: 1,
    });
    expect(out.kind).toBe("thumbnail");
  });

  it("falls back to the thumbnail when the composite cannot be decoded", async () => {
    const out = await readPsdPreview(
      createBytesSource(withThumb({ mode: 2 })),
      { minThumbSide: 1024 },
    );
    expect(out.kind).toBe("thumbnail");
  });

  it("finds no thumbnail behind a damaged resource block", async () => {
    const bad = buildPsd({
      width: 4,
      height: 4,
      resources: [
        [
          ...Array.from("XXXX", (c) => c.charCodeAt(0)),
          0,
          1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ],
      ],
    });
    const out = await readPsdPreview(createBytesSource(bad), { maxSide: 64 });
    expect(out.kind).toBe("composite");
  });

  it("ignores a resource that runs past the resource section, and a 1036 with no JPEG", async () => {
    const sig = Array.from("8BIM", (c) => c.charCodeAt(0));
    const overlong = [...sig, 0x04, 0x0c, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]; // id 1036, length 4 GB
    const tooShort = resourceBlock(1036, [0, 0, 0, 1]);
    for (const resources of [[overlong], [tooShort]]) {
      const out = await readPsdPreview(
        createBytesSource(buildPsd({ width: 4, height: 4, resources })),
        { maxSide: 64 },
      );
      expect(out.kind).toBe("composite");
    }
  });

  it("reads a second head when the resources outgrow the first read", async () => {
    const icc = resourceBlock(1039, new Array(PSD_HEAD_BYTES + 100).fill(7));
    const source = countingSource(
      buildPsd({
        width: 4,
        height: 4,
        resources: [icc, thumbnailResource(THUMB)],
      }),
    );
    const out = await readPsdPreview(source, { maxSide: 64 });
    expect(out.kind).toBe("thumbnail");
    expect(source.reads).toHaveLength(2);
    expect(source.reads[1][1]).toBeGreaterThan(PSD_HEAD_BYTES);
  });
});

describe("readPsdPreview · limits and unsupported files", () => {
  it("reports a composite over the byte cap as too large, with its size", async () => {
    const bytes = buildPsd({ width: 64, height: 64, compression: 0 });
    const out = await readPsdPreview(createBytesSource(bytes), {
      maxBytes: 1000,
    });
    expect(out.kind).toBe("too-large");
    expect(out.bytes).toBeGreaterThan(64 * 64 * 3);
    expect([out.docWidth, out.docHeight]).toEqual([64, 64]);
  });

  it.each([
    ["an indexed-colour file", { mode: 2 }],
    ["a 32-bit file", { depth: 32 }],
    ["a zip-compressed composite", { compression: 2 }],
  ])("reports %s as unsupported", async (_, extra) => {
    const out = await readPsdPreview(
      createBytesSource(buildPsd({ width: 4, height: 4, ...extra })),
      {},
    );
    expect(out.kind).toBe("unsupported");
  });

  it("throws for a file that is not a PSD", async () => {
    await expect(
      readPsdPreview(createBytesSource(new Uint8Array(100)), {}),
    ).rejects.toThrow("not a PSD");
  });

  it.each([
    ["RLE", { compression: 1 }],
    ["raw", { compression: 0 }],
  ])("throws for a truncated %s composite", async (_, extra) => {
    const bytes = buildPsd({ width: 16, height: 16, truncateBy: 40, ...extra });
    await expect(readPsdPreview(createBytesSource(bytes), {})).rejects.toThrow(
      "truncated",
    );
  });

  it("throws when the file ends before its composite starts", async () => {
    const bytes = buildPsd({ width: 4, height: 4, layerBytes: 400 });
    await expect(
      readPsdPreview(createBytesSource(bytes.subarray(0, 300)), {}),
    ).rejects.toThrow("truncated");
  });

  it("stops when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readPsdPreview(createBytesSource(buildPsd({ width: 4, height: 4 })), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops between the header and the composite read", async () => {
    const controller = new AbortController();
    const inner = createBytesSource(buildPsd({ width: 4, height: 4 }));
    const source = {
      size: inner.size,
      async read(o, n) {
        const bytes = await inner.read(o, n);
        controller.abort();
        return bytes;
      },
    };
    await expect(
      readPsdPreview(source, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("sources", () => {
  it("accepts a size function, awaited once", async () => {
    const bytes = buildPsd({ width: 4, height: 4 });
    const size = vi.fn(async () => bytes.length);
    const out = await readPsdPreview(
      { size, read: async (o, n) => bytes.subarray(o, o + n) },
      { maxSide: 64 },
    );
    expect(out.kind).toBe("composite");
    expect(size).toHaveBeenCalledTimes(1);
  });

  it("createBytesSource clamps reads to the file", async () => {
    const source = createBytesSource(new Uint8Array([1, 2, 3, 4]));
    expect(source.size).toBe(4);
    expect([...(await source.read(2, 100))]).toEqual([3, 4]);
  });
});

describe("createHttpRangeSource", () => {
  const URL_ = "https://hub.test/datasets/o/r/resolve/main/art.psd";
  const BODY = buildPsd({ width: 8, height: 6, layerBytes: 300000 });

  function rangeHandler(
    requests,
    { honour = true, contentRange = true, status = 206 } = {},
  ) {
    return http.get(URL_, ({ request }) => {
      const range = request.headers.get("range");
      requests.push(range);
      if (status !== 206 && status !== 200)
        return new HttpResponse("no", { status });
      if (!honour || !range) return new HttpResponse(BODY, { status: 200 });
      const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(range);
      const end = Math.min(Number(b), BODY.length - 1);
      return new HttpResponse(BODY.subarray(Number(a), end + 1), {
        status: 206,
        headers: contentRange
          ? { "Content-Range": `bytes ${a}-${end}/${BODY.length}` }
          : {},
      });
    });
  }

  afterEach(() => server.resetHandlers());

  it("learns the size from the first Content-Range and serves the head from cache", async () => {
    const requests = [];
    server.use(rangeHandler(requests));
    const source = createHttpRangeSource(URL_);
    expect(await source.size()).toBe(BODY.length);
    expect(await source.size()).toBe(BODY.length);
    expect([...(await source.read(0, 26))]).toEqual([...BODY.subarray(0, 26)]);
    expect(requests).toEqual([`bytes=0-${PSD_HEAD_BYTES - 1}`]);
    const tail = await source.read(BODY.length - 10, 999);
    expect([...tail]).toEqual([...BODY.subarray(BODY.length - 10)]);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(`bytes=${BODY.length - 10}-${BODY.length - 1}`);
  });

  it("drives a whole preview through Range requests", async () => {
    const requests = [];
    server.use(rangeHandler(requests));
    const out = await readPsdPreview(createHttpRangeSource(URL_), {
      maxSide: 64,
    });
    expect(out.kind).toBe("composite");
    expect(requests).toHaveLength(2);
  });

  it("uses a full 200 response when the server ignores Range", async () => {
    const requests = [];
    server.use(rangeHandler(requests, { honour: false }));
    const source = createHttpRangeSource(URL_);
    expect(await source.size()).toBe(BODY.length);
    expect([...(await source.read(BODY.length - 4, 4))]).toEqual([
      ...BODY.subarray(BODY.length - 4),
    ]);
    expect(requests).toHaveLength(1);
  });

  it("reads a range before the size is known", async () => {
    const requests = [];
    server.use(rangeHandler(requests));
    const source = createHttpRangeSource(URL_);
    const slice = await source.read(PSD_HEAD_BYTES + 10, 20);
    expect([...slice]).toEqual([
      ...BODY.subarray(PSD_HEAD_BYTES + 10, PSD_HEAD_BYTES + 30),
    ]);
    expect(await source.size()).toBe(BODY.length);
  });

  it("throws on an error status and on a missing Content-Range", async () => {
    server.use(rangeHandler([], { status: 403 }));
    await expect(createHttpRangeSource(URL_).size()).rejects.toThrow(
      "HTTP 403",
    );
    server.use(rangeHandler([], { contentRange: false }));
    await expect(createHttpRangeSource(URL_).size()).rejects.toThrow("size");
  });
});

describe("rgbaToBlob", () => {
  it("paints the pixels on a canvas and encodes it", async () => {
    const put = vi.fn();
    const ctx = { putImageData: put };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb, type, q) => cb(new Blob(["x"], { type })),
    };
    const create = vi.spyOn(document, "createElement").mockReturnValue(canvas);
    const ImageDataBackup = globalThis.ImageData;
    globalThis.ImageData = class {
      constructor(data, w, h) {
        this.data = data;
        this.width = w;
        this.height = h;
      }
    };
    try {
      const blob = await rgbaToBlob(
        new Uint8ClampedArray(16),
        2,
        2,
        "image/jpeg",
        0.8,
      );
      expect(blob.type).toBe("image/jpeg");
      expect([canvas.width, canvas.height]).toEqual([2, 2]);
      expect(put).toHaveBeenCalledTimes(1);
      canvas.toBlob = (cb) => cb(null);
      await expect(rgbaToBlob(new Uint8ClampedArray(16), 2, 2)).rejects.toThrow(
        "toBlob",
      );
      canvas.getContext = () => null;
      await expect(rgbaToBlob(new Uint8ClampedArray(16), 2, 2)).rejects.toThrow(
        "canvas",
      );
    } finally {
      create.mockRestore();
      globalThis.ImageData = ImageDataBackup;
    }
  });
});
