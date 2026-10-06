// What the shared axios clients do with a failure: attach the decoded error,
// tell the session hook about a "sign in" answer, and refuse a page where JSON
// was expected. The bare axios the user and organization pages use gets the
// same treatment, and a timeout.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { server } from "../setup/msw-server";

async function load() {
  vi.resetModules();
  const [{ default: api }, axiosModule, errors] = await Promise.all([
    import("@/utils/api"),
    import("axios"),
    import("@/errors"),
  ]);
  return { api, axios: axiosModule.default, ...errors };
}

beforeEach(() => localStorage.clear());

describe("the shared axios client", () => {
  it("attaches the decoded error, with the request id, to a failed request", async () => {
    server.use(
      http.get("/api/boom", () =>
        HttpResponse.json(
          { detail: "x" },
          { status: 500, headers: { "x-request-id": "rid-7" } },
        ),
      ),
    );
    const { api, KIND } = await load();
    const err = await api.get("/api/boom").catch((e) => e);
    expect(err.response.status).toBe(500);
    expect(err.appError.kind).toBe(KIND.SERVER);
    expect(err.appError.requestId).toBe("rid-7");
  });

  it("tells the session hook about a refusal for want of a sign-in, and only that", async () => {
    server.use(
      http.get("/api/private", () =>
        HttpResponse.json({ detail: "Not authenticated" }, { status: 401 }),
      ),
      http.get("/api/missing", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    const { api, onAuthRequired } = await load();
    const seen = vi.fn();
    onAuthRequired(seen);
    await api.get("/api/missing").catch(() => {});
    expect(seen).not.toHaveBeenCalled();
    await api.get("/api/private").catch(() => {});
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].kind).toBe("auth-required");
  });

  it("rejects a page where the API should have answered, instead of handing it over as data", async () => {
    server.use(
      http.get(
        "/api/ok-but-html",
        () =>
          new HttpResponse("<html><body>We'll be right back</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const { api, KIND } = await load();
    const err = await api.get("/api/ok-but-html").catch((e) => e);
    expect(err.appError.kind).toBe(KIND.UNEXPECTED);
    expect(err.appError.status).toBe(200);
  });

  it("leaves a normal answer, and an answer with no headers, alone", async () => {
    server.use(http.get("/api/fine", () => HttpResponse.json({ ok: true })));
    const { api } = await load();
    expect((await api.get("/api/fine")).data).toEqual({ ok: true });
    const handler = api.interceptors.response.handlers[0];
    const bare = { data: 1 };
    expect(handler.fulfilled(bare)).toBe(bare);
  });

  it("annotates whatever was thrown, even a plain error", async () => {
    const { api, KIND } = await load();
    const handler = api.interceptors.response.handlers[0];
    const err = new Error("boom");
    await expect(handler.rejected(err)).rejects.toBe(err);
    expect(err.appError.kind).toBe(KIND.BUG);
    await expect(handler.rejected(undefined)).rejects.toBeUndefined();
  });
});

describe("an error that was decoded already", () => {
  it("is passed on as it is, and not reported to the session hook twice", async () => {
    const { api, AppError, KIND, onAuthRequired } = await load();
    const seen = vi.fn();
    onAuthRequired(seen);
    const handler = api.interceptors.response.handlers[0];
    const error = Object.assign(new Error("x"), {
      appError: new AppError({ kind: KIND.AUTH_REQUIRED }),
    });
    await expect(handler.rejected(error)).rejects.toBe(error);
    expect(error.appError.kind).toBe(KIND.AUTH_REQUIRED);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("bare axios, as the user and organization pages use it", () => {
  it("waits no longer than the shared client does", async () => {
    const { axios } = await load();
    expect(axios.defaults.timeout).toBe(30000);
  });

  it("gets the same protection", async () => {
    server.use(
      http.get(
        "/api/users/x/profile",
        () =>
          new HttpResponse("<html>maintenance</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const { axios, KIND } = await load();
    const err = await axios.get("/api/users/x/profile").catch((e) => e);
    expect(err.appError.kind).toBe(KIND.UNEXPECTED);
  });
});
