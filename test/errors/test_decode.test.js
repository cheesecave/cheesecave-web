import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError, KIND, decodeError, decodeResponse } from "@/errors";

const dir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/errors",
);
const load = (name) => JSON.parse(readFileSync(resolve(dir, name), "utf8"));
const real = load("real.json");
const synthetic = load("synthetic.json");

// What the decoder has to make of each response. The real ones were recorded
// from the backend by scripts/capture-error-fixtures.py.
const EXPECT = {
  "token-missing": { kind: KIND.NOT_FOUND, serverMessage: "Token not found" },
  "preupload-anonymous": {
    kind: KIND.AUTH_REQUIRED,
    serverMessage: "Not authenticated",
  },
  "commits-private-repo-anonymous": {
    kind: KIND.NOT_FOUND,
    code: "RepoNotFound",
    serverMessage: real.find((f) => f.name === "commits-private-repo-anonymous")
      .response.headers["x-error-message"],
  },
  "repo-info-no-fallback-source": {
    kind: KIND.NOT_FOUND,
    code: "RepoNotFound",
    sources: 1,
    serverMessage: "No fallback source serves this repository.",
  },
  "tree-missing-branch": { kind: KIND.NOT_FOUND, code: "RevisionNotFound" },
  "resolve-missing-file": { kind: KIND.NOT_FOUND, code: "EntryNotFound" },
  "org-missing": {
    kind: KIND.NOT_FOUND,
    serverMessage: "Organization not found",
  },
  "unknown-api-route": { kind: KIND.NOT_FOUND, serverMessage: "Not Found" },
  "method-not-allowed": {
    kind: KIND.REJECTED,
    serverMessage: "Method Not Allowed",
  },
  "auth-me-anonymous": { kind: KIND.AUTH_REQUIRED },
  "login-wrong-password": {
    kind: KIND.INVALID_CREDENTIALS,
    serverMessage: "Invalid username or password",
  },
  "admin-without-token": {
    kind: KIND.AUTH_REQUIRED,
    serverMessage: "Admin token required in X-Admin-Token header",
  },
  "quota-recalculate-anonymous": { kind: KIND.AUTH_REQUIRED },
  "external-tokens-anonymous": { kind: KIND.AUTH_REQUIRED },
  "other-users-settings": {
    kind: KIND.FORBIDDEN,
    serverMessage: "Not authorized to update this user's settings",
  },
  "register-existing-username": {
    kind: KIND.CONFLICT,
    serverMessage: "Username already exists",
  },
  "org-exists": {
    kind: KIND.CONFLICT,
    serverMessage: "Organization name already exists",
  },
  "repo-exists": { kind: KIND.CONFLICT, code: "RepoExists" },
  "repo-create-missing-fields": {
    kind: KIND.INVALID,
    fields: [{ path: "name", message: "Field required" }],
  },
  "repo-create-bad-enum": { kind: KIND.INVALID, fieldPaths: ["type"] },
  "lfs-batch-bad-request": { kind: KIND.INVALID },
  "viewer-rate-limited": {
    kind: KIND.RATE_LIMITED,
    serverMessage: "Too many concurrent requests",
  },
  "repo-create-name-too-long": { kind: KIND.SERVER, code: "ServerError" },
  "unhandled-exception-plain-text": {
    kind: KIND.SERVER,
    requestId: "req-500",
    serverMessage: "Internal Server Error",
  },
  "proxy-502-html": { kind: KIND.UNAVAILABLE },
  "proxy-504-html": { kind: KIND.UNAVAILABLE },
  "maintenance-page-with-200": { kind: KIND.UNEXPECTED },
  "authentication-required-as-403": {
    kind: KIND.AUTH_REQUIRED,
    requestId: "req-403",
  },
  "namespace-missing-as-403": { kind: KIND.FORBIDDEN },
  "email-already-exists-as-400": {
    kind: KIND.CONFLICT,
    serverMessage: "Email already exists",
  },
  "image-too-large-as-400": {
    kind: KIND.TOO_LARGE,
    serverMessage: "Image too large. Maximum: 10MB",
  },
  "storage-quota-413": {
    kind: KIND.TOO_LARGE,
    serverMessage: "Storage quota exceeded",
  },
  "rate-limited-with-retry-after": {
    kind: KIND.RATE_LIMITED,
    retryAfter: 7000,
  },
  "service-unavailable-503": { kind: KIND.UNAVAILABLE },
  "not-implemented-501": {
    kind: KIND.UNSUPPORTED,
    code: "NotImplemented",
    serverMessage: "Not supported",
  },
  "gated-repo-aggregate": { kind: KIND.GATED, code: "GatedRepo", sources: 1 },
  "upstream-failure-aggregate": {
    kind: KIND.UNAVAILABLE,
    code: "UpstreamFailure",
    sources: 1,
  },
  "repo-name-recycling-409": {
    kind: KIND.CONFLICT,
    code: "RepoNameRecycling",
    retriable: true,
  },
  "range-not-satisfiable-416": {
    kind: KIND.INVALID,
    code: "RangeNotSatisfiable",
  },
  "hf-invalid-repo-id-400": {
    kind: KIND.INVALID,
    code: "InvalidRepoId",
    serverMessage: "bad id",
  },
  "unknown-code-header": {
    kind: KIND.REJECTED,
    code: "Teapot",
    serverMessage: "short and stout",
  },
  "detail-is-an-object-without-text": {
    kind: KIND.CONFLICT,
    serverMessage: null,
  },
  "request-timeout-408": { kind: KIND.TIMEOUT },
  "hostile-message": { kind: KIND.INVALID },
};

const axiosError = ({ status, headers = {}, body }) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, headers, data: body ?? "" },
});

function check(error, expected) {
  expect(error).toBeInstanceOf(AppError);
  expect(error.kind).toBe(expected.kind);
  for (const key of [
    "code",
    "serverMessage",
    "requestId",
    "retryAfter",
    "retriable",
  ]) {
    if (key in expected) expect(error[key], key).toBe(expected[key]);
  }
  if ("sources" in expected)
    expect(error.sources).toHaveLength(expected.sources);
  if ("fields" in expected) expect(error.fields).toEqual(expected.fields);
  if ("fieldPaths" in expected)
    expect(error.fields.map((f) => f.path)).toEqual(expected.fieldPaths);
}

describe("decodeResponse / decodeError · every recorded backend response", () => {
  const all = [...real, ...synthetic];

  it("has an expectation for every fixture, and no stale ones", () => {
    expect(all.map((f) => f.name).sort()).toEqual(Object.keys(EXPECT).sort());
  });

  it.each(all.map((f) => [f.name, f]))("%s", (name, fixture) => {
    const { status, headers, body } = fixture.response;
    check(decodeResponse({ status, headers, body }), EXPECT[name]);
    // the same response, reached as an axios error, decodes the same
    check(decodeError(axiosError({ status, headers, body })), EXPECT[name]);
  });

  it("keeps a hostile server message harmless: no control characters, one line, bounded", () => {
    const fixture = synthetic.find((f) => f.name === "hostile-message");
    const { serverMessage } = decodeResponse(fixture.response);
    expect(serverMessage).not.toMatch(/[\u0000-\u001f]/);
    expect(serverMessage).not.toMatch(/\s{2,}/);
    expect(serverMessage.length).toBeLessThanOrEqual(301);
    expect(serverMessage.endsWith("…")).toBe(true);
  });

  it("reads the request id and the status off every error", () => {
    const e = decodeResponse(
      real.find((f) => f.name === "repo-exists").response,
    );
    expect(e.requestId).toMatch(/^[0-9a-f]{32}$/);
    expect(e.status).toBe(409);
  });
});

describe("decodeResponse · headers in the shapes callers have", () => {
  it("reads a Headers instance and an axios-style .get() object", () => {
    const viaHeaders = decodeResponse({
      status: 404,
      headers: new Headers({
        "X-Error-Code": "RepoNotFound",
        "X-Request-Id": "abc",
      }),
      body: null,
    });
    expect(viaHeaders.code).toBe("RepoNotFound");
    expect(viaHeaders.requestId).toBe("abc");
    const viaGet = decodeResponse({
      status: 404,
      headers: {
        get: (k) =>
          ({ "x-error-code": "EntryNotFound" })[k.toLowerCase()] ?? null,
      },
      body: null,
    });
    expect(viaGet.code).toBe("EntryNotFound");
  });

  it("copes with no headers and with a body that is neither text nor an object", () => {
    expect(decodeResponse({ status: 404 }).kind).toBe(KIND.NOT_FOUND);
    expect(
      decodeResponse({ status: 500, headers: {}, body: new ArrayBuffer(4) })
        .kind,
    ).toBe(KIND.SERVER);
    expect(decodeResponse({ status: 404, headers: {}, body: ["a"] }).kind).toBe(
      KIND.NOT_FOUND,
    );
  });

  it("takes a message from detail.message or body.message too", () => {
    expect(
      decodeResponse({
        status: 400,
        body: { detail: { message: "nested message" } },
      }).serverMessage,
    ).toBe("nested message");
    expect(
      decodeResponse({ status: 400, body: { message: "top level" } })
        .serverMessage,
    ).toBe("top level");
    expect(
      decodeResponse({
        status: 400,
        headers: { "x-error-message": "from the header" },
        body: null,
      }).serverMessage,
    ).toBe("from the header");
  });

  it("describes a validation error with several fields, and nested paths", () => {
    const e = decodeResponse({
      status: 422,
      body: {
        detail: [
          { loc: ["body", "social", "github"], msg: "bad", type: "x" },
          { loc: ["query", "limit"], msg: "too big" },
          { msg: "no location" },
          "junk",
        ],
      },
    });
    expect(e.fields).toEqual([
      { path: "social.github", message: "bad" },
      { path: "limit", message: "too big" },
      { path: "", message: "no location" },
    ]);
    expect(e.serverMessage).toBe(
      "social.github: bad; limit: too big; no location",
    );
  });

  it("falls back to the status for a 4xx it has no better word for", () => {
    expect(decodeResponse({ status: 410, body: null }).kind).toBe(
      KIND.NOT_FOUND,
    );
    expect(decodeResponse({ status: 451, body: null }).kind).toBe(
      KIND.REJECTED,
    );
    expect(decodeResponse({ status: 524, body: null }).kind).toBe(KIND.TIMEOUT);
    expect(decodeResponse({ status: 501, body: null }).kind).toBe(
      KIND.UNSUPPORTED,
    );
    expect(decodeResponse({ status: 599, body: null }).kind).toBe(KIND.SERVER);
    expect(decodeResponse({ status: 0, body: null }).kind).toBe(KIND.NETWORK);
    expect(decodeResponse({ status: "x", body: null }).kind).toBe(KIND.NETWORK);
  });

  it("treats a bare 401 as 'sign in', and a stated reason as bad credentials", () => {
    expect(decodeResponse({ status: 401, body: null }).kind).toBe(
      KIND.AUTH_REQUIRED,
    );
    // what the backend says to an expired or missing session: sign in again
    expect(
      decodeResponse({ status: 401, body: { detail: "Invalid user token" } })
        .kind,
    ).toBe(KIND.AUTH_REQUIRED);
    expect(
      decodeResponse({
        status: 401,
        body: { detail: "Invalid username or password" },
      }).kind,
    ).toBe(KIND.INVALID_CREDENTIALS);
    expect(
      decodeResponse({ status: 401, body: { detail: "Invalid credentials" } })
        .kind,
    ).toBe(KIND.INVALID_CREDENTIALS);
  });

  it("recognises the codes the hub's HF-compatible layer sends", () => {
    const code = (c, status = 400) =>
      decodeResponse({ status, headers: { "x-error-code": c }, body: null });
    expect(code("Unauthorized", 401).kind).toBe(KIND.AUTH_REQUIRED);
    expect(code("Forbidden", 403).kind).toBe(KIND.FORBIDDEN);
    expect(code("InvalidRepoType").kind).toBe(KIND.INVALID);
    expect(code("BadRequest").kind).toBe(KIND.INVALID);
    expect(code("ServerError", 500).kind).toBe(KIND.SERVER);
    expect(code("RepoExists", 409).kind).toBe(KIND.CONFLICT);
    expect(code("Teapot", 500).kind).toBe(KIND.SERVER);
  });

  it("uses a PascalCase error in the body as the code, and leaves free text alone", () => {
    expect(
      decodeResponse({
        status: 409,
        body: { error: "RepoExists", detail: "x" },
      }).code,
    ).toBe("RepoExists");
    const free = decodeResponse({
      status: 409,
      body: { error: "Repository already exists", detail: "x" },
    });
    expect(free.code).toBeNull();
    expect(free.serverMessage).toBe("x");
    const onlyError = decodeResponse({
      status: 400,
      body: { error: "Repository already exists" },
    });
    expect(onlyError.serverMessage).toBe("Repository already exists");
    expect(onlyError.kind).toBe(KIND.CONFLICT);
  });

  it("reads a body that arrives as a JSON string, and keeps a string that only looks like JSON", () => {
    const parsed = decodeResponse({
      status: 409,
      body: '{"detail": "Name taken", "sources": [{"name": "a"}]}',
    });
    expect(parsed.serverMessage).toBe("Name taken");
    expect(parsed.sources).toHaveLength(1);
    const broken = decodeResponse({ status: 500, body: "{this is not json" });
    expect(broken.serverMessage).toBe("{this is not json");
    expect(broken.kind).toBe(KIND.SERVER);
  });

  it("has no message when only the code was sent in the body", () => {
    const e = decodeResponse({ status: 409, body: { error: "RepoExists" } });
    expect(e.code).toBe("RepoExists");
    expect(e.serverMessage).toBeNull();
    expect(e.kind).toBe(KIND.CONFLICT);
  });

  it("reads Retry-After in seconds or as an HTTP date, and ignores junk", () => {
    expect(
      decodeResponse({ status: 429, headers: { "retry-after": "3" } })
        .retryAfter,
    ).toBe(3000);
    const inThirtySeconds = new Date(Date.now() + 30000).toUTCString();
    const dated = decodeResponse({
      status: 429,
      headers: { "retry-after": inThirtySeconds },
    }).retryAfter;
    expect(dated).toBeGreaterThan(27000);
    expect(dated).toBeLessThanOrEqual(30000);
    // a date already past is no wait at all
    expect(
      decodeResponse({
        status: 429,
        headers: { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" },
      }).retryAfter,
    ).toBe(0);
    expect(
      decodeResponse({ status: 429, headers: { "retry-after": "soon" } })
        .retryAfter,
    ).toBeNull();
    expect(decodeResponse({ status: 429, headers: {} }).retryAfter).toBeNull();
  });

  it("knows an HTML body from the content type or from its first character", () => {
    expect(
      decodeResponse({
        status: 502,
        headers: {},
        body: "  <html>bad gateway</html>",
      }).kind,
    ).toBe(KIND.UNAVAILABLE);
    expect(
      decodeResponse({
        status: 500,
        headers: { "content-type": "text/html" },
        body: "x",
      }).kind,
    ).toBe(KIND.UNAVAILABLE);
    expect(
      decodeResponse({
        status: 200,
        headers: {},
        body: "<!doctype html><p>hi</p>",
      }).kind,
    ).toBe(KIND.UNEXPECTED);
  });
});

describe("decodeError · things that are not HTTP responses", () => {
  it("does not call a length rule 'too large', nor a stray 'log in' a login request", () => {
    expect(
      decodeResponse({
        status: 400,
        body: { detail: "Description must be at most 500 characters" },
      }).kind,
    ).toBe(KIND.INVALID);
    expect(
      decodeResponse({
        status: 403,
        body: {
          detail: "You do not have permission to log in as another user",
        },
      }).kind,
    ).toBe(KIND.FORBIDDEN);
    expect(
      decodeResponse({ status: 403, body: { detail: "Login required" } }).kind,
    ).toBe(KIND.AUTH_REQUIRED);
  });

  it("reads a LakeFS 404 wrapped in a 500 as not found, without showing the internal URL", () => {
    const error = decodeResponse({
      status: 500,
      headers: {
        "x-error-code": "ServerError",
        "x-error-message":
          "Failed to get commit: LakeFS API error 404 Not Found for GET http://lakefs:28000/api/v1/repositories/r/commits/c: commit not found",
        "x-request-id": "req-1",
      },
      body: "",
    });
    expect(error.kind).toBe(KIND.NOT_FOUND);
    expect(error.serverMessage).toBeNull();
    expect(error.status).toBe(500);
    expect(error.requestId).toBe("req-1");
    // any other 500 stays a server error
    expect(
      decodeResponse({
        status: 500,
        headers: { "x-error-code": "ServerError" },
        body: "",
      }).kind,
    ).toBe(KIND.SERVER);
  });

  it("uses what the interceptor decoded, even on a plain Error", () => {
    const decoded = new AppError({ kind: KIND.UNEXPECTED, status: 200 });
    const carrier = Object.assign(new Error("an HTML page"), {
      appError: decoded,
    });
    expect(decodeError(carrier)).toBe(decoded);
    // something else under that name is not trusted
    const impostor = Object.assign(new Error("x"), { appError: { kind: "x" } });
    expect(decodeError(impostor).kind).toBe(KIND.BUG);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("passes an AppError through unchanged", () => {
    const e = new AppError({ kind: KIND.SERVER });
    expect(decodeError(e)).toBe(e);
  });

  it("calls a timed-out request a timeout, however axios words it", () => {
    expect(
      decodeError({
        isAxiosError: true,
        code: "ECONNABORTED",
        message: "timeout of 30000ms exceeded",
      }).kind,
    ).toBe(KIND.TIMEOUT);
    expect(
      decodeError({ isAxiosError: true, code: "ETIMEDOUT", message: "x" }).kind,
    ).toBe(KIND.TIMEOUT);
    expect(
      decodeError({
        isAxiosError: true,
        code: "ECONNABORTED",
        message: "Request aborted",
      }).kind,
    ).toBe(KIND.NETWORK);
  });

  it("calls a request with no response a network failure", () => {
    expect(
      decodeError({
        isAxiosError: true,
        code: "ERR_NETWORK",
        message: "Network Error",
        request: {},
      }).kind,
    ).toBe(KIND.NETWORK);
    expect(
      decodeError({ isAxiosError: true, message: "x", request: {} }).kind,
    ).toBe(KIND.NETWORK);
    expect(decodeError(new TypeError("Failed to fetch")).kind).toBe(
      KIND.NETWORK,
    );
    expect(
      decodeError(
        new TypeError("NetworkError when attempting to fetch resource."),
      ).kind,
    ).toBe(KIND.NETWORK);
    expect(decodeError(new TypeError("Load failed")).kind).toBe(KIND.NETWORK);
  });

  it("remembers that the browser is offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const e = decodeError(new TypeError("Failed to fetch"));
    expect(e.kind).toBe(KIND.NETWORK);
    expect(e.offline).toBe(true);
    vi.stubGlobal("navigator", { onLine: true });
    expect(decodeError(new TypeError("Failed to fetch")).offline).toBe(false);
  });

  it("never shows a cancelled request", () => {
    expect(
      decodeError({
        isAxiosError: true,
        code: "ERR_CANCELED",
        name: "CanceledError",
        message: "canceled",
      }).kind,
    ).toBe(KIND.CANCELLED);
    expect(
      decodeError(Object.assign(new Error("aborted"), { name: "AbortError" }))
        .kind,
    ).toBe(KIND.CANCELLED);
    expect(decodeError(new DOMException("x", "AbortError")).kind).toBe(
      KIND.CANCELLED,
    );
  });

  it("does not take a bug in the app for a network failure", () => {
    const e = decodeError(
      new TypeError("Cannot read properties of undefined (reading 'data')"),
    );
    expect(e.kind).toBe(KIND.BUG);
    expect(e.serverMessage).toContain("Cannot read properties");
    expect(decodeError(new Error("boom")).kind).toBe(KIND.BUG);
    expect(decodeError("just a string").kind).toBe(KIND.BUG);
    expect(decodeError(null).kind).toBe(KIND.BUG);
    expect(decodeError(undefined).serverMessage).toBe("Unknown error");
  });

  it("copes with an object that has no message at all", () => {
    expect(decodeError({}).kind).toBe(KIND.BUG);
    expect(decodeError({}).serverMessage).toBe("[object Object]");
    expect(decodeError({ isAxiosError: true, code: "ECONNABORTED" }).kind).toBe(
      KIND.NETWORK,
    );
    expect(decodeError({ name: "TypeError" }).kind).toBe(KIND.BUG);
  });

  it("reads the status a domain error carries (a failed range read, a metadata fetch)", () => {
    const e = decodeError(
      Object.assign(new Error("HEAD failed"), {
        status: 404,
        errorCode: "EntryNotFound",
        sources: [{ name: "x" }],
        detail: "No fallback source serves this file.",
      }),
    );
    expect(e.kind).toBe(KIND.NOT_FOUND);
    expect(e.code).toBe("EntryNotFound");
    expect(e.sources).toHaveLength(1);
    expect(e.serverMessage).toBe("No fallback source serves this file.");
    const noDetail = decodeError(
      Object.assign(new Error("gone"), { status: 500 }),
    );
    expect(noDetail.kind).toBe(KIND.SERVER);
    expect(noDetail.serverMessage).toBe("gone");
  });

  it("keeps the thrown thing as the cause", () => {
    const raw = new Error("x");
    expect(decodeError(raw).cause).toBe(raw);
  });
});

describe("AppError", () => {
  it("says which kinds are worth retrying", () => {
    const retriable = (kind, extra = {}) =>
      new AppError({ kind, ...extra }).retriable;
    for (const k of [
      KIND.NETWORK,
      KIND.TIMEOUT,
      KIND.UNAVAILABLE,
      KIND.SERVER,
      KIND.RATE_LIMITED,
      KIND.UNEXPECTED,
    ])
      expect(retriable(k)).toBe(true);
    for (const k of [
      KIND.NOT_FOUND,
      KIND.FORBIDDEN,
      KIND.INVALID,
      KIND.BUG,
      KIND.CANCELLED,
    ])
      expect(retriable(k)).toBe(false);
    expect(retriable(KIND.CONFLICT, { code: "RepoNameRecycling" })).toBe(true);
    expect(retriable(KIND.CONFLICT)).toBe(false);
  });

  it("serialises without its cause, for logs", () => {
    const e = new AppError({
      kind: KIND.SERVER,
      status: 500,
      code: "ServerError",
      requestId: "r1",
      cause: new Error("x"),
    });
    expect(JSON.parse(JSON.stringify(e))).toMatchObject({
      kind: "server",
      status: 500,
      code: "ServerError",
      requestId: "r1",
    });
    expect(JSON.stringify(e)).not.toContain("cause");
    expect(e.message).toBe("server");
    expect(
      new AppError({ kind: KIND.SERVER, serverMessage: "m" }).message,
    ).toBe("m");
  });
});
