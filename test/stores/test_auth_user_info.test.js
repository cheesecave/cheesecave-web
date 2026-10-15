// `GET /api/whoami-v2` was asked twice at load: once by the auth store when the app starts, once by the page that
// wants the account's organizations. The store now keeps the answer for a few seconds and shares a request that is
// still in flight; a page asks the store (`fetchUserInfo`) instead of the API. The session check after a refused
// request stays a direct request: it exists to ask the server again.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http } from "@/testing/msw";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

describe("the auth store's user info", () => {
  let requests;
  let status;
  let now;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    requests = 0;
    status = 200;
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    server.use(
      http.get("/api/whoami-v2", () => {
        requests += 1;
        return jsonResponse(cloneFixture(uiApiFixtures.auth.whoamiV2), {
          status,
        });
      }),
      http.post("/api/auth/login", () => jsonResponse({})),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  async function createStore() {
    const { createPinia, setActivePinia } = await import("pinia");
    setActivePinia(createPinia());
    const { useAuthStore } = await import("@/stores/auth");
    return useAuthStore();
  }

  it("shares one request between callers that ask together", async () => {
    const store = await createStore();

    const [a, b] = await Promise.all([
      store.fetchUserInfo(),
      store.fetchUserInfo(),
    ]);

    expect(requests).toBe(1);
    expect(a.name).toBe("owner");
    expect(b).toBe(a);
  });

  it("answers from the store for a few seconds, then asks again", async () => {
    const store = await createStore();
    const first = await store.fetchUserInfo();

    now += 4_999;
    expect(await store.fetchUserInfo()).toEqual(first);
    expect(requests).toBe(1);

    now += 2;
    await store.fetchUserInfo();
    expect(requests).toBe(2);
  });

  it("asks again when told to", async () => {
    const store = await createStore();
    await store.fetchUserInfo();

    await store.fetchUserInfo({ force: true });

    expect(requests).toBe(2);
  });

  it("does not keep a failure: the next call asks again", async () => {
    const store = await createStore();
    status = 500;
    await expect(store.fetchUserInfo()).rejects.toBeTruthy();

    status = 200;
    await store.fetchUserInfo();

    expect(requests).toBe(2);
    expect(store.user.username).toBe("owner");
  });

  it("does not answer for an account that signed out or in again", async () => {
    const store = await createStore();
    await store.fetchUserInfo();

    await store.logout().catch(() => {});
    expect(store.user).toBeNull();
    await store.fetchUserInfo();
    expect(requests).toBe(2);

    await store.login({ username: "owner", password: "x" });
    expect(requests).toBe(3);
  });

  it("is what the pages ask: none of them calls the whoami API itself", () => {
    const pages = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".vue")) pages.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    const callers = pages
      .filter((path) => /\bwhoamiV2\(/.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(callers).toEqual([]);
  });
});
