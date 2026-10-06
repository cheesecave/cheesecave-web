// Turns whatever a failed request leaves behind into an AppError.
//
// The backend gives its native endpoints no error code, so the meaning is read
// from the status, the X-Error-* headers (the hub's HF-compatible layer sends
// them), the shape of the body, and, for a few statuses that say less than the
// message does, the wording. test/fixtures/errors holds the responses the
// backend really sends, recorded by scripts/capture-error-fixtures.py; a new
// shape belongs there first.

import { AppError, KIND } from "./appError";

// Codes the hub sends in X-Error-Code (or as the body's `error`).
const CODE_KIND = {
  RepoNotFound: KIND.NOT_FOUND,
  RevisionNotFound: KIND.NOT_FOUND,
  EntryNotFound: KIND.NOT_FOUND,
  GatedRepo: KIND.GATED,
  RepoExists: KIND.CONFLICT,
  RepoNameRecycling: KIND.CONFLICT,
  InvalidRepoId: KIND.INVALID,
  InvalidRepoType: KIND.INVALID,
  BadRequest: KIND.INVALID,
  RangeNotSatisfiable: KIND.INVALID,
  ServerError: KIND.SERVER,
  NotImplemented: KIND.UNSUPPORTED,
  Unauthorized: KIND.AUTH_REQUIRED,
  Forbidden: KIND.FORBIDDEN,
};

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]+$/;
const BAD_CREDENTIALS =
  /invalid (token|credentials?|username|password)|incorrect|wrong (password|username)/i;
const LOGIN_NEEDED = /authenticat|log ?in|sign ?in/i;
const ALREADY_THERE =
  /already (exists?|in use|taken|registered)|is taken|duplicate/i;
const TOO_BIG = /too (large|big)|exceed|quota|at most|maximum/i;
const FETCH_FAILED =
  /failed to fetch|networkerror|load failed|network request failed/i;
const LOCATION_PREFIXES = new Set([
  "body",
  "query",
  "path",
  "header",
  "cookie",
]);
const MAX_MESSAGE = 300;

const text = (value) => (typeof value === "string" ? value : "");

/** One line of plain text, bounded: what the server said, safe to put on screen. */
function clean(text) {
  if (typeof text !== "string") return null;
  const line = text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;
  return line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE)}…` : line;
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name) ?? null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? null : headers[key];
}

function normaliseBody(body) {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return body;
      }
    }
    return body;
  }
  return body &&
    typeof body === "object" &&
    !ArrayBuffer.isView(body) &&
    !(body instanceof ArrayBuffer)
    ? body
    : null;
}

const isHtml = (contentType, body) =>
  /text\/html/i.test(contentType || "") ||
  (typeof body === "string" &&
    /^\s*<(!doctype|html|head|body|\?xml)/i.test(body));

/** The fields pydantic's 422 names: [{path: "name", message: "Field required"}]. */
function fieldsOf(detail) {
  if (!Array.isArray(detail)) return [];
  const fields = [];
  for (const item of detail) {
    if (!item || typeof item !== "object" || typeof item.msg !== "string")
      continue;
    const loc = Array.isArray(item.loc) ? [...item.loc] : [];
    if (loc.length && LOCATION_PREFIXES.has(loc[0])) loc.shift();
    fields.push({ path: loc.join("."), message: item.msg });
  }
  return fields;
}

function messageOf(body, headerMessage, code, fields) {
  // an empty body (axios gives "") leaves the header's message as the only one
  if (typeof body === "string") return clean(body) ?? clean(headerMessage);
  if (body) {
    const { detail } = body;
    if (typeof detail === "string") return clean(detail);
    if (fields.length)
      return clean(
        fields
          .map((f) => (f.path ? `${f.path}: ${f.message}` : f.message))
          .join("; "),
      );
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const nested = clean(detail.error) || clean(detail.message);
      if (nested) return nested;
    }
    // `error` is the code when it looks like one, free text when it does not
    if (typeof body.error === "string" && !(code && body.error === code)) {
      if (!PASCAL_CASE.test(body.error)) return clean(body.error);
    }
    if (typeof body.message === "string") return clean(body.message);
  }
  return clean(headerMessage);
}

// The backend wraps a LakeFS "404" in a 500 (an unknown commit, for one). That
// is a "not found" in fact, and the message names an internal URL: say the
// first, do not show the second.
const WRAPPED_NOT_FOUND = /LakeFS API error 404/;

function kindByStatus(status, message, html) {
  if (status < 400) return KIND.UNEXPECTED;
  if (status === 401)
    return BAD_CREDENTIALS.test(message)
      ? KIND.INVALID_CREDENTIALS
      : KIND.AUTH_REQUIRED;
  if (status === 403)
    return LOGIN_NEEDED.test(message) ? KIND.AUTH_REQUIRED : KIND.FORBIDDEN;
  if (status === 404 || status === 410) return KIND.NOT_FOUND;
  if (status === 408 || status === 524) return KIND.TIMEOUT;
  if (status === 409) return KIND.CONFLICT;
  if (status === 413) return KIND.TOO_LARGE;
  if (status === 416 || status === 422) return KIND.INVALID;
  if (status === 429) return KIND.RATE_LIMITED;
  if (status === 400) {
    if (ALREADY_THERE.test(message)) return KIND.CONFLICT;
    if (TOO_BIG.test(message)) return KIND.TOO_LARGE;
    return KIND.INVALID;
  }
  if (status === 501) return KIND.UNSUPPORTED;
  if (status === 502 || status === 503 || status === 504 || html)
    return KIND.UNAVAILABLE;
  if (status >= 500) return KIND.SERVER;
  return KIND.REJECTED;
}

const offline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * @param {{status:number, headers?:object, body?:unknown}} response
 * @param {unknown} [cause]
 */
export function decodeResponse({ status, headers, body }, cause = null) {
  if (typeof status !== "number" || !Number.isFinite(status) || status <= 0) {
    return new AppError({ kind: KIND.NETWORK, offline: offline(), cause });
  }
  const parsed = normaliseBody(body);
  const html = isHtml(header(headers, "content-type"), parsed);
  const object = parsed && typeof parsed === "object" ? parsed : null;

  let code = header(headers, "x-error-code") || null;
  if (
    !code &&
    object &&
    typeof object.error === "string" &&
    PASCAL_CASE.test(object.error)
  )
    code = object.error;
  const fields = fieldsOf(object?.detail);
  const said = html
    ? null
    : messageOf(parsed, header(headers, "x-error-message"), code, fields);
  const wrapped = status === 500 && WRAPPED_NOT_FOUND.test(text(said));
  const serverMessage = wrapped ? null : said;

  const retryHeader = header(headers, "retry-after");
  return new AppError({
    kind: wrapped
      ? KIND.NOT_FOUND
      : status >= 400 && CODE_KIND[code]
        ? CODE_KIND[code]
        : kindByStatus(status, text(serverMessage), html),
    code,
    status,
    serverMessage,
    fields,
    requestId: header(headers, "x-request-id") || null,
    retryAfter: /^\d+$/.test(retryHeader || "")
      ? Number(retryHeader) * 1000
      : null,
    sources: object && Array.isArray(object.sources) ? object.sources : null,
    cause,
  });
}

/** Anything that was thrown, or rejected, on the way to an answer. */
export function decodeError(input) {
  if (input instanceof AppError) return input;
  // the axios interceptor decoded it already (and left its mark on the error)
  if (input?.appError instanceof AppError) return input.appError;
  if (input === null || input === undefined) {
    return new AppError({
      kind: KIND.BUG,
      serverMessage: "Unknown error",
      cause: input,
    });
  }
  if (typeof input === "string")
    return new AppError({
      kind: KIND.BUG,
      serverMessage: clean(input),
      cause: input,
    });

  if (
    input.name === "AbortError" ||
    input.name === "CanceledError" ||
    input.code === "ERR_CANCELED"
  ) {
    return new AppError({ kind: KIND.CANCELLED, cause: input });
  }
  if (input.response && typeof input.response === "object") {
    return decodeResponse(
      {
        status: input.response.status,
        headers: input.response.headers,
        body: input.response.data,
      },
      input,
    );
  }
  if (input.isAxiosError || input.request) {
    const timedOut =
      input.code === "ETIMEDOUT" ||
      (input.code === "ECONNABORTED" && /timeout/i.test(text(input.message)));
    return new AppError({
      kind: timedOut ? KIND.TIMEOUT : KIND.NETWORK,
      offline: offline(),
      cause: input,
    });
  }
  // a domain error that carries the status of the response it came from
  if (typeof input.status === "number") {
    return decodeResponse(
      {
        status: input.status,
        headers:
          typeof input.errorCode === "string"
            ? { "x-error-code": input.errorCode }
            : {},
        body: {
          detail:
            typeof input.detail === "string" ? input.detail : input.message,
          sources: input.sources,
        },
      },
      input,
    );
  }
  if (input.name === "TypeError" && FETCH_FAILED.test(text(input.message))) {
    return new AppError({
      kind: KIND.NETWORK,
      offline: offline(),
      cause: input,
    });
  }
  return new AppError({
    kind: KIND.BUG,
    serverMessage: clean(input.message) ?? clean(String(input)),
    cause: input,
  });
}
