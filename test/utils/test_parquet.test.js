import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "@/testing/msw";

import { server } from "../setup/msw-server";

// Fixture: real parquet file produced via pyarrow
// (scripts/dev/generate_preview_test_fixtures.py). Byte-identical to
// anything the HuggingFace datasets-server would serve for a comparable
// upload.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../fixtures/previews/tiny.parquet");
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);
const FIXTURE_URL = "https://s3.test.local/bucket/tiny.parquet";

function respondRange(buffer, { status = 206 } = {}) {
  return async ({ request }) => {
    const method = request.method.toUpperCase();
    if (method === "HEAD") {
      return new HttpResponse(null, {
        status: 200,
        headers: {
          "Content-Length": String(buffer.length),
          "Accept-Ranges": "bytes",
        },
      });
    }
    const rangeHeader = request.headers.get("range");
    if (!rangeHeader) {
      return new HttpResponse(buffer, {
        status: 200,
        headers: { "Content-Length": String(buffer.length) },
      });
    }
    const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!match) return new HttpResponse("Bad Range", { status: 400 });
    const start = Number(match[1]);
    const end =
      match[2] == null
        ? buffer.length - 1
        : Math.min(Number(match[2]), buffer.length - 1);
    const slice = buffer.subarray(start, end + 1);
    return new HttpResponse(slice, {
      status,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
        "Content-Length": String(slice.length),
        "Accept-Ranges": "bytes",
      },
    });
  };
}

describe("parquet utilities", () => {
  async function loadModule() {
    vi.resetModules();
    return import("@/utils/parquet");
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Regression for the in-archive preview path. hyparquet's
  // asyncBufferFromUrl issues a HEAD against the source for the
  // tail size and Range requests for the footer; both are
  // unreliable on `blob:` URLs and the user saw "Browser blocked
  // the request" when previewing a parquet member from inside an
  // indexed tar. The from-buffer entry point lets the modal hand
  // hyparquet the already-extracted bytes directly.
  describe("parseParquetMetadataFromBuffer", () => {
    it("parses metadata from in-memory bytes without issuing fetches", async () => {
      const { parseParquetMetadataFromBuffer, summarizeParquetSchema } =
        await loadModule();
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const metadata = await parseParquetMetadataFromBuffer(FIXTURE_BYTES);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(metadata.byteLength).toBe(FIXTURE_BYTES.length);
      expect(metadata.numRows).toBe(100);
      expect(metadata.rowGroups.length).toBeGreaterThanOrEqual(1);
      const summary = summarizeParquetSchema(metadata);
      expect(summary.columnCount).toBe(4);
    });

    it("rejects bytes that do not end with the PAR1 footer magic", async () => {
      const { parseParquetMetadataFromBuffer } = await loadModule();
      // Random non-parquet bytes — hyparquet checks the trailing 4
      // bytes for "PAR1" and throws on mismatch. Pin the failure
      // mode so a future hyparquet upgrade doesn't silently swallow
      // garbage and surface synthetic-looking metadata.
      const buf = new Uint8Array(64).map((_, i) => i & 0xff);
      await expect(parseParquetMetadataFromBuffer(buf)).rejects.toThrow(
        /PAR1/,
      );
    });

    it("accepts an ArrayBuffer input (not just Uint8Array)", async () => {
      const { parseParquetMetadataFromBuffer } = await loadModule();
      const ab = FIXTURE_BYTES.buffer.slice(
        FIXTURE_BYTES.byteOffset,
        FIXTURE_BYTES.byteOffset + FIXTURE_BYTES.byteLength,
      );
      const metadata = await parseParquetMetadataFromBuffer(ab);
      expect(metadata.numRows).toBe(100);
    });

    it("normalizes input from a different realm (jsdom Buffer / cross-realm ArrayBuffer)", async () => {
      const { parseParquetMetadataFromBuffer } = await loadModule();
      // Node fs.readFileSync returns a Buffer whose underlying
      // ArrayBuffer fails the jsdom realm's `instanceof
      // ArrayBuffer` check. The from-buffer path explicitly copies
      // into a current-realm allocation; this test pins that
      // contract by passing the raw cross-realm ArrayBuffer.
      const realm = FIXTURE_BYTES.buffer;
      const metadata = await parseParquetMetadataFromBuffer(realm.slice(
        FIXTURE_BYTES.byteOffset,
        FIXTURE_BYTES.byteOffset + FIXTURE_BYTES.byteLength,
      ));
      expect(metadata.numRows).toBe(100);
    });
  });

  it("parses footer metadata, row counts, and top-level columns", async () => {
    const { parseParquetMetadata, summarizeParquetSchema } = await loadModule();
    server.use(http.get(FIXTURE_URL, respondRange(FIXTURE_BYTES)));
    server.use(http.head(FIXTURE_URL, respondRange(FIXTURE_BYTES)));

    const metadata = await parseParquetMetadata(FIXTURE_URL);

    expect(metadata.byteLength).toBe(FIXTURE_BYTES.length);
    expect(metadata.numRows).toBe(100);
    expect(metadata.rowGroups.length).toBeGreaterThanOrEqual(1);
    expect(metadata.rowGroups[0].numRows).toBe(100);

    const summary = summarizeParquetSchema(metadata);
    expect(summary.columnCount).toBe(4);
    expect(summary.columns.map((col) => col.name)).toEqual([
      "id",
      "score",
      "ratio",
      "flag",
    ]);
    // Physical types come straight from the parquet footer.
    const physical = Object.fromEntries(
      summary.columns.map((col) => [col.name, col.physicalType]),
    );
    expect(physical.id).toBe("BYTE_ARRAY");
    expect(physical.score).toBe("INT64");
    expect(physical.ratio).toBe("FLOAT");
    expect(physical.flag).toBe("BOOLEAN");
  });

  it("normalizeCount: null/undefined → 0", async () => {
    const { normalizeCount } = await loadModule();
    expect(normalizeCount(null)).toBe(0);
    expect(normalizeCount(undefined)).toBe(0);
  });

  it("normalizeCount: bigint within MAX_SAFE_INTEGER → number", async () => {
    const { normalizeCount } = await loadModule();
    expect(normalizeCount(0n)).toBe(0);
    expect(normalizeCount(500n)).toBe(500);
    expect(normalizeCount(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("normalizeCount: bigint beyond MAX_SAFE_INTEGER → string (preserves precision)", async () => {
    const { normalizeCount } = await loadModule();
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 17n;
    expect(normalizeCount(huge)).toBe(huge.toString());
  });

  it("normalizeCount: plain number passes through unchanged", async () => {
    const { normalizeCount } = await loadModule();
    expect(normalizeCount(42)).toBe(42);
    expect(normalizeCount(0)).toBe(0);
  });

  it("summarizeParquetSchema copes with an empty / shapeless schema tree", async () => {
    const { summarizeParquetSchema } = await loadModule();
    expect(summarizeParquetSchema({ schemaTree: null })).toEqual({
      columnCount: 0,
      columns: [],
    });
    expect(summarizeParquetSchema({ schemaTree: {} })).toEqual({
      columnCount: 0,
      columns: [],
    });
    expect(
      summarizeParquetSchema({ schemaTree: { children: [] } }),
    ).toEqual({ columnCount: 0, columns: [] });
  });

  it("summarizeParquetSchema tolerates children without element metadata", async () => {
    const { summarizeParquetSchema } = await loadModule();
    const summary = summarizeParquetSchema({
      schemaTree: {
        children: [{}, { element: { name: "foo", type: "INT32" } }],
      },
    });
    expect(summary.columnCount).toBe(2);
    expect(summary.columns).toEqual([
      {
        name: "",
        logicalType: null,
        physicalType: null,
        repetitionType: null,
      },
      {
        name: "foo",
        logicalType: null,
        physicalType: "INT32",
        repetitionType: null,
      },
    ]);
  });

  it("fires the progress callback phases in order", async () => {
    const { parseParquetMetadata } = await loadModule();
    server.use(http.get(FIXTURE_URL, respondRange(FIXTURE_BYTES)));
    server.use(http.head(FIXTURE_URL, respondRange(FIXTURE_BYTES)));

    const phases = [];
    await parseParquetMetadata(FIXTURE_URL, {
      onProgress: (phase) => phases.push(phase),
    });

    expect(phases[0]).toBe("head");
    expect(phases).toContain("footer");
    expect(phases).toContain("parsing");
    expect(phases[phases.length - 1]).toBe("done");
  });
});

// A parquet member of an indexed tar (or a stored member of a zip) is read in
// place: only its footer is fetched, whatever the size of the member.
describe("parseParquetMetadataFromSource", () => {
  // The fixture sits at the end of a file `size` bytes long, as a member's footer
  // sits at the end of the member; everything before it reads as zeros.
  function tailSource(size, content) {
    const reads = [];
    return {
      reads,
      size,
      read: async (offset, length, options) => {
        reads.push({ offset, length, options });
        const end = Math.min(offset + length, size);
        const out = new Uint8Array(Math.max(0, end - offset));
        const base = size - content.length;
        for (let p = Math.max(offset, base); p < end; p++) out[p - offset] = content[p - base];
        return out;
      },
    };
  }

  it("gives the same metadata as parsing the whole file", async () => {
    const { parseParquetMetadataFromSource, parseParquetMetadataFromBuffer } = await import("@/utils/parquet");
    const { bytesSource } = await import("@/utils/range-source");
    const fromSource = await parseParquetMetadataFromSource(bytesSource(FIXTURE_BYTES));
    expect(fromSource).toEqual(await parseParquetMetadataFromBuffer(FIXTURE_BYTES));
  });

  it("reads only the footer of a member that is gigabytes long", async () => {
    const { parseParquetMetadataFromSource, parseParquetMetadataFromBuffer } = await import("@/utils/parquet");
    const source = tailSource(3_000_000_000, FIXTURE_BYTES);
    const metadata = await parseParquetMetadataFromSource(source);
    const whole = await parseParquetMetadataFromBuffer(FIXTURE_BYTES);
    expect(metadata.byteLength).toBe(3_000_000_000);
    expect(metadata.numRows).toBe(whole.numRows);
    expect(metadata.schema).toEqual(whole.schema);
    expect(source.reads.length).toBeLessThanOrEqual(3);
    const total = source.reads.reduce((sum, r) => sum + r.length, 0);
    expect(total).toBeLessThan(1024 * 1024);
    // every read is at the end of the member
    for (const r of source.reads) expect(r.offset + r.length).toBeGreaterThan(3_000_000_000 - 1024 * 1024);
  });

  it("reports the phases and hands the abort signal to the reads", async () => {
    const { parseParquetMetadataFromSource } = await import("@/utils/parquet");
    const phases = [];
    const signal = new AbortController().signal;
    const source = tailSource(FIXTURE_BYTES.length, FIXTURE_BYTES);
    await parseParquetMetadataFromSource(source, { onProgress: (p) => phases.push(p), signal });
    expect(phases[0]).toBe("head");
    expect(phases).toContain("footer");
    expect(phases).toContain("parsing");
    expect(phases[phases.length - 1]).toBe("done");
    expect(source.reads.every((r) => r.options?.signal === signal)).toBe(true);
  });

  it("serves a slice without an end as the rest of the member", async () => {
    const { asyncBufferFromSource } = await import("@/utils/parquet");
    const { bytesSource } = await import("@/utils/range-source");
    const buffer = asyncBufferFromSource(bytesSource(Uint8Array.of(1, 2, 3, 4, 5, 6)));
    expect(buffer.byteLength).toBe(6);
    expect(Array.from(new Uint8Array(await buffer.slice(2)))).toEqual([3, 4, 5, 6]);
    expect(Array.from(new Uint8Array(await buffer.slice(1, 3)))).toEqual([2, 3]);
  });
});
