import { defineComponent, h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  listAllRepos: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    username: null,
    user: null,
    token: null,
  }),
}));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  repoAPI: { listAllRepos: (...args) => mocks.listAllRepos(...args) },
}));
import UserRepositories from "@/pages/[username]/[type].vue";

const profile = {
  full_name: "Bob Illustrator",
  bio: "Making illustrated models and datasets.",
  website: "https://bob.example/",
  avatar_url: "/api/users/bob/avatar",
  avatar_updated_at: "123",
  created_at: "2025-01-01T00:00:00Z",
  _source: "local",
};
const ownerActions = defineComponent({
  name: "ProfileOwnerActions",
  props: { username: String },
  setup(props) {
    return () => h("div", { "data-owner-actions": props.username });
  },
});
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.listAllRepos.mockImplementation(async (type) => ({
    data: [
      { id: `bob/portrait-${type}`, author: "bob", tags: ["drawing"] },
      { id: `bob/landscape-${type}`, author: "guest", tags: ["nature"] },
    ],
    incomplete: [],
  }));
  server.use(
    http.get("*/org/:name", () => jsonResponse({}, { status: 404 })),
    http.get("*/api/users/:name/profile", () => jsonResponse(profile)),
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: "user", _source: "local" }),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage(type = "models") {
  mocks.route = reactive({
    params: { username: "bob", type },
    query: {},
    fullPath: `/bob/${type}`,
  });
  wrapper = mount(UserRepositories, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        ProfileOwnerActions: ownerActions,
      },
    },
  });
  await flushPromises();
  await vi.waitFor(() =>
    expect(wrapper.text()).not.toMatch(
      /Loading (user profile|models|datasets|spaces)\.\.\./,
    ),
  );
  await flushPromises();
}

describe("user repository list profile", () => {
  it("shows the returned profile and account avatar beside the repositories", async () => {
    await mountPage();

    const sidebar = wrapper.get("aside");
    expect(sidebar.text()).toContain(profile.full_name);
    expect(sidebar.text()).toContain(profile.bio);
    expect(sidebar.get('a[title="Website"]').attributes("href")).toBe(
      profile.website,
    );
    expect(sidebar.get(".entity-avatar img").attributes("src")).toBe(
      "/api/users/bob/avatar?v=123",
    );
    expect(
      sidebar.get("[data-owner-actions]").attributes("data-owner-actions"),
    ).toBe("bob");
  });

  it.each(["models", "datasets", "spaces"])(
    "marks only the current %s navigation link as the current page",
    async (type) => {
      await mountPage(type);

      const current = wrapper.get('aside a[aria-current="page"]');
      expect(current.attributes("href")).toBe(`/bob/${type}`);
      expect(wrapper.findAll('aside a[aria-current="page"]')).toHaveLength(1);
      for (const destination of [
        "/bob",
        "/bob/models",
        "/bob/datasets",
        "/bob/spaces",
      ])
        expect(
          wrapper.get(`aside a[href="${destination}"]`).find("button").exists(),
        ).toBe(false);
      expect(wrapper.findAll("h1")).toHaveLength(1);
      expect(wrapper.get("h1").text()).toBe(
        `All ${type[0].toUpperCase()}${type.slice(1)}`,
      );
    },
  );

  it("keeps the homepage destination a real link for a missing user", async () => {
    server.use(
      http.get("*/api/users/:name/type", () =>
        jsonResponse({}, { status: 404 }),
      ),
      http.get("*/api/users/:name/profile", () =>
        jsonResponse({}, { status: 404 }),
      ),
    );
    await mountPage();

    expect(wrapper.get("h1").text()).toBe("User Not Found");
    const link = wrapper.get('a[href="/"]');
    expect(link.text()).toBe("Go to Homepage");
    expect(link.find("button").exists()).toBe(false);
  });

  it("does not mount local owner actions for an explicitly external profile", async () => {
    server.use(
      http.get("*/api/users/:name/type", () =>
        jsonResponse({}, { status: 404 }),
      ),
      http.get("*/api/users/:name/profile", () =>
        jsonResponse({ ...profile, _source: "huggingface" }),
      ),
    );
    await mountPage();

    expect(wrapper.get("aside").text()).toContain(profile.full_name);
    expect(wrapper.find("[data-owner-actions]").exists()).toBe(false);
  });

  it.each(["models", "datasets", "spaces"])(
    "preserves %s search and requests the selected sort through the existing API",
    async (type) => {
      await mountPage(type);
      const apiType = type.slice(0, -1);
      const names = () =>
        wrapper.findAll("main .card h3 a").map((link) => link.text());
      const search = wrapper.get(`input[aria-label="Search ${type}"]`);
      const initialRequests = mocks.listAllRepos.mock.calls.length;

      await search.setValue("PORTRAIT");
      expect(names()).toEqual([`bob/portrait-${apiType}`]);
      await search.setValue("guest");
      expect(names()).toEqual([`bob/landscape-${apiType}`]);
      await search.setValue("DRAWING");
      expect(names()).toEqual([`bob/portrait-${apiType}`]);
      await search.setValue("no-match");
      expect(wrapper.text()).toContain(`No ${type} found`);
      await search.setValue("");
      expect(names()).toHaveLength(2);
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(initialRequests);

      await wrapper.get(`select[aria-label="Sort ${type}"]`).setValue("likes");
      await flushPromises();
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(initialRequests + 1);
      expect(mocks.listAllRepos).toHaveBeenCalledWith(apiType, {
        author: "bob",
        sort: "likes",
      });
      expect(
        window.sessionStorage.getItem(
          `kohakuhub:repo-sort-preference:user:${apiType}`,
        ),
      ).toBe("likes");
    },
  );

  it("updates the current navigation and clears the search when changing list type", async () => {
    await mountPage();
    await wrapper.get('input[aria-label="Search models"]').setValue("portrait");

    mocks.route.params.type = "datasets";
    await flushPromises();

    expect(wrapper.get('aside a[aria-current="page"]').attributes("href")).toBe(
      "/bob/datasets",
    );
    expect(
      wrapper.get('input[aria-label="Search datasets"]').element.value,
    ).toBe("");
    expect(wrapper.get("h1").text()).toBe("All Datasets");
    expect(
      wrapper.findAll("main .card h3 a").map((link) => link.text()),
    ).toEqual(["bob/portrait-dataset", "bob/landscape-dataset"]);
  });
});
