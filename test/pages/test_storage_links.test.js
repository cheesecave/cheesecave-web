// In the storage tables a row cannot be a link, so the repository name in it is one: it opens in a new
// tab from the context menu. A click anywhere else on the row still goes to the repository.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  get: vi.fn(),
}));
vi.mock("vue-router/auto", () => ({
  useRoute: () => ({ params: { username: "alice", orgname: "acme" } }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { username: "alice" } }),
}));
vi.mock("@/utils/api", () => ({
  quotaAPI: { getNamespaceRepoStorage: (...a) => mocks.get(...a) },
}));

import UserStorage from "@/pages/[username]/storage.vue";
import OrgStorage from "@/pages/organizations/[orgname]/storage.vue";

const repository = (type, name) => ({
  repo_id: `alice/${name}`,
  name,
  repo_type: type,
  private: false,
  used_bytes: 10,
  quota_bytes: null,
  percentage_used: null,
  is_inheriting: true,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.get.mockResolvedValue({
    data: {
      repositories: [
        repository("model", "demo"),
        repository("dataset", "data"),
      ],
    },
  });
});

async function mountPage(page) {
  const wrapper = mount(page, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe.each([
  ["user", UserStorage],
  ["organization", OrgStorage],
])("%s storage page", (_, page) => {
  it("links each repository's name to its page", async () => {
    const wrapper = await mountPage(page);
    const names = wrapper.findAll("tbody tr a");
    expect(names.map((n) => [n.text(), n.attributes("href")])).toEqual([
      ["demo", "/models/alice/demo"],
      ["data", "/datasets/alice/data"],
    ]);
  });

  it("does not navigate twice when the name itself is clicked", async () => {
    const wrapper = await mountPage(page);
    const link = wrapper.get("tbody tr a");
    link.element.addEventListener("click", (e) => e.preventDefault(), {
      once: true,
    });
    await link.trigger("click");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("still goes to the repository from a click elsewhere on the row", async () => {
    const wrapper = await mountPage(page);
    await wrapper.get("tbody tr").trigger("click");
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/models/alice/demo");
  });
});
