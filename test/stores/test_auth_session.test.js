// What the auth store does when the answer to "who am I?" is not a plain yes
// or no: a server that is down must not sign anyone out, and a session that
// expires while the page is open must be noticed and said.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const clearRepoSortPreferenceMock = vi.fn();
vi.mock("@/utils/repoSortPreference", () => ({
  clearRepoSortPreference: clearRepoSortPreferenceMock,
}));

let whoami;

function serve({ status = 200, body } = {}) {
  whoami = { calls: 0 };
  server.use(
    http.get("/api/whoami-v2", () => {
      whoami.calls += 1;
      return status === "network"
        ? HttpResponse.error()
        : jsonResponse(body ?? cloneFixture(uiApiFixtures.auth.whoamiV2), {
            status,
          });
    }),
    http.get("/api/users/:username/external-tokens", () => jsonResponse([])),
    http.post("/api/auth/login", () =>
      jsonResponse(cloneFixture(uiApiFixtures.auth.login)),
    ),
    http.post("/api/auth/logout", () => jsonResponse({})),
  );
}

async function createStore() {
  const { setActivePinia, createPinia } = await import("pinia");
  setActivePinia(createPinia());
  return (await import("@/stores/auth")).useAuthStore();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("init when the server cannot answer", () => {
  it.each([
    ["a server error", 500],
    ["a gateway error", 502],
    ["no answer at all", "network"],
  ])(
    "keeps the stored token after %s, and says it could not verify",
    async (_, status) => {
      localStorage.setItem("hf_token", "persisted-token");
      serve({ status, body: { detail: "boom" } });
      const store = await createStore();
      await store.init();
      expect(store.user).toBeNull();
      expect(store.token).toBe("persisted-token");
      expect(localStorage.getItem("hf_token")).toBe("persisted-token");
      expect(store.verifyError).not.toBeNull();
      expect(store.sessionNotice).toBe("unverified");
      expect(store.sessionExpired).toBe(false);
    },
  );

  it("signs in again from a retry once the server is back", async () => {
    serve({ status: 500, body: {} });
    const store = await createStore();
    await store.init();
    expect(store.sessionNotice).toBe("unverified");
    serve();
    await store.retryVerify();
    expect(store.user.username).toBe("owner");
    expect(store.verifyError).toBeNull();
    expect(store.sessionNotice).toBeNull();
  });

  it("still signs out for a definite 401", async () => {
    localStorage.setItem("hf_token", "persisted-token");
    serve({ status: 401, body: { detail: "Not authenticated" } });
    const store = await createStore();
    await store.init();
    expect(store.token).toBeNull();
    expect(localStorage.getItem("hf_token")).toBeNull();
    expect(store.verifyError).toBeNull();
  });

  it("does not forget a user it already knows because a later check failed", async () => {
    serve();
    const store = await createStore();
    await store.fetchUserInfo();
    serve({ status: 500, body: {} });
    await expect(store.fetchUserInfo()).rejects.toBeDefined();
    expect(store.user.username).toBe("owner");
    expect(store.userOrganizations.length).toBeGreaterThan(0);
  });
});

describe("a session that expires while the page is open", () => {
  async function signedIn() {
    serve();
    const store = await createStore();
    await store.fetchUserInfo();
    whoami.calls = 0;
    return store;
  }

  const authRequired = { kind: "auth-required" };

  it("is noticed when a request is refused and the check says 401", async () => {
    const store = await signedIn();
    serve({ status: 401, body: { detail: "Not authenticated" } });
    await store.handleAuthRequired(authRequired);
    expect(store.sessionExpired).toBe(true);
    expect(store.sessionNotice).toBe("expired");
    expect(store.user).toBeNull();
    expect(store.userOrganizations).toEqual([]);
    expect(clearRepoSortPreferenceMock).toHaveBeenCalled();
  });

  it("is not assumed when the check cannot be made", async () => {
    const store = await signedIn();
    serve({ status: 500, body: {} });
    await store.handleAuthRequired(authRequired);
    expect(store.sessionExpired).toBe(false);
    expect(store.user.username).toBe("owner");
  });

  it("is not assumed when the check says the session is fine", async () => {
    const store = await signedIn();
    serve();
    await store.handleAuthRequired(authRequired);
    expect(store.sessionExpired).toBe(false);
    expect(whoami.calls).toBe(1);
  });

  it("checks once for a burst of refusals, then not again within the window", async () => {
    const store = await signedIn();
    serve();
    await Promise.all([
      store.handleAuthRequired(authRequired),
      store.handleAuthRequired(authRequired),
      store.handleAuthRequired(authRequired),
    ]);
    expect(whoami.calls).toBe(1);
    await store.handleAuthRequired(authRequired);
    expect(whoami.calls).toBe(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);
    await store.handleAuthRequired(authRequired);
    expect(whoami.calls).toBe(2);
  });

  it("is not looked for when nobody is signed in", async () => {
    serve();
    const store = await createStore();
    await store.handleAuthRequired(authRequired);
    expect(whoami.calls).toBe(0);
  });

  it("is forgotten on the next sign-in, and on sign-out", async () => {
    const store = await signedIn();
    store.expireSession();
    expect(store.sessionExpired).toBe(true);
    await store.login({ username: "owner", password: "x" });
    expect(store.sessionExpired).toBe(false);
    store.expireSession();
    await store.logout();
    expect(store.sessionExpired).toBe(false);
  });
});
