// The storage breakdown pages say why the data did not load, in the app's words.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { username: "alice", orgname: "acme" } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("vue-router/auto", () => ({
  useRoute: () => ({ params: { username: "alice", orgname: "acme" } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { username: "alice" } }),
}));
vi.mock("@/utils/api", () => ({
  quotaAPI: { getNamespaceRepoStorage: (...a) => mocks.get(...a) },
}));

import UserStorage from "@/pages/[username]/storage.vue";
import OrgStorage from "@/pages/organizations/[orgname]/storage.vue";

const failure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const mountPage = (page) =>
  mount(page, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
const title = (w) => w.get('[data-testid="error-title"]').text();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["user", UserStorage, "User not found"],
  ["organization", OrgStorage, "Organization not found"],
])("%s storage page", (_, page, missing) => {
  it("says what is missing", async () => {
    mocks.get.mockRejectedValue(failure(404));
    const w = mountPage(page);
    await flushPromises();
    expect(title(w)).toBe(missing);
  });

  it("says access is refused", async () => {
    mocks.get.mockRejectedValue(failure(403));
    const w = mountPage(page);
    await flushPromises();
    expect(title(w)).toBe("You don't have access");
  });

  it("retries after the service was unavailable", async () => {
    mocks.get.mockRejectedValueOnce(failure(503));
    const w = mountPage(page);
    await flushPromises();
    expect(title(w)).toBe("Service unavailable");
    mocks.get.mockRejectedValueOnce(failure(503));
    await w.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("shows nothing for a cancelled load", async () => {
    mocks.get.mockRejectedValue(new DOMException("a", "AbortError"));
    const w = mountPage(page);
    await flushPromises();
    expect(w.find('[data-testid="error-state"]').exists()).toBe(false);
  });
});
