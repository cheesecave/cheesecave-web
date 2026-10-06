import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(() => ({ close: vi.fn() })) }));
vi.mock("element-plus", () => ({ ElMessage: toast }));
const clipboard = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => true),
}));
vi.mock("@/utils/clipboard", () => clipboard);

import { AppError, KIND } from "@/errors";
import { downloadMessage, hubFetch, probeUrl } from "@/errors/http";
import { notifyError, resetNotifyDedupe } from "@/errors/notify";
import { emitAuthRequired, onAuthRequired } from "@/errors/session";

// like the real fetch: rejects at once for a signal that is already aborted, or when it aborts
const abortable = (url, { signal }) =>
  new Promise((_, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort);
  });

const response = (status, { headers = {}, body = "" } = {}) =>
  new Response(body, { status, headers });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("session hook", () => {
  it("hands an AUTH_REQUIRED error to whoever registered, until they unregister", () => {
    const seen = [];
    const off = onAuthRequired((e) => seen.push(e));
    const e = new AppError({ kind: KIND.AUTH_REQUIRED });
    emitAuthRequired(e);
    off();
    emitAuthRequired(e);
    expect(seen).toEqual([e]);
  });

  it("does nothing when nobody is listening, and an old handler cannot unregister a newer one", () => {
    expect(() =>
      emitAuthRequired(new AppError({ kind: KIND.AUTH_REQUIRED })),
    ).not.toThrow();
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onAuthRequired(first);
    onAuthRequired(second);
    offFirst();
    emitAuthRequired(new AppError({ kind: KIND.AUTH_REQUIRED }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("hubFetch", () => {
  it("returns a successful response untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200, { body: "ok" })),
    );
    const r = await hubFetch("/x");
    expect(await r.text()).toBe("ok");
  });

  it("throws the decoded error for a failed response, reading the body and the request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(409, {
          headers: {
            "x-request-id": "r-9",
            "content-type": "application/json",
          },
          body: '{"detail":"Name taken"}',
        }),
      ),
    );
    const e = await hubFetch("/x").catch((err) => err);
    expect(e).toBeInstanceOf(AppError);
    expect([e.kind, e.serverMessage, e.requestId, e.status]).toEqual([
      KIND.CONFLICT,
      "Name taken",
      "r-9",
      409,
    ]);
  });

  it("decodes a refused connection as a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const e = await hubFetch("/x").catch((err) => err);
    expect(e.kind).toBe(KIND.NETWORK);
  });

  it("gives up after the timeout and calls it a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(abortable));
    const pending = hubFetch("/slow", {}, { timeoutMs: 5000 }).catch(
      (err) => err,
    );
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending).kind).toBe(KIND.TIMEOUT);
  });

  it("stays a cancellation when the caller aborts", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(abortable));
    const pending = hubFetch("/x", { signal: controller.signal }).catch(
      (err) => err,
    );
    controller.abort();
    expect((await pending).kind).toBe(KIND.CANCELLED);
    const already = new AbortController();
    already.abort();
    expect(
      (await hubFetch("/x", { signal: already.signal }).catch((err) => err))
        .kind,
    ).toBe(KIND.CANCELLED);
  });

  it("refuses an HTML page where JSON was expected, but allows it when anything will do", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(200, {
          headers: { "content-type": "text/html" },
          body: "<html>maintenance</html>",
        }),
      ),
    );
    const e = await hubFetch("/api/x", {}, { expect: "json" }).catch(
      (err) => err,
    );
    expect(e.kind).toBe(KIND.UNEXPECTED);
    expect((await hubFetch("/page")).status).toBe(200);
  });

  it("accepts a JSON answer that names no content type at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    expect((await hubFetch("/api/x", {}, { expect: "json" })).status).toBe(204);
  });

  it("clears its timer when the answer comes in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200)),
    );
    await hubFetch("/x", {}, { timeoutMs: 1000 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("probeUrl and downloadMessage", () => {
  it("says ok for a reachable URL, asking for one byte", async () => {
    const fetchMock = vi.fn(async () => response(206));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeUrl("/f")).toEqual({ ok: true, error: null });
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe("bytes=0-0");
  });

  it("returns the error for an unreachable one instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(404, { headers: { "x-error-code": "EntryNotFound" } }),
      ),
    );
    const r = await probeUrl("/f");
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("EntryNotFound");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect((await probeUrl("/f")).error.kind).toBe(KIND.NETWORK);
  });

  it("writes a one-line reason for a download that cannot start", () => {
    expect(downloadMessage(new AppError({ kind: KIND.NOT_FOUND }))).toBe(
      "Download failed: File not found",
    );
    expect(downloadMessage(new AppError({ kind: KIND.GATED }))).toContain(
      "Access needs a token",
    );
  });
});

describe("notifyError", () => {
  beforeEach(() => {
    toast.error.mockClear();
    resetNotifyDedupe();
  });

  const shown = () => toast.error.mock.calls.at(-1)[0];

  it("puts the action and the reason in one line, using the server's words for a client mistake", () => {
    notifyError(
      {
        isAxiosError: true,
        response: {
          status: 400,
          headers: {},
          data: { detail: "Email already exists" },
        },
      },
      { fallback: "Failed to update profile" },
    );
    expect(shown().message).toBe(
      "Failed to update profile: Email already exists",
    );
  });

  it("uses its own words, and the request id, for a failure on the server's side", () => {
    notifyError(
      {
        isAxiosError: true,
        response: {
          status: 500,
          headers: { "x-request-id": "abc123" },
          data: { detail: "psycopg2.errors: password=hunter2" },
        },
      },
      { fallback: "Failed to save" },
    );
    const vnode = shown().message;
    const text = JSON.stringify(vnode);
    expect(text).toContain(
      "Failed to save: Something went wrong on the server",
    );
    expect(text).toContain("abc123");
    expect(text).not.toContain("hunter2");
  });

  it("copies the request id when asked", async () => {
    notifyError({
      isAxiosError: true,
      response: { status: 502, headers: { "x-request-id": "rid-1" }, data: "" },
    });
    const vnode = shown().message;
    const button = vnode.children.find((c) => c && c.props && c.props.onClick);
    await button.props.onClick();
    expect(clipboard.copyToClipboard).toHaveBeenCalledWith("rid-1");
  });

  it("says nothing for a cancelled request", () => {
    expect(
      notifyError(Object.assign(new Error("x"), { name: "AbortError" })),
    ).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not repeat the same toast within a moment, but does after it", () => {
    vi.useFakeTimers();
    const fail = () =>
      notifyError(new TypeError("Failed to fetch"), {
        fallback: "Failed to load",
      });
    fail();
    fail();
    expect(toast.error).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    fail();
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("falls back to a plain default and keeps working for any input", () => {
    notifyError(undefined);
    expect(shown().message).toContain("Something went wrong in the app");
    notifyError("a string", { fallback: "Could not do it" });
    expect(toast.error).toHaveBeenCalledTimes(2);
  });
});
