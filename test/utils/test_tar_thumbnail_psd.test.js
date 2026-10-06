import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "@/testing/msw";

import { server } from "../setup/msw-server";
import {
  buildPsd,
  resourceBlock,
  thumbnailResource,
} from "../helpers/psd-builder";

import {
  THUMB_MAX_DIM,
  _STRATEGIES,
  _createCache,
  _createPool,
  extractThumbnail,
  isThumbnailMember,
} from "@/utils/tar-thumbnail";
import { LIST_PREVIEW_MAX_BYTES } from "@/utils/psd-preview";

const TAR_URL = "https://s3.test.local/bucket/archive.tar";
const JPEG = [0xff, 0xd8, 0xff, 0xd9];
const LEAD = 1536; // where the member starts in the tar

let created;
let canvases;
let originalCreateElement;
let originalImageData;

beforeEach(() => {
  created = [];
  canvases = [];
  URL.createObjectURL = vi.fn((blob) => {
    created.push(blob);
    return `blob:mock/${created.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  // jsdom has no canvas or ImageData: stand in for what rgbaToBlob draws on
  originalImageData = globalThis.ImageData;
  globalThis.ImageData = class {
    constructor(data, width, height) {
      Object.assign(this, { data, width, height });
    }
  };
  originalCreateElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    if (tag !== "canvas") return originalCreateElement(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: vi.fn() }),
      toBlob: (cb, type) => cb(new Blob(["pixels"], { type })),
    };
    canvases.push(canvas);
    return canvas;
  };
});

afterEach(() => {
  document.createElement = originalCreateElement;
  globalThis.ImageData = originalImageData;
});

/** Serve `psd` at LEAD inside a tar, recording each Range. */
function serveTar(psd, ranges, { padTo = 0 } = {}) {
  const tar = new Uint8Array(Math.max(LEAD + psd.length, padTo));
  tar.set(psd, LEAD);
  server.use(
    http.get(TAR_URL, ({ request }) => {
      const range = request.headers.get("range");
      ranges.push(range);
      const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(range);
      return new HttpResponse(tar.subarray(Number(a), Number(b) + 1), {
        status: 206,
      });
    }),
  );
}

const member = (psd, extra = {}) => ({
  name: "art.psd",
  path: "art.psd",
  offset: LEAD,
  size: psd.length,
  ...extra,
});
const run = (m, extra = {}) =>
  extractThumbnail({
    tarUrl: TAR_URL,
    member: m,
    cache: _createCache(10),
    pool: _createPool(2),
    ...extra,
  });

describe("isThumbnailMember", () => {
  it("accepts images and non-empty PSDs only", () => {
    expect(isThumbnailMember({ name: "a.png", size: 1 })).toBe(true);
    expect(isThumbnailMember({ name: "a.PSD", size: 5 })).toBe(true);
    expect(isThumbnailMember({ name: "a.psd", size: 0 })).toBe(false);
    expect(isThumbnailMember({ name: "a.psb", size: 5 })).toBe(false);
    expect(isThumbnailMember({ name: "a.txt", size: 5 })).toBe(false);
    expect(isThumbnailMember(null)).toBe(false);
  });
});

describe("psd strategy · registry", () => {
  it("is last in the chain and matches .psd members only", () => {
    const psd = _STRATEGIES.at(-1);
    expect(psd.name).toBe("psd");
    expect(psd.match({ name: "x.psd", size: 10 })).toBe(true);
    expect(psd.match({ name: "x.png", size: 10 })).toBe(false);
    expect(psd.match({ name: "x.psd", size: 0 })).toBe(false);
  });
});

describe("psd strategy · indexed tar (Range reads)", () => {
  it("uses the embedded thumbnail: one Range read of the member's first 64 KB", async () => {
    const psd = buildPsd({
      width: 40,
      height: 30,
      layerBytes: 100000,
      resources: [thumbnailResource({ width: 8, height: 6, jpeg: JPEG })],
    });
    const ranges = [];
    serveTar(psd, ranges);
    const url = await run(member(psd));
    expect(url).toBe("blob:mock/1");
    expect(created[0].type).toBe("image/jpeg");
    expect(ranges).toEqual([`bytes=${LEAD}-${LEAD + 65535}`]);
  });

  it("decodes the composite to a thumbnail-sized JPEG when there is no embedded one", async () => {
    const psd = buildPsd({ width: 600, height: 300, layerBytes: 100000 });
    const ranges = [];
    serveTar(psd, ranges);
    const url = await run(member(psd));
    expect(url).toBe("blob:mock/1");
    expect(created[0].type).toBe("image/jpeg");
    expect([canvases[0].width, canvases[0].height]).toEqual([
      THUMB_MAX_DIM,
      THUMB_MAX_DIM / 2,
    ]);
    expect(ranges).toHaveLength(2); // the head, then the composite section at the end
    expect(Number(/bytes=(\d+)/.exec(ranges[1])[1])).toBeGreaterThanOrEqual(
      LEAD + 100000,
    );
  });

  it("does not preview a PSD whose composite would download more than 32 MB", async () => {
    const psd = buildPsd({ width: 16, height: 16 });
    const ranges = [];
    serveTar(psd, ranges, { padTo: LEAD + 65536 });
    // the member claims to be 40 MB: the section after the layers is over the cap
    const out = await run(member(psd, { size: 40 * 1024 * 1024 }));
    expect(out).toBeNull();
    expect(ranges).toHaveLength(1); // only the head was read
  });

  it("still uses a thumbnail on a PSD that is over the cap", async () => {
    const psd = buildPsd({
      width: 16,
      height: 16,
      resources: [thumbnailResource({ width: 4, height: 4, jpeg: JPEG })],
    });
    serveTar(psd, [], { padTo: LEAD + 65536 });
    expect(await run(member(psd, { size: 200 * 1024 * 1024 }))).toBe(
      "blob:mock/1",
    );
  });

  it("gives no thumbnail for a PSD it cannot decode", async () => {
    const psd = buildPsd({ width: 16, height: 16, mode: 2 });
    serveTar(psd, []);
    expect(await run(member(psd))).toBeNull();
  });

  it("rejects, for the caller to fall back, when the bytes are not a PSD", async () => {
    const junk = new Uint8Array(500);
    serveTar(junk, []);
    await expect(run(member(junk))).rejects.toThrow("not a PSD");
  });

  it("keeps the 32 MB cap as the contract", () => {
    expect(LIST_PREVIEW_MAX_BYTES).toBe(32 * 1024 * 1024);
  });
});

describe("psd strategy · readRange given next to a prefix reader (the tar panel)", () => {
  it("range-reads the member instead of reading it whole", async () => {
    const psd = buildPsd({ width: 600, height: 300, layerBytes: 100000 });
    const prefixReads = [];
    const rangeReads = [];
    const controller = new AbortController();
    const out = await run(member(psd), {
      signal: controller.signal,
      read: async (m, size) => {
        prefixReads.push(size);
        return psd.subarray(0, size);
      },
      readRange: async (m, offset, length, options) => {
        rangeReads.push([m.name, offset, length, options.signal]);
        return psd.subarray(offset, offset + length);
      },
    });
    expect(out).toBe("blob:mock/1");
    expect(prefixReads).toEqual([]);
    expect(rangeReads).toHaveLength(2); // the head, then the composite at the end
    expect(rangeReads[0]).toEqual(["art.psd", 0, 65536, controller.signal]);
  });

  it("applies the 32 MB cap to the composite, not to the member", async () => {
    const psd = buildPsd({ width: 16, height: 16 });
    const reads = [];
    // a 200 MB member whose composite is small enough to read
    const m = member(psd, { size: 200 * 1024 * 1024 });
    const out = await run(m, {
      read: async () => {
        throw new Error("must not read the member whole");
      },
      readRange: async (mm, offset, length) => {
        reads.push([offset, length]);
        return length > psd.length
          ? psd.subarray(offset)
          : psd.subarray(offset, offset + length);
      },
    });
    // the composite section is (size - start) bytes: over the cap, so only the head is read
    expect(out).toBeNull();
    expect(reads).toHaveLength(1);
  });
});

describe("psd strategy · zip member (no Range: the whole member is read)", () => {
  const zipRead = (bytes, reads) => async (m, size) => {
    reads.push(size);
    return bytes.subarray(0, size);
  };

  it("reads the member once and decodes its composite", async () => {
    const psd = buildPsd({ width: 600, height: 300, layerBytes: 5000 });
    const reads = [];
    const url = await run(
      { name: "art.psd", path: "art.psd", size: psd.length },
      { read: zipRead(psd, reads) },
    );
    expect(url).toBe("blob:mock/1");
    expect(reads).toEqual([psd.length]);
  });

  it("skips a zip member over 32 MB without reading anything", async () => {
    const reads = [];
    const big = {
      name: "art.psd",
      path: "art.psd",
      size: LIST_PREVIEW_MAX_BYTES + 1,
    };
    expect(
      await run(big, { read: zipRead(new Uint8Array(0), reads) }),
    ).toBeNull();
    expect(reads).toEqual([]);
  });

  it("reads a zip member of exactly 32 MB", async () => {
    const psd = buildPsd({
      width: 8,
      height: 8,
      resources: [thumbnailResource({ width: 4, height: 4, jpeg: JPEG })],
    });
    const reads = [];
    const exact = {
      name: "art.psd",
      path: "art.psd",
      size: LIST_PREVIEW_MAX_BYTES,
    };
    // the reader returns what the archive holds; the preview needs only that
    const out = await run(exact, {
      read: async (m, size) => (reads.push(size), psd),
    });
    expect(out).toBe("blob:mock/1");
    expect(reads).toEqual([LIST_PREVIEW_MAX_BYTES]);
  });
});
