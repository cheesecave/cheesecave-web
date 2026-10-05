// src/utils/zip-archive.js
//
// Pure-client zip reader for the repo file browser (the zip mode of
// TarBrowserPanel). The central directory gives the whole path tree; a
// member is materialized by reading only its own bytes. Every request is
// a GET with one simple `Range: bytes=a-b` against /resolve/ — the same
// transport the indexed-tar reader uses — so private repos work through
// the SPA session cookie and the presigned-URL redirect, and sizes come
// from paths-info instead of a HEAD (presigned URLs are signed for GET).
//
// zip.js parses the format: ZIP64, data descriptors, prepended data,
// ZipCrypto and WinZip AES, Deflate64 and Info-ZIP disk sets. Decoders
// for rarer methods load on demand from ./zip-codecs.js.

import {
  ERR_ENCRYPTED,
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND,
  ERR_INVALID_AUTHENTICATION_CODE,
  ERR_INVALID_CRC32,
  ERR_INVALID_PASSWORD,
  ERR_SPLIT_ZIP_FILE,
  Reader,
  SplitDataReader,
  Uint8ArrayWriter,
  ZipReader,
  configure,
} from "@zip.js/zip.js";

import { repoAPI } from "@/utils/api";
import { buildResolveUrl } from "@/utils/file-preview";
import { normalizeSegments } from "@/utils/indexed-tar";

// The decoders run on the main thread like the indexed-tar reader; it
// also keeps zip.js from spawning blob-URL workers.
configure({ useWebWorkers: false });

const FIRST_RAW_VOLUME = /\.zip\.001$/i;
const MAX_RAW_VOLUME = 999;
const VOLUME_PROBE_BATCH = 16;
const STRONG_ENCRYPTION_FLAG = 0x40;
// Above this size a password is checked with the verifier bytes only
// instead of decrypting the whole member.
const FULL_VERIFY_MAX_BYTES = 8 * 1024 * 1024;
// Encrypted members probed in parallel when a password is typed at entry.
const UNLOCK_SAMPLE_SIZE = 8;
const EOCD_LENGTH = 22;
const EOCD_SEARCH_LENGTH = EOCD_LENGTH + 0xffff;

const CODEC_METHODS = new Set([1, 2, 3, 4, 5, 6, 12, 14, 93, 95]);
const SUPPORTED_METHODS = new Set([0, 8, 9, ...CODEC_METHODS]);
const METHOD_NAMES = { 96: "JPEG", 97: "WavPack", 98: "PPMd" };

/**
 * kind: "fetch" (carries the HTTP `status`), "format", "password" or
 * "unsupported" (carries the compression `method` when that is the cause).
 */
export class ZipArchiveError extends Error {
  constructor(message, { kind = "format", status, method } = {}) {
    super(message);
    this.name = "ZipArchiveError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
    if (method !== undefined) this.method = method;
  }
}

async function rangeFetch(url, start, end, signal) {
  // `same-origin` forwards the session cookie on the /resolve/ hop and the
  // browser drops it on the cross-origin redirect to the presigned URL.
  // Only `bytes=a-b` is used: it is CORS-safelisted, so the redirected
  // request needs no preflight (suffix and multi ranges do, and MinIO
  // answers a multi range with the whole object).
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
    mode: "cors",
    credentials: "same-origin",
    signal,
  });
  if (response.status !== 206 && response.status !== 200) {
    throw new ZipArchiveError(
      `Failed to read the zip (${response.status} ${response.statusText})`,
      { kind: "fetch", status: response.status },
    );
  }
  return response;
}

async function rangeBody(response, start, end) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  // A server that ignores Range answers 200 with the whole object.
  const slice =
    response.status === 200 ? bytes.subarray(start, end + 1) : bytes;
  if (slice.length !== end - start + 1) {
    throw new ZipArchiveError(
      `Short read: got ${slice.length} of ${end - start + 1} bytes`,
      { kind: "fetch", status: response.status },
    );
  }
  return slice;
}

export class RangeReader extends Reader {
  constructor(url, size) {
    super();
    this.url = url;
    this.size = size;
  }

  async readUint8Array(index, length) {
    const end = Math.min(index + length, this.size) - 1;
    if (end < index) return new Uint8Array(0);
    return rangeBody(await rangeFetch(this.url, index, end), index, end);
  }

  // One streamed request per member body instead of zip.js's 256 KiB chunks.
  createReadable({ offset = 0, size } = {}) {
    if (size === undefined) return super.createReadable({ offset });
    const end = Math.min(offset + size, this.size) - 1;
    if (end < offset) return new ReadableStream({ start: (c) => c.close() });
    const { url } = this;
    const controller = new AbortController();
    let body;
    return new ReadableStream({
      async start() {
        const response = await rangeFetch(url, offset, end, controller.signal);
        body =
          response.status === 200
            ? new Response(
                await rangeBody(response, offset, end),
              ).body.getReader()
            : response.body.getReader();
      },
      async pull(stream) {
        const { done, value } = await body.read();
        if (done) stream.close();
        else stream.enqueue(value);
      },
      cancel() {
        controller.abort();
      },
    });
  }
}

// 7-Zip `.zip.001/.002` volumes are a byte split of one ordinary zip (its
// EOCD says disk 0), so they read as one file. Info-ZIP `.z01 … .zip` disk
// sets keep per-disk offsets and use zip.js's SplitDataReader instead.
export class ConcatReader extends Reader {
  constructor(readers) {
    super();
    this.readers = readers;
    this.size = readers.reduce((sum, r) => sum + r.size, 0);
  }

  async readUint8Array(index, length) {
    const out = new Uint8Array(Math.min(length, this.size - index));
    let filled = 0;
    let base = 0;
    for (const reader of this.readers) {
      const from = index + filled - base;
      if (filled < out.length && from >= 0 && from < reader.size) {
        const chunk = await reader.readUint8Array(
          from,
          Math.min(out.length - filled, reader.size - from),
        );
        out.set(chunk, filled);
        filled += chunk.length;
      }
      base += reader.size;
    }
    return out;
  }
}

async function findEndOfCentralDirectory(reader) {
  const length = Math.min(reader.size, EOCD_SEARCH_LENGTH);
  const tail = await reader.readUint8Array(reader.size - length, length);
  for (let i = tail.length - EOCD_LENGTH; i >= 0; i--) {
    if (
      tail[i] === 0x50 &&
      tail[i + 1] === 0x4b &&
      tail[i + 2] === 5 &&
      tail[i + 3] === 6
    ) {
      return {
        offset: reader.size - length + i,
        view: new DataView(tail.buffer, tail.byteOffset + i, EOCD_LENGTH),
      };
    }
  }
  return null;
}

/**
 * Info-ZIP 3.0 `zip -fz` writing to a pipe stores 0xFFFFFFFF as the
 * central directory offset but no ZIP64 records. Like Python's zipfile,
 * derive the offset as EOCD position - CD size, check that a central
 * directory header starts there, and serve a patched EOCD. Returns null
 * when the archive does not have this defect.
 */
export async function repairMissingZip64Records(reader) {
  const eocd = await findEndOfCentralDirectory(reader);
  if (!eocd || eocd.view.getUint32(16, true) !== 0xffffffff) return null;
  const cdSize = eocd.view.getUint32(12, true);
  if (cdSize > eocd.offset) return null;
  const cdOffset = eocd.offset - cdSize;
  const signature = await reader.readUint8Array(cdOffset, 4);
  if (
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b ||
    signature[2] !== 1 ||
    signature[3] !== 2
  )
    return null;
  const patch = new Uint8Array(4);
  new DataView(patch.buffer).setUint32(0, cdOffset, true);
  const patchAt = eocd.offset + 16;
  return new (class extends Reader {
    constructor() {
      super();
      this.size = reader.size;
    }

    async readUint8Array(index, length) {
      const out = new Uint8Array(await reader.readUint8Array(index, length));
      for (let k = 0; k < 4; k++) {
        const at = patchAt + k - index;
        if (at >= 0 && at < out.length) out[at] = patch[k];
      }
      return out;
    }
  })();
}

// ---------------------------------------------------------------------
// Filename encodings
// ---------------------------------------------------------------------

export const FILENAME_ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "shift_jis", label: "Shift-JIS (Japanese)" },
  { value: "gbk", label: "GBK (Simplified Chinese)" },
  { value: "big5", label: "Big5 (Traditional Chinese)" },
  { value: "euc-kr", label: "EUC-KR (Korean)" },
  { value: "cp437", label: "CP437 (zip default)" },
  { value: "ibm866", label: "CP866 (Cyrillic, DOS)" },
  { value: "koi8-r", label: "KOI8-R" },
  { value: "windows-1251", label: "Windows-1251" },
  { value: "windows-1252", label: "Windows-1252" },
];

const CJK_ENCODINGS = ["shift_jis", "gbk", "big5", "euc-kr"];
// Windows' built-in zip writes names in the OEM code page.
const OEM_CODE_PAGE = {
  ru: "ibm866",
  uk: "ibm866",
  be: "ibm866",
  ja: "shift_jis",
  zh: "gbk",
  "zh-tw": "big5",
  "zh-hk": "big5",
  ko: "euc-kr",
};
const KANA = /[ぁ-ヿ]/u;
let commonCharacters = null;

// Frequently used characters of each code page, generated from its
// "level 1" byte block with TextDecoder so no tables are shipped.
function commonCharacterSets() {
  if (commonCharacters) return commonCharacters;
  const block = (encoding, leadFrom, leadTo, trailFrom, trailTo) => {
    const bytes = [];
    for (let a = leadFrom; a <= leadTo; a++)
      for (let b = trailFrom; b <= trailTo; b++) bytes.push(a, b);
    return new Set(new TextDecoder(encoding).decode(Uint8Array.from(bytes)));
  };
  commonCharacters = {
    shift_jis: block("shift_jis", 0x88, 0x98, 0x40, 0xfc), // JIS X 0208 level-1 kanji
    gbk: block("gbk", 0xb0, 0xd7, 0xa1, 0xfe), // GB2312 level-1 hanzi
    big5: block("big5", 0xa4, 0xc6, 0x40, 0xfe), // Big5 frequently used hanzi
    "euc-kr": block("euc-kr", 0xb0, 0xc8, 0xa1, 0xfe), // KS X 1001 hangul
  };
  return commonCharacters;
}

function strictDecode(encoding, bytes) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Guess one encoding for the archive's non-UTF-8 names: UTF-8 when every
 * name is valid UTF-8, else the CJK code page whose decoding is made of
 * common characters, else the OEM code page of `lang`, else CP437 (the
 * ZIP default). Single-byte code pages cannot be told apart reliably,
 * hence the locale step and the selector in the UI.
 */
export function guessFilenameEncoding(rawNames, lang = "en") {
  const names = rawNames.filter((raw) => raw.some((b) => b >= 0x80));
  if (names.every((raw) => strictDecode("utf-8", raw) !== null)) return "utf-8";
  const common = commonCharacterSets();
  let best = null;
  for (const encoding of CJK_ENCODINGS) {
    let good = 0;
    let total = 0;
    const decoded = names.map((raw) => strictDecode(encoding, raw));
    if (decoded.includes(null)) continue;
    for (const ch of decoded.join("")) {
      if (ch.charCodeAt(0) < 0x80) continue;
      total++;
      if (
        common[encoding].has(ch) ||
        (encoding === "shift_jis" && KANA.test(ch))
      )
        good++;
    }
    if (!best || good / total > best.score)
      best = { encoding, score: good / total };
  }
  if (best && best.score >= 0.9) return best.encoding;
  const locale = lang.toLowerCase();
  const oem = OEM_CODE_PAGE[locale] || OEM_CODE_PAGE[locale.split("-")[0]];
  if (oem && names.every((raw) => strictDecode(oem, raw) !== null)) return oem;
  return "cp437";
}

const UTF8_FLAG = 0x800;
// Bytes 0x80-0xFF of IBM code page 437, the ZIP default for unflagged names.
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

// zip.js reports `filenameUTF8` for any name that happens to be valid
// UTF-8, and legacy GBK/Shift-JIS bytes sometimes are. Only the EFS flag
// and a verified Unicode Path extra field make a name trustworthy.
const hasUnicodeName = (entry) =>
  Boolean(entry.rawBitFlag & UTF8_FLAG || entry.extraFieldUnicodePath?.valid);

/** Name of `entry` decoded with `encoding`, unless the archive marks it Unicode. */
export function decodeFilename(entry, encoding) {
  if (hasUnicodeName(entry)) return entry.filename;
  if (encoding === "cp437") {
    return Array.from(entry.rawFilename, (b) =>
      b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80],
    ).join("");
  }
  try {
    return new TextDecoder(encoding).decode(entry.rawFilename);
  } catch {
    return entry.filename;
  }
}

// ---------------------------------------------------------------------
// Errors and passwords
// ---------------------------------------------------------------------

const isPasswordProtected = (entry) =>
  entry.encrypted && !(entry.rawBitFlag & STRONG_ENCRYPTION_FLAG);

/**
 * True when `err` means the password did not open `entry`. ZipCrypto
 * checks a single byte, so 1 in 256 wrong passwords passes it and only
 * fails the CRC; AES verifies 2 bytes and then its HMAC.
 */
export function isWrongPassword(err, entry) {
  const message = err?.message;
  if (message === ERR_INVALID_PASSWORD || message === ERR_ENCRYPTED)
    return true;
  return (
    Boolean(entry.encrypted) &&
    (message === ERR_INVALID_CRC32 ||
      message === ERR_INVALID_AUTHENTICATION_CODE)
  );
}

// zip.js throws plain Errors identified by message; aborts surface as
// DOMException("AbortError") and pass through untouched.
function toArchiveError(err) {
  if (err instanceof ZipArchiveError || err.name === "AbortError") return err;
  const { message } = err;
  if (message === ERR_ENCRYPTED_CENTRAL_DIRECTORY) {
    return new ZipArchiveError(
      "This archive encrypts its file names, which is not supported",
      { kind: "unsupported" },
    );
  }
  if (message === ERR_INVALID_CRC32) {
    return new ZipArchiveError("The member is corrupted (CRC-32 mismatch)");
  }
  return new ZipArchiveError(message);
}

async function extract(entry, { password, limit, signal }) {
  if (!(limit < entry.uncompressedSize)) {
    return entry.getData(new Uint8ArrayWriter(), {
      password,
      checkCrc32: true,
      signal,
    });
  }
  // Partial read (thumbnails): stop the pipeline once `limit` bytes are out.
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  const chunks = [];
  let filled = 0;
  const sink = new WritableStream({
    write(chunk) {
      chunks.push(chunk);
      filled += chunk.length;
      if (filled >= limit) controller.abort();
    },
  });
  try {
    // Our own abort once `limit` bytes are out is the success path.
    await entry
      .getData(sink, { password, signal: controller.signal })
      .catch((err) => {
        if (filled < limit) throw err;
      });
  } finally {
    signal?.removeEventListener("abort", forward);
  }
  const out = new Uint8Array(filled);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.subarray(0, limit);
}

// ---------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------

class ZipArchive {
  constructor({ entries, url, volumes, lang }) {
    this.url = url;
    this.volumes = volumes;
    this.passwords = [];
    this.entries = entries.filter((entry) => !entry.directory);
    this.encrypted = this.entries.some(isPasswordProtected);
    const legacy = this.entries.filter(
      (e) => !hasUnicodeName(e) && e.rawFilename.some((b) => b >= 0x80),
    );
    this.legacyNames = legacy.length > 0;
    this.detectedEncoding = guessFilenameEncoding(
      legacy.map((e) => e.rawFilename),
      lang,
    );
    this.setEncoding(this.detectedEncoding);
  }

  /** True until one password has been accepted. */
  get needsPassword() {
    return this.encrypted && this.passwords.length === 0;
  }

  /** Rebuild the path -> {offset, size} map (fed to buildTreeFromIndex). */
  setEncoding(encoding) {
    this.encoding = encoding;
    this.byPath = new Map();
    this.files = {};
    for (const entry of this.entries) {
      const path = normalizeSegments(decodeFilename(entry, encoding)).join("/");
      if (!path || this.byPath.has(path)) continue; // first duplicate wins, like the tar tree
      this.byPath.set(path, entry);
      this.files[path] = { offset: entry.offset, size: entry.uncompressedSize };
    }
    return this.files;
  }

  entryFor(path) {
    const entry = this.byPath.get(path);
    if (!entry) throw new ZipArchiveError(`No member ${path} in the archive`);
    return entry;
  }

  /**
   * Check `password` against the member at `path`, or else against the
   * smallest encrypted members, and remember it on success. The
   * remembered passwords are tried for every later read.
   */
  async unlock(password, path) {
    const entry = path
      ? this.entryFor(path)
      : await this.findEntryOpenedBy(password);
    if (!entry) return false;
    const checkPasswordOnly =
      !SUPPORTED_METHODS.has(entry.compressionMethod) ||
      entry.uncompressedSize > FULL_VERIFY_MAX_BYTES;
    try {
      await entry.getData(new Uint8ArrayWriter(), {
        password,
        checkCrc32: true,
        checkPasswordOnly,
      });
    } catch (err) {
      if (isWrongPassword(err, entry)) return false;
      throw toArchiveError(err);
    }
    if (!this.passwords.includes(password)) this.passwords.push(password);
    return true;
  }

  // Archives built in several passes mix passwords, so the one typed at
  // entry may not open the smallest member. Run the cheap verifier-only
  // check on the few smallest encrypted members in parallel and pick the
  // first it opens; unlock() then decrypts that one in full.
  async findEntryOpenedBy(password) {
    const encrypted = this.entries
      .filter(isPasswordProtected)
      .sort((a, b) => a.uncompressedSize - b.uncompressedSize);
    const decodable = encrypted.filter((e) =>
      SUPPORTED_METHODS.has(e.compressionMethod),
    );
    const sample = (decodable.length ? decodable : encrypted).slice(
      0,
      UNLOCK_SAMPLE_SIZE,
    );
    const opens = await Promise.all(
      sample.map((entry) =>
        entry
          .getData(new Uint8ArrayWriter(), {
            password,
            checkPasswordOnly: true,
          })
          .then(
            () => true,
            (err) => {
              if (isWrongPassword(err, entry)) return false;
              throw toArchiveError(err);
            },
          ),
      ),
    );
    return sample.find((_, i) => opens[i]) ?? null;
  }

  /**
   * Bytes of the member at `path` (a tree path from `files`). With
   * `limit`, only the first `limit` decoded bytes. Throws ZipArchiveError
   * kind "password" when no remembered password opens the member.
   */
  async read(path, { limit, signal } = {}) {
    const entry = this.entryFor(path);
    if (entry.rawBitFlag & STRONG_ENCRYPTION_FLAG) {
      throw new ZipArchiveError("PKWARE strong encryption is not supported", {
        kind: "unsupported",
      });
    }
    const method = entry.compressionMethod;
    if (!SUPPORTED_METHODS.has(method)) {
      throw new ZipArchiveError(
        `Compression method ${METHOD_NAMES[method] || method} is not supported`,
        { kind: "unsupported", method },
      );
    }
    const passwords = isPasswordProtected(entry) ? this.passwords : [undefined];
    for (const password of passwords) {
      try {
        return await extract(entry, { password, limit, signal });
      } catch (err) {
        if (!isWrongPassword(err, entry)) throw toArchiveError(err);
      }
    }
    throw new ZipArchiveError("This member needs a password", {
      kind: "password",
    });
  }
}

// ---------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------

async function sizeOfOne(path, sizeOf) {
  const sizes = await sizeOf([path]);
  if (!sizes.has(path))
    throw new ZipArchiveError(`${path} was not found`, {
      kind: "fetch",
      status: 404,
    });
  return sizes.get(path);
}

/** `x.zip.001` -> every consecutive `x.zip.NNN` volume; anything else -> itself. */
export async function resolveVolumes(path, sizeOf) {
  if (!FIRST_RAW_VOLUME.test(path))
    return [{ path, size: await sizeOfOne(path, sizeOf) }];
  const base = path.slice(0, -3);
  const parts = [];
  for (let first = 1; first <= MAX_RAW_VOLUME; first += VOLUME_PROBE_BATCH) {
    const names = [];
    for (
      let n = first;
      n < first + VOLUME_PROBE_BATCH && n <= MAX_RAW_VOLUME;
      n++
    ) {
      names.push(base + String(n).padStart(3, "0"));
    }
    const sizes = await sizeOf(names);
    for (const name of names) {
      if (!sizes.has(name)) {
        if (!parts.length)
          throw new ZipArchiveError(`${path} was not found`, {
            kind: "fetch",
            status: 404,
          });
        return parts;
      }
      parts.push({ path: name, size: sizes.get(name) });
    }
  }
  return parts;
}

const listEntries = (reader) =>
  new ZipReader(reader, { strictness: "tolerant" }).getEntries();

// `last.zip` alone throws ERR_SPLIT_ZIP_FILE: its EOCD names the disk it
// sits on, so disks .z01 … .zNN must precede it.
async function infoZipDisks(reader, path, resolveUrl, sizeOf) {
  const eocd = await findEndOfCentralDirectory(reader);
  const lastDisk = eocd ? eocd.view.getUint16(4, true) : 0;
  if (!lastDisk) return null;
  const base = path.replace(/\.[^./]*$/, "");
  const names = Array.from(
    { length: lastDisk },
    (_, i) => `${base}.z${String(i + 1).padStart(2, "0")}`,
  );
  const sizes = await sizeOf(names);
  const missing = names.filter((name) => !sizes.has(name));
  if (missing.length)
    throw new ZipArchiveError(`Missing split volume ${missing.join(", ")}`);
  return new SplitDataReader([
    ...names.map((name) => new RangeReader(resolveUrl(name), sizes.get(name))),
    reader,
  ]);
}

/**
 * Open the zip at repo `path`. `resolveUrl(path)` builds the /resolve/
 * URL, `sizeOf(paths)` resolves sizes (Map path -> size, missing paths
 * absent). Returns a ZipArchive.
 */
export async function openZipArchive({
  path,
  resolveUrl,
  sizeOf,
  lang = "en",
}) {
  const parts = await resolveVolumes(path, sizeOf);
  const readers = parts.map(
    (part) => new RangeReader(resolveUrl(part.path), part.size),
  );
  let reader = readers.length > 1 ? new ConcatReader(readers) : readers[0];
  let volumes = parts.length;
  let entries;
  try {
    entries = await listEntries(reader);
  } catch (err) {
    let recovered = null;
    if (err?.message === ERR_SPLIT_ZIP_FILE && readers.length === 1) {
      recovered = await infoZipDisks(reader, path, resolveUrl, sizeOf);
      volumes = recovered ? recovered.readers.length : volumes;
    } else if (err?.message === ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND) {
      recovered = await repairMissingZip64Records(reader);
    }
    if (!recovered) throw toArchiveError(err);
    reader = recovered;
    try {
      entries = await listEntries(reader);
    } catch (retryErr) {
      throw toArchiveError(retryErr);
    }
  }
  if (entries.some((entry) => CODEC_METHODS.has(entry.compressionMethod))) {
    (await import("./zip-codecs.js")).registerZipCodecs();
  }
  return new ZipArchive({
    entries,
    url: resolveUrl(parts[0].path),
    volumes,
    lang,
  });
}

/** resolveUrl + sizeOf for a repo revision (same-origin /resolve/, paths-info). */
export function repoZipLocator({ repoType, namespace, name, branch }) {
  return {
    resolveUrl: (path) =>
      buildResolveUrl({
        baseUrl: window.location.origin,
        repoType,
        namespace,
        name,
        branch,
        path,
      }),
    async sizeOf(paths) {
      const response = await repoAPI.getPathsInfo(
        repoType,
        namespace,
        name,
        branch,
        paths,
      );
      return new Map(
        response.data
          .filter((e) => e.type === "file")
          .map((e) => [e.path, e.size]),
      );
    },
  };
}

/** `target` = { repoType, namespace, name, branch, path }. */
export function openRepoZip(target, { lang } = {}) {
  return openZipArchive({ path: target.path, lang, ...repoZipLocator(target) });
}
