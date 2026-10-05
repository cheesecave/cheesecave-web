// Unit tests for utils/zip-archive.js — the pure-client zip reader behind
// the zip mode of TarBrowserPanel. Archives are served by MSW through the
// same /resolve/ + paths-info surface the SPA uses, so every test also
// pins the transport contract: GET only, a single simple byte range per
// request, and cookie-carrying credentials for private repos.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as zip from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse, passthrough } from "@/testing/msw";

import { server } from "../setup/msw-server";

import {
  ConcatReader,
  FILENAME_ENCODINGS,
  RangeReader,
  ZipArchiveError,
  decodeFilename,
  guessFilenameEncoding,
  openRepoZip,
  repairMissingZip64Records,
  repoZipLocator,
  resolveVolumes,
} from "@/utils/zip-archive";
import { isZipArchivePath } from "@/utils/file-preview";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/zip", name)));
const text = (s) => new TextEncoder().encode(s);
const decode = (u8) => new TextDecoder().decode(u8);

const TARGET = {
  repoType: "dataset",
  namespace: "owner",
  name: "zips",
  branch: "main",
};
const RESOLVE_PREFIX = `${window.location.origin}/datasets/owner/zips/resolve/main/`;
const PATHS_INFO = "/api/datasets/owner/zips/paths-info/main";
const CSV =
  "id,name\n" +
  Array.from({ length: 200 }, (_, i) => `${i},row-${i}\n`).join("");

let requests;

// Serve `files` (repo path -> bytes) and record every /resolve/ request.
function serveRepo(files, { ignoreRange = false } = {}) {
  server.use(
    http.get(`${RESOLVE_PREFIX}*`, ({ request }) => {
      const path = new URL(request.url).pathname
        .slice(new URL(RESOLVE_PREFIX).pathname.length)
        .split("/")
        .map(decodeURIComponent)
        .join("/");
      const range = request.headers.get("range");
      requests.push({
        method: request.method,
        path,
        range,
        credentials: request.credentials,
      });
      const body = files[path];
      if (!body)
        return new HttpResponse("missing", {
          status: 404,
          statusText: "Not Found",
        });
      const m = /^bytes=(\d+)-(\d+)$/.exec(range || "");
      if (ignoreRange || !m) return new HttpResponse(body, { status: 200 });
      const start = Number(m[1]);
      const end = Math.min(Number(m[2]), body.length - 1);
      return new HttpResponse(body.slice(start, end + 1), {
        status: 206,
        headers: { "Content-Range": `bytes ${start}-${end}/${body.length}` },
      });
    }),
    http.post(PATHS_INFO, async ({ request }) => {
      const paths = new URLSearchParams(await request.text()).getAll("paths");
      return HttpResponse.json(
        paths
          .filter((p) => files[p])
          .map((p) => ({ type: "file", path: p, size: files[p].length })),
      );
    }),
  );
}

const open = (path, options) => openRepoZip({ ...TARGET, path }, options);

async function makeZip(entries, options = {}) {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), options);
  for (const [name, data, entryOptions] of entries) {
    await writer.add(
      name,
      data === null ? undefined : new zip.Uint8ArrayReader(data),
      entryOptions,
    );
  }
  return writer.close();
}

beforeEach(() => {
  requests = [];
  // zip.js loads its Deflate64 / AES-HMAC wasm from data: URLs, as in the browser.
  server.use(http.get(/application\/wasm;base64,/, () => passthrough()));
});

describe("isZipArchivePath", () => {
  it("accepts zip-based extensions and the first 7-Zip volume", () => {
    for (const p of [
      "a.zip",
      "dir/B.ZIP",
      "x.zipx",
      "comic.cbz",
      "arrays.npz",
      "lib.jar",
      "pkg.whl",
      "book.epub",
      "parts/set.zip.001",
    ]) {
      expect(isZipArchivePath(p), p).toBe(true);
    }
  });

  it("rejects later volumes, Info-ZIP disks and other files", () => {
    for (const p of [
      "set.zip.002",
      "set.z01",
      "bundle.tar",
      "notes.json",
      "",
      null,
      42,
    ]) {
      expect(isZipArchivePath(p), String(p)).toBe(false);
    }
  });
});

describe("filename encodings", () => {
  const raw = (s, enc) => {
    if (enc === "utf-8") return text(s);
    // Legacy encoders are not exposed by TextEncoder: pull the bytes from the fixtures.
    throw new Error(`no encoder for ${enc}`);
  };

  it("keeps ASCII and valid UTF-8 names as UTF-8", () => {
    expect(guessFilenameEncoding([])).toBe("utf-8");
    expect(guessFilenameEncoding([text("plain.txt")])).toBe("utf-8");
    expect(guessFilenameEncoding([raw("日本語/ファイル.txt", "utf-8")])).toBe(
      "utf-8",
    );
  });

  it("detects Shift-JIS, GBK and Big5 from common characters", () => {
    expect(guessFilenameEncoding([Uint8Array.of(0x89, 0xe6, 0x91, 0x9c)])).toBe(
      "shift_jis",
    ); // 画像
    expect(guessFilenameEncoding([Uint8Array.of(0xb2, 0xe2, 0xca, 0xd4)])).toBe(
      "gbk",
    ); // 测试
    // GBK 图片 is also valid UTF-8 on its own: one name cannot tell them apart.
    expect(guessFilenameEncoding([Uint8Array.of(0xcd, 0xbc, 0xc6, 0xac)])).toBe(
      "utf-8",
    );
    expect(guessFilenameEncoding([Uint8Array.of(0xb9, 0xcf, 0xa4, 0xf9)])).toBe(
      "big5",
    ); // 圖片
  });

  it("falls back to the locale code page, then to CP437", () => {
    const cyrillic = Uint8Array.of(0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2); // "Привет" in CP866
    expect(guessFilenameEncoding([cyrillic], "ru-RU")).toBe("ibm866");
    expect(guessFilenameEncoding([cyrillic], "en-US")).toBe("cp437");
    expect(guessFilenameEncoding([cyrillic])).toBe("cp437");
    // A locale whose OEM code page cannot decode the bytes is ignored.
    expect(guessFilenameEncoding([Uint8Array.of(0x81, 0x30)], "ja")).toBe(
      "cp437",
    );
  });

  it("decodes only names that are not already Unicode", () => {
    const entry = {
      filename: "zip.js name",
      rawBitFlag: 0,
      rawFilename: Uint8Array.of(0x41, 0x89, 0xe6),
    };
    expect(decodeFilename({ ...entry, rawBitFlag: 0x800 }, "shift_jis")).toBe(
      "zip.js name",
    );
    expect(
      decodeFilename(
        { ...entry, extraFieldUnicodePath: { valid: true } },
        "shift_jis",
      ),
    ).toBe("zip.js name");
    expect(
      decodeFilename(
        { ...entry, extraFieldUnicodePath: { valid: false } },
        "shift_jis",
      ),
    ).toBe("A画");
    expect(decodeFilename(entry, "cp437")).toBe("Aëµ");
    expect(
      decodeFilename({ ...entry, rawFilename: Uint8Array.of(0xff) }, "cp437"),
    ).toBe("\u00a0");
    expect(decodeFilename(entry, "not-a-real-label")).toBe("zip.js name");
  });

  it("offers every candidate encoding in the selector list", () => {
    const values = FILENAME_ENCODINGS.map((e) => e.value);
    for (const enc of [
      "utf-8",
      "shift_jis",
      "gbk",
      "big5",
      "euc-kr",
      "cp437",
      "ibm866",
      "koi8-r",
    ]) {
      expect(values).toContain(enc);
    }
  });
});

describe("transport", () => {
  it("lists and reads with simple GET ranges that carry the session cookie", async () => {
    const bytes = await makeZip([
      ["hello.txt", text("hello\n")],
      ["docs/", null, { directory: true }],
      ["docs/readme.md", text("# readme\n")],
    ]);
    serveRepo({ "folder/a b.zip": bytes });
    const archive = await open("folder/a b.zip");
    expect(Object.keys(archive.files).sort()).toEqual([
      "docs/readme.md",
      "hello.txt",
    ]);
    expect(archive.files["hello.txt"].size).toBe(6);
    expect(archive.url).toBe(`${RESOLVE_PREFIX}folder/a%20b.zip`);
    expect(decode(await archive.read("docs/readme.md"))).toBe("# readme\n");
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) {
      expect(r.method).toBe("GET");
      expect(r.path).toBe("folder/a b.zip");
      expect(r.range).toMatch(/^bytes=\d+-\d+$/);
      expect(r.credentials).not.toBe("omit");
    }
  });

  it("forwards same-origin credentials on every fetch", async () => {
    const bytes = await makeZip([["a.txt", text("a")]]);
    serveRepo({ "a.zip": bytes });
    const spy = vi.spyOn(globalThis, "fetch");
    const archive = await open("a.zip");
    await archive.read("a.txt");
    expect(spy).toHaveBeenCalled();
    for (const [, init] of spy.mock.calls)
      expect(init.credentials).toBe("same-origin");
  });

  it("copes with a server that ignores Range and returns the whole object", async () => {
    const bytes = await makeZip([["a.txt", text("ignored range")]], {
      level: 0,
    });
    serveRepo({ "a.zip": bytes }, { ignoreRange: true });
    const archive = await open("a.zip");
    expect(decode(await archive.read("a.txt"))).toBe("ignored range");
  });

  it("returns a prefix for partial reads and still reads members in full", async () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    const bytes = await makeZip(
      [
        ["big.bin", big],
        ["empty.bin", new Uint8Array(0)],
      ],
      { level: 0 },
    );
    serveRepo({ "a.zip": bytes });
    const archive = await open("a.zip");
    const head = await archive.read("big.bin", { limit: 1000 });
    expect(Array.from(head)).toEqual(Array.from(big.subarray(0, 1000)));
    expect(await archive.read("big.bin", { limit: 10_000_000 })).toEqual(big);
    expect((await archive.read("empty.bin")).length).toBe(0);
    expect((await archive.read("empty.bin", { limit: 10 })).length).toBe(0);
  });

  it("propagates an abort from the caller during a partial read", async () => {
    const big = new Uint8Array(300_000).fill(7);
    serveRepo({ "a.zip": await makeZip([["big.bin", big]], { level: 0 }) });
    const archive = await open("a.zip");
    const controller = new AbortController();
    controller.abort();
    await expect(
      archive.read("big.bin", { limit: 1000, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      archive.read("big.bin", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops a partial read when the caller aborts while it runs", async () => {
    const big = new Uint8Array(300_000).fill(9);
    serveRepo({ "a.zip": await makeZip([["big.bin", big]], { level: 0 }) });
    const archive = await open("a.zip");
    const controller = new AbortController();
    const pending = archive.read("big.bin", {
      limit: 200_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a missing first 7-Zip volume as not found", async () => {
    serveRepo({});
    await expect(open("parts/missing.zip.001")).rejects.toMatchObject({
      kind: "fetch",
      status: 404,
    });
  });

  it("surfaces HTTP failures with their status", async () => {
    serveRepo({});
    await expect(open("missing.zip")).rejects.toMatchObject({
      name: "ZipArchiveError",
      kind: "fetch",
      status: 404,
    });

    const bytes = await makeZip([["a.txt", text("a")]]);
    server.use(
      http.post(PATHS_INFO, () =>
        HttpResponse.json([
          { type: "file", path: "gone.zip", size: bytes.length },
        ]),
      ),
      http.get(
        `${RESOLVE_PREFIX}gone.zip`,
        () =>
          new HttpResponse("nope", { status: 403, statusText: "Forbidden" }),
      ),
    );
    await expect(open("gone.zip")).rejects.toMatchObject({
      kind: "fetch",
      status: 403,
    });
  });

  it("rejects short range bodies", async () => {
    const reader = new RangeReader(`${RESOLVE_PREFIX}short.zip`, 100);
    server.use(
      http.get(
        `${RESOLVE_PREFIX}short.zip`,
        () => new HttpResponse(new Uint8Array(3), { status: 206 }),
      ),
    );
    await expect(reader.readUint8Array(0, 10)).rejects.toMatchObject({
      kind: "fetch",
      status: 206,
    });
    expect((await reader.readUint8Array(100, 10)).length).toBe(0);
  });

  it("streams a whole member body with one ranged request", async () => {
    const body = new Uint8Array(64).map((_, i) => i);
    serveRepo({ "s.bin": body });
    const reader = new RangeReader(`${RESOLVE_PREFIX}s.bin`, body.length);
    const read = async (stream) =>
      new Uint8Array(await new Response(stream).arrayBuffer());
    expect(
      Array.from(await read(reader.createReadable({ offset: 8, size: 16 }))),
    ).toEqual(Array.from(body.subarray(8, 24)));
    expect(
      (await read(reader.createReadable({ offset: 8, size: 0 }))).length,
    ).toBe(0);
    expect((await read(reader.createReadable({ offset: 60 }))).length).toBe(4);
    expect(requests.filter((r) => r.range === "bytes=8-23")).toHaveLength(1);
    // A cancelled stream aborts its request instead of draining it.
    const cancelled = reader.createReadable({ offset: 0, size: 64 });
    const streamReader = cancelled.getReader();
    await streamReader.read();
    await streamReader.cancel();
  });

  it("reports a body that breaks off mid-stream as a transport error", async () => {
    server.use(
      http.get(`${RESOLVE_PREFIX}cut.bin`, () => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4));
            controller.error(new TypeError("network connection lost"));
          },
        });
        return new HttpResponse(body, { status: 206 });
      }),
    );
    const reader = new RangeReader(`${RESOLVE_PREFIX}cut.bin`, 64);
    const read = new Response(
      reader.createReadable({ offset: 0, size: 64 }),
    ).arrayBuffer();
    await expect(read).rejects.toMatchObject({
      name: "ZipArchiveError",
      kind: "fetch",
    });
  });

  it("lets an abort through when a stream is cancelled before its response", async () => {
    let respond;
    server.use(
      http.get(`${RESOLVE_PREFIX}slow.bin`, async () => {
        await new Promise((r) => (respond = r));
        return new HttpResponse(new Uint8Array(8), { status: 206 });
      }),
    );
    const reader = new RangeReader(`${RESOLVE_PREFIX}slow.bin`, 8);
    const stream = reader.createReadable({ offset: 0, size: 8 }).getReader();
    const pending = stream.read();
    await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
    await stream.cancel();
    respond();
    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it("streams from a server that ignores Range", async () => {
    const body = new Uint8Array(32).map((_, i) => i);
    serveRepo({ "s.bin": body }, { ignoreRange: true });
    const reader = new RangeReader(`${RESOLVE_PREFIX}s.bin`, body.length);
    const out = new Uint8Array(
      await new Response(
        reader.createReadable({ offset: 4, size: 8 }),
      ).arrayBuffer(),
    );
    expect(Array.from(out)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("concatenates byte-split volumes across part boundaries", async () => {
    const parts = [
      Uint8Array.of(0, 1, 2),
      Uint8Array.of(3, 4),
      Uint8Array.of(5, 6, 7),
    ];
    const reader = new ConcatReader(
      parts.map((p) => new zip.Uint8ArrayReader(p)),
    );
    await Promise.all(reader.readers.map((r) => r.init?.()));
    expect(reader.size).toBe(8);
    expect(Array.from(await reader.readUint8Array(2, 5))).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(Array.from(await reader.readUint8Array(6, 10))).toEqual([6, 7]);
  });
});

describe("layout and names", () => {
  it("normalizes unsafe names, skips directories and keeps the first duplicate", async () => {
    serveRepo({ "odd.zip": fixture("names-odd.zip") });
    const archive = await open("odd.zip");
    expect(Object.keys(archive.files).sort()).toEqual([
      "a/b/c.txt",
      "abs/path.txt",
      "dup.txt",
      "empty.txt",
      "escape.txt",
    ]);
    expect(decode(await archive.read("dup.txt"))).toBe("first\n");
    expect(decode(await archive.read("escape.txt"))).toBe("traversal\n");
    expect(archive.encrypted).toBe(false);
    expect(archive.needsPassword).toBe(false);
    await expect(archive.read("nope.txt")).rejects.toMatchObject({
      kind: "format",
    });
  });

  it("reads backslash separators written by Windows tools", async () => {
    serveRepo({
      "w.zip": await makeZip([
        ["win\\dir\\a.txt", text("a")],
        ["win\\dir\\", new Uint8Array(0)],
        ["unix/b\\c.txt", text("b")],
      ]),
    });
    const archive = await open("w.zip");
    expect(Object.keys(archive.files).sort()).toEqual([
      "unix/b\\c.txt",
      "win/dir/a.txt",
    ]);
    expect(decode(await archive.read("win/dir/a.txt"))).toBe("a");
  });

  it("opens an empty archive", async () => {
    serveRepo({ "empty.zip": fixture("empty.zip") });
    const archive = await open("empty.zip");
    expect(archive.files).toEqual({});
    expect(await archive.unlock("anything")).toBe(false);
  });

  it("detects legacy code pages and lets the caller switch", async () => {
    serveRepo({
      "sjis.zip": fixture("names-shiftjis.zip"),
      "gbk.zip": fixture("names-gbk.zip"),
      "cp866.zip": fixture("names-cp866.zip"),
    });
    const sjis = await open("sjis.zip");
    expect(sjis.legacyNames).toBe(true);
    expect(sjis.detectedEncoding).toBe("shift_jis");
    expect(Object.keys(sjis.files).sort()).toEqual([
      "テスト資料.txt",
      "画像/猫.txt",
    ]);
    expect(decode(await sjis.read("画像/猫.txt"))).toBe("画像/猫.txt\n");
    const switched = sjis.setEncoding("gbk");
    expect(sjis.encoding).toBe("gbk");
    expect(Object.keys(switched)).not.toContain("画像/猫.txt");

    const gbk = await open("gbk.zip");
    expect(Object.keys(gbk.files).sort()).toEqual([
      "图片/猫猫.txt",
      "测试资料.txt",
    ]);

    expect(
      Object.keys((await open("cp866.zip", { lang: "ru" })).files),
    ).toEqual(["Привет/мир.txt"]);
    expect((await open("cp866.zip", { lang: "en" })).encoding).toBe("cp437");
  });

  it("keeps Info-ZIP Unicode Path names", async () => {
    serveRepo({ "u.zip": fixture("thirdparty-libarchive-unicode-path.zip") });
    const archive = await open("u.zip");
    expect(Object.keys(archive.files)).toContain("File 4 - å.txt");
    expect(archive.legacyNames).toBe(true);
  });
});

describe("compression methods", () => {
  const SOURCE = {
    "hello.txt": "hello from the zip fixture\n",
    "docs/readme.md": "# Fixture\n\nNested markdown member.\n",
    "data/table.csv": CSV,
  };

  it.each([
    "methods-bzip2.zip",
    "methods-lzma.zip",
    "methods-lzma-7z.zip",
    "methods-zstd.zip",
    "methods-deflate64.zip",
  ])("decodes every member of %s", async (name) => {
    serveRepo({ [name]: fixture(name) });
    const archive = await open(name);
    for (const path of Object.keys(archive.files)) {
      const bytes = await archive.read(path); // checkCrc32 runs inside
      expect(bytes.length).toBe(archive.files[path].size);
      if (SOURCE[path]) expect(decode(bytes)).toBe(SOURCE[path]);
    }
  });

  it.each([
    ["thirdparty-libarchive-xz.zipx"],
    ["thirdparty-libarchive-lzma-sized.zipx"],
    ["thirdparty-ziprs-implode.zip"],
    ["thirdparty-ziprs-shrink.zip"],
    ["thirdparty-ziprs-reduce.zip"],
  ])("decodes %s", async (name) => {
    serveRepo({ [name]: fixture(name) });
    const archive = await open(name);
    const paths = Object.keys(archive.files);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect((await archive.read(path)).length).toBe(archive.files[path].size);
    }
  });

  it("reports PPMd as unsupported", async () => {
    serveRepo({ "ppmd.zip": fixture("methods-ppmd.zip") });
    const archive = await open("ppmd.zip");
    await expect(archive.read("data/table.csv")).rejects.toMatchObject({
      kind: "unsupported",
      method: 98,
    });
  });
});

describe("encryption", () => {
  it.each([
    ["crypto-aes256.zip"],
    ["crypto-zipcrypto.zip"],
    ["crypto-zipcrypto-stream.zip"],
  ])("asks once for the password of %s", async (name) => {
    serveRepo({ [name]: fixture(name) });
    const archive = await open(name);
    expect(archive.encrypted).toBe(true);
    expect(archive.needsPassword).toBe(true);
    await expect(archive.read("hello.txt")).rejects.toMatchObject({
      kind: "password",
    });
    expect(await archive.unlock("wrong")).toBe(false);
    expect(archive.needsPassword).toBe(true);
    expect(await archive.unlock("secret")).toBe(true);
    expect(await archive.unlock("secret")).toBe(true);
    expect(archive.passwords).toEqual(["secret"]);
    expect(archive.needsPassword).toBe(false);
    expect(decode(await archive.read("hello.txt"))).toBe(
      "hello from the zip fixture\n",
    );
    expect(decode(await archive.read("data/table.csv"))).toBe(CSV);
    expect((await archive.read("images/noise.jpg", { limit: 64 })).length).toBe(
      64,
    );
  });

  it("decrypts AES over a plug-in codec", async () => {
    serveRepo({ "a.zip": fixture("crypto-aes256-bzip2.zip") });
    const archive = await open("a.zip");
    expect(await archive.unlock("secret")).toBe(true);
    expect((await archive.read("images/noise.jpg")).length).toBe(
      archive.files["images/noise.jpg"].size,
    );
  });

  it("reads plain members of a partially encrypted archive before unlocking", async () => {
    serveRepo({ "p.zip": fixture("crypto-partial.zip") });
    const archive = await open("p.zip");
    expect(archive.needsPassword).toBe(true);
    expect(decode(await archive.read("hello.txt"))).toBe(
      "hello from the zip fixture\n",
    );
    await expect(archive.read("docs/readme.md")).rejects.toMatchObject({
      kind: "password",
    });
  });

  it("asks again only for members that use another password", async () => {
    serveRepo({ "two.zip": fixture("crypto-two-passwords.zip") });
    const archive = await open("two.zip");
    expect(await archive.unlock("alpha")).toBe(true);
    expect(decode(await archive.read("hello.txt"))).toBe(
      "hello from the zip fixture\n",
    );
    await expect(archive.read("data/table.csv")).rejects.toMatchObject({
      kind: "password",
    });
    expect(await archive.unlock("gamma", "data/table.csv")).toBe(false);
    expect(await archive.unlock("beta", "data/table.csv")).toBe(true);
    expect(decode(await archive.read("data/table.csv"))).toBe(CSV);
    expect(decode(await archive.read("hello.txt"))).toBe(
      "hello from the zip fixture\n",
    );
  });

  it("accepts a password that opens any of the smallest members, not just the smallest", async () => {
    const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter());
    await writer.add("tiny-beta.txt", new zip.Uint8ArrayReader(text("b")), {
      password: "beta",
    });
    await writer.add(
      "bigger-alpha.txt",
      new zip.Uint8ArrayReader(text("alpha member contents")),
      { password: "alpha" },
    );
    serveRepo({ "mixed.zip": await writer.close() });
    const archive = await open("mixed.zip");
    expect(await archive.unlock("alpha")).toBe(true);
    expect(
      new TextDecoder().decode(await archive.read("bigger-alpha.txt")),
    ).toBe("alpha member contents");
    await expect(archive.read("tiny-beta.txt")).rejects.toMatchObject({
      kind: "password",
    });
    expect(await archive.unlock("gamma")).toBe(false);
  });

  it("verifies large members with the password check only", async () => {
    const big = new Uint8Array(9 * 1024 * 1024).fill(3);
    serveRepo({
      "big.zip": await makeZip([["big.bin", big]], {
        password: "pw",
        level: 0,
      }),
    });
    const archive = await open("big.zip");
    expect(await archive.unlock("nope")).toBe(false);
    expect(await archive.unlock("pw")).toBe(true);
  });

  it("verifies against a supported member when the smallest one cannot be decoded", async () => {
    serveRepo({
      "mixed.zip": await makeZip([["a.txt", text("aaaa")]], { password: "pw" }),
    });
    const archive = await open("mixed.zip");
    const [entry] = archive.entries;
    Object.defineProperty(entry, "compressionMethod", { value: 98 });
    // Only an undecodable member left: the password is still checked.
    expect(await archive.unlock("wrong")).toBe(false);
    expect(await archive.unlock("pw")).toBe(true);
  });

  it("propagates transport errors while checking a password", async () => {
    serveRepo({ "a.zip": fixture("crypto-aes256.zip") });
    const archive = await open("a.zip");
    server.use(
      http.get(
        `${RESOLVE_PREFIX}a.zip`,
        () =>
          new HttpResponse("down", { status: 503, statusText: "Unavailable" }),
      ),
    );
    await expect(archive.unlock("secret")).rejects.toMatchObject({
      kind: "fetch",
      status: 503,
    });
    await expect(archive.unlock("secret", "hello.txt")).rejects.toMatchObject({
      kind: "fetch",
      status: 503,
    });
  });

  it("names unknown compression methods by number", async () => {
    serveRepo({ "m.zip": await makeZip([["a.txt", text("a")]]) });
    const archive = await open("m.zip");
    Object.defineProperty(archive.entries[0], "compressionMethod", {
      value: 200,
    });
    await expect(archive.read("a.txt")).rejects.toMatchObject({
      kind: "unsupported",
      method: 200,
      message: expect.stringContaining("method 200"),
    });
  });

  it("flags PKWARE strong encryption as unsupported", async () => {
    serveRepo({
      "s.zip": fixture("thirdparty-libarchive-strong-encryption.zip"),
    });
    const archive = await open("s.zip");
    expect(archive.encrypted).toBe(false);
    const [path] = Object.keys(archive.files);
    await expect(archive.read(path)).rejects.toMatchObject({
      kind: "unsupported",
    });
  });

  it("refuses an encrypted central directory", async () => {
    serveRepo({
      "h.zip": fixture("thirdparty-libarchive-encrypted-directory.zip"),
    });
    await expect(open("h.zip")).rejects.toMatchObject({ kind: "unsupported" });
  });

  // A wrong password that passes the 1-byte ZipCrypto check of `entry`.
  async function falseAccept(entry) {
    for (let i = 0; i < 20_000; i++) {
      const candidate = `guess-${i}`;
      const ok = await entry
        .getData(new zip.Uint8ArrayWriter(), {
          password: candidate,
          checkPasswordOnly: true,
        })
        .then(
          () => true,
          () => false,
        );
      if (ok) return candidate;
    }
    throw new Error("no false accept found");
  }

  async function zipCryptoEntries(bytes) {
    return new zip.ZipReader(new zip.Uint8ArrayReader(bytes)).getEntries();
  }

  it("tries the next remembered password after a ZipCrypto false accept", async () => {
    const body = text("deflated payload ".repeat(400));
    const bytes = await makeZip([["a.txt", body]], {
      password: "secret",
      zipCrypto: true,
      level: 9,
    });
    const [entry] = await zipCryptoEntries(bytes);
    const wrong = await falseAccept(entry);
    serveRepo({ "z.zip": bytes });
    const archive = await open("z.zip");
    expect(await archive.unlock(wrong)).toBe(false); // the CRC catches it
    archive.passwords.push(wrong); // as if another member had accepted it
    expect(await archive.unlock("secret")).toBe(true);
    expect(decode(await archive.read("a.txt"))).toBe(decode(body));
  });

  it("reports a dropped connection as a transport error, not a password problem", async () => {
    serveRepo({ "c.zip": fixture("crypto-zipcrypto.zip") });
    const archive = await open("c.zip");
    expect(await archive.unlock("secret")).toBe(true);
    server.use(http.get(`${RESOLVE_PREFIX}c.zip`, () => HttpResponse.error()));
    await expect(archive.read("hello.txt")).rejects.toMatchObject({
      kind: "fetch",
    });
    await expect(archive.unlock("secret", "hello.txt")).rejects.toMatchObject({
      kind: "fetch",
    });
    await expect(archive.unlock("secret")).rejects.toMatchObject({
      kind: "fetch",
    });
  });

  it("reports a damaged local header of a ZipCrypto member as a format error", async () => {
    const bytes = await makeZip([["a.txt", text("payload")]], {
      password: "pw",
      zipCrypto: true,
    });
    serveRepo({ "h.zip": bytes });
    const archive = await open("h.zip");
    expect(await archive.unlock("pw")).toBe(true);
    bytes[archive.entries[0].offset] = 0; // break the "PK\x03\x04" signature
    await expect(archive.read("a.txt")).rejects.toMatchObject({
      kind: "format",
      message: expect.stringContaining("Local file header"),
    });
    await expect(archive.unlock("pw", "a.txt")).rejects.toMatchObject({
      kind: "format",
    });
  });

  it("accepts the right password when a smaller member false-accepts it", async () => {
    let bytes;
    let password;
    for (let i = 0; !password; i++) {
      const candidate = `beta-${i}`;
      const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
        zipCrypto: true,
      });
      await writer.add("small.txt", new zip.Uint8ArrayReader(text("a")), {
        password: "alpha",
      });
      await writer.add(
        "large.txt",
        new zip.Uint8ArrayReader(text("large member ".repeat(50))),
        { password: candidate },
      );
      bytes = await writer.close();
      const [small] = await zipCryptoEntries(bytes);
      const ok = await small
        .getData(new zip.Uint8ArrayWriter(), {
          password: candidate,
          checkPasswordOnly: true,
        })
        .then(
          () => true,
          () => false,
        );
      if (ok) password = candidate;
    }
    serveRepo({ "two.zip": bytes });
    const archive = await open("two.zip");
    expect(await archive.unlock(password)).toBe(true);
    expect(decode(await archive.read("large.txt"))).toBe(
      "large member ".repeat(50),
    );
    await expect(archive.read("small.txt")).rejects.toMatchObject({
      kind: "password",
    });
  }, 30_000); // ~256 tries to hit a 1-in-256 false accept

  it("reports a damaged AES member as corrupted, not as a password problem", async () => {
    const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
      password: "pw",
      level: 0,
    });
    await writer.add("good.txt", new zip.Uint8ArrayReader(text("ok")));
    await writer.add(
      "bad.txt",
      new zip.Uint8ArrayReader(text("this member gets damaged ".repeat(20))),
    );
    const bytes = await writer.close();
    const bad = (await zipCryptoEntries(bytes)).find(
      (e) => e.filename === "bad.txt",
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const dataStart =
      bad.offset +
      30 +
      view.getUint16(bad.offset + 26, true) +
      view.getUint16(bad.offset + 28, true);
    bytes[dataStart + 18 + 5] ^= 0xff; // past the 16-byte salt and 2-byte verifier
    serveRepo({ "aes.zip": bytes });
    const archive = await open("aes.zip");
    expect(await archive.unlock("pw")).toBe(true);
    await expect(archive.read("bad.txt")).rejects.toMatchObject({
      kind: "format",
      message: expect.stringContaining("corrupted"),
    });
    await expect(archive.unlock("pw", "bad.txt")).rejects.toMatchObject({
      kind: "format",
    });
    expect(await archive.unlock("nope", "bad.txt")).toBe(false);
  });

  it("keeps unlocking when one sampled member fails to download", async () => {
    const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
      password: "pw",
    });
    await writer.add("a.txt", new zip.Uint8ArrayReader(text("a")));
    await writer.add("bb.txt", new zip.Uint8ArrayReader(text("bb")));
    const bytes = await writer.close();
    serveRepo({ "s.zip": bytes });
    const archive = await open("s.zip");
    const smallest = archive.entries.find((e) => e.filename === "a.txt");
    server.use(
      http.get(`${RESOLVE_PREFIX}s.zip`, ({ request }) => {
        const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(
          request.headers.get("range"),
        );
        if (Number(a) === smallest.offset)
          return new HttpResponse("x", { status: 500, statusText: "Boom" });
        return new HttpResponse(
          bytes.slice(Number(a), Math.min(Number(b), bytes.length - 1) + 1),
          { status: 206 },
        );
      }),
    );
    expect(await archive.unlock("pw")).toBe(true);
    expect(decode(await archive.read("bb.txt"))).toBe("bb");
  });

  it("maps a corrupted member to a format error", async () => {
    const bytes = await makeZip(
      [["a.txt", text("payload that will be corrupted")]],
      { level: 0 },
    );
    const at = decode(bytes).indexOf("payload");
    bytes[at] ^= 0xff;
    serveRepo({ "c.zip": bytes });
    const archive = await open("c.zip");
    await expect(archive.read("a.txt")).rejects.toMatchObject({
      kind: "format",
    });
  });
});

describe("volumes and damaged archives", () => {
  const BLOB = 180_000;
  const infoZip = {
    "sets/split-infozip.z01": fixture("split-infozip.z01"),
    "sets/split-infozip.z02": fixture("split-infozip.z02"),
    "sets/split-infozip.zip": fixture("split-infozip.zip"),
  };

  it("joins an Info-ZIP disk set opened from its last .zip disk", async () => {
    serveRepo(infoZip);
    const archive = await open("sets/split-infozip.zip");
    expect(archive.volumes).toBe(3);
    expect((await archive.read("blob.bin")).length).toBe(BLOB);
    expect(decode(await archive.read("data/table.csv"))).toBe(CSV);
  });

  it("names the missing disk of an incomplete set", async () => {
    const { "sets/split-infozip.z02": _missing, ...rest } = infoZip;
    serveRepo(rest);
    await expect(open("sets/split-infozip.zip")).rejects.toMatchObject({
      kind: "format",
      message: expect.stringContaining("split-infozip.z02"),
    });
  });

  it("joins 7-Zip volumes opened from .001", async () => {
    serveRepo({
      "v/split-7z.zip.001": fixture("split-7z.zip.001"),
      "v/split-7z.zip.002": fixture("split-7z.zip.002"),
      "v/split-7z.zip.003": fixture("split-7z.zip.003"),
    });
    const archive = await open("v/split-7z.zip.001");
    expect(archive.volumes).toBe(3);
    expect((await archive.read("blob.bin")).length).toBe(BLOB);
  });

  it("stops probing 7-Zip volumes after the last possible number", async () => {
    const bytes = fixture("split-7z.zip.001");
    server.use(
      http.post(PATHS_INFO, async ({ request }) => {
        const paths = new URLSearchParams(await request.text()).getAll("paths");
        return HttpResponse.json(
          paths.map((p) => ({ type: "file", path: p, size: bytes.length })),
        );
      }),
    );
    const locator = repoZipLocator(TARGET);
    const sizes = await locator.sizeOf(["x.zip.001"]);
    expect(sizes.get("x.zip.001")).toBe(bytes.length);
    // Every name "exists": probing must still terminate at .999.
    const parts = await resolveVolumes("x.zip.001", locator.sizeOf);
    expect(parts).toHaveLength(999);
    expect(parts.at(-1).path).toBe("x.zip.999");
  });

  const pattern = (n, step) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (i * step) & 0xff;
    return out;
  };
  const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));

  async function bigStoredZip() {
    const big = pattern(1_600_000, 7);
    return { big, bytes: await makeZip([["big.bin", big]], { level: 0 }) };
  }

  it("streams a member across 7-Zip volumes with one request per volume", async () => {
    const { big, bytes } = await bigStoredZip();
    const cut = [0, 500_000, 1_100_000, bytes.length];
    serveRepo(
      Object.fromEntries(
        [1, 2, 3].map((n) => [`r.zip.00${n}`, bytes.slice(cut[n - 1], cut[n])]),
      ),
    );
    const archive = await open("r.zip.001");
    requests.length = 0;
    expect(same(await archive.read("big.bin"), big)).toBe(true);
    // The local header (fixed part, then name + extra), then one stream per volume.
    expect(requests).toHaveLength(2 + 3);
  });

  it("streams a member across Info-ZIP disks with one request per disk", async () => {
    const big = pattern(1_600_000, 5);
    const disks = [];
    async function* writers() {
      for (;;) {
        const writer = new zip.Uint8ArrayWriter();
        disks.push(writer);
        yield writer;
      }
    }
    const zipWriter = new zip.ZipWriter(
      new zip.SplitDataWriter(writers(), 600_000),
      { level: 0 },
    );
    await zipWriter.add("big.bin", new zip.Uint8ArrayReader(big));
    await zipWriter.close();
    const parts = await Promise.all(disks.map((w) => w.getData()));
    const files = Object.fromEntries(
      parts.map((p, i) => [
        i === parts.length - 1 ? "d.zip" : `d.z0${i + 1}`,
        p,
      ]),
    );
    serveRepo(files);
    const archive = await open("d.zip");
    expect(archive.volumes).toBe(parts.length);
    requests.length = 0;
    expect(same(await archive.read("big.bin"), big)).toBe(true);
    expect(requests).toHaveLength(2 + parts.length);
  });

  it("cancels a stream that spans volumes", async () => {
    const parts = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)];
    serveRepo({ p1: parts[0], p2: parts[1] });
    const reader = new ConcatReader(
      parts.map(
        (p, i) => new RangeReader(`${RESOLVE_PREFIX}p${i + 1}`, p.length),
      ),
    );
    await reader.createReadable({ offset: 0, size: 5 }).cancel();
    const stream = reader.createReadable({ offset: 1, size: 4 }).getReader();
    expect(Array.from((await stream.read()).value)).toEqual([2, 3]);
    await stream.cancel();
    expect(
      (await new Response(reader.createReadable({ offset: 3 })).arrayBuffer())
        .byteLength,
    ).toBe(2);
  });

  it("reads archives with prepended data", async () => {
    serveRepo({ "sfx.zip": fixture("prefix-sfx.zip") });
    const archive = await open("sfx.zip");
    expect(decode(await archive.read("hello.txt"))).toBe(
      "hello from the zip fixture\n",
    );
  });

  it("repairs an EOCD that points at missing ZIP64 records", async () => {
    serveRepo({ "z.zip": fixture("zip64-missing-records.zip") });
    const archive = await open("z.zip");
    expect(decode(await archive.read("docs/readme.md"))).toBe(
      "# Fixture\n\nNested markdown member.\n",
    );
  });

  it("gives up on the repair when no central directory sits where it should", async () => {
    const broken = fixture("zip64-missing-records.zip");
    const cd = broken.findIndex(
      (b, i) =>
        b === 0x50 &&
        broken[i + 1] === 0x4b &&
        broken[i + 2] === 1 &&
        broken[i + 3] === 2,
    );
    broken[cd + 2] = 9;
    serveRepo({ "z.zip": broken });
    await expect(open("z.zip")).rejects.toMatchObject({ kind: "format" });
    expect(
      await repairMissingZip64Records(
        new zip.Uint8ArrayReader(fixture("names-odd.zip")),
      ),
    ).toBeNull();
    const huge = fixture("zip64-missing-records.zip");
    const eocd = huge.length - 22;
    new DataView(huge.buffer).setUint32(eocd + 12, 0xfffffff0, true); // CD size larger than the file
    expect(
      await repairMissingZip64Records(new zip.Uint8ArrayReader(huge)),
    ).toBeNull();
    expect(
      await repairMissingZip64Records(
        new zip.Uint8ArrayReader(new Uint8Array(40)),
      ),
    ).toBeNull();
  });

  it("reports a repaired archive whose central directory stays unreadable", async () => {
    const broken = fixture("zip64-missing-records.zip");
    const signatures = [];
    broken.forEach((b, i) => {
      if (
        b === 0x50 &&
        broken[i + 1] === 0x4b &&
        broken[i + 2] === 1 &&
        broken[i + 3] === 2
      )
        signatures.push(i);
    });
    broken.fill(0xee, signatures[1] + 4, signatures[1] + 46); // garble the second record's header fields
    serveRepo({ "z.zip": broken });
    await expect(open("z.zip")).rejects.toMatchObject({
      name: "ZipArchiveError",
    });
  });

  it("rejects bytes that are not a zip", async () => {
    serveRepo({ "fake.zip": text("definitely not a zip archive, just text") });
    await expect(open("fake.zip")).rejects.toMatchObject({
      name: "ZipArchiveError",
      kind: "format",
    });
  });

  it("rejects a file that only carries the split-archive signature", async () => {
    const bytes = new Uint8Array(200);
    bytes.set([0x50, 0x4b, 0x07, 0x08]);
    serveRepo({ "sig.zip": bytes });
    await expect(open("sig.zip")).rejects.toMatchObject({ kind: "format" });
  });

  it("exposes the error class", () => {
    const err = new ZipArchiveError("x", { kind: "fetch", status: 500 });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
    expect(new ZipArchiveError("y").kind).toBe("format");
  });
});
