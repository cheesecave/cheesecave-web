import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  auth: null,
  route: null,
  list: vi.fn(),
  listAllRepos: vi.fn(),
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  repoAPI: {
    listAllRepos: (...args) => mocks.listAllRepos(...args),
    getInfo: async () => ({ data: { private: false } }),
  },
  collectionsAPI: { list: (...args) => mocks.list(...args) },
}));
import Overview from "@/pages/[username]/index.vue";

const COLLECTION = (title) => ({
  slug: `bob/${title}-0123456789abcdef01234567`,
  title,
  owner: { name: "bob", type: "user" },
  items: [],
  upvotes: 0,
  private: false,
});

let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "bob",
    user: { username: "bob" },
  });
  mocks.route = reactive({
    path: "/bob",
    params: { username: "bob" },
    query: {},
    hash: "",
    fullPath: "/bob",
  });
  mocks.listAllRepos.mockImplementation(async (type) => ({
    data: [{ id: `bob/public-${type}`, private: false }],
    incomplete: [],
  }));
  server.use(
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: "user", _source: "local" }),
    ),
    http.get("*/org/:name", () => new HttpResponse(null, { status: 404 })),
    http.get("*/api/users/:name/profile", () =>
      jsonResponse({ username: "bob", full_name: "Bob", _source: "local" }),
    ),
    http.get("*/api/quota/:name/public", () =>
      jsonResponse({
        public_used_bytes: 1,
        public_quota_bytes: null,
        private_used_bytes: 2,
        private_quota_bytes: null,
        total_used_bytes: 3,
        can_see_private: true,
      }),
    ),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse("x"),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage() {
  wrapper = mount(Overview, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        FollowControls: true,
        MarkdownViewer: true,
      },
    },
  });
  await vi.waitFor(() =>
    expect(wrapper.findAll(".profile-repo-card").length).toBeGreaterThan(0),
  );
  await flushPromises();
}

describe("collections on the profile page", () => {
  it("shows the first two collections in the owner's order, with a link to all of them", async () => {
    mocks.list.mockResolvedValue({
      data: [COLLECTION("Alpha"), COLLECTION("Beta")],
    });
    await mountPage();
    expect(mocks.list).toHaveBeenCalledWith({
      owner: "bob",
      sort: "position",
      limit: 2,
    });
    const section = wrapper.get('section[aria-label="Collections"]');
    expect(section.text()).toContain("Alpha");
    expect(section.text()).toContain("Beta");
    expect(
      section
        .findAllComponents(RouterLinkStub)
        .some((l) => l.props("to") === "/bob/collections"),
    ).toBe(true);
    expect(
      wrapper
        .findAllComponents(RouterLinkStub)
        .some((l) => l.props("to") === "/bob/collections"),
    ).toBe(true);
  });

  it("shows no section when there are none, or when they could not be loaded", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    await mountPage();
    expect(wrapper.find('section[aria-label="Collections"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
    mocks.list.mockRejectedValue(new Error("boom"));
    await mountPage();
    expect(wrapper.find('section[aria-label="Collections"]').exists()).toBe(
      false,
    );
  });
});
