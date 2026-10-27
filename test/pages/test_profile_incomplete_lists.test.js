// The user and organization pages list every repository of each type by following the server's `Link` pages, and
// say so when an external source had to be left out (the server names it in `X-Cheesecave-Incomplete`).

import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  mode: "user",
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
  orgAPI: { listMembers: async () => ({ data: { members: [] } }) },
  settingsAPI: {
    whoamiV2: async () => ({ data: { orgs: [] } }),
    getOrgProfile: async () => ({ data: {} }),
  },
  socialAPI: {
    getFollowState: async () => ({
      data: {
        username: "bob",
        is_org: false,
        following: false,
        can_follow: false,
        followers_count: 0,
        following_count: 0,
      },
    }),
  },
}));
import UserOverview from "@/pages/[username]/index.vue";
import UserType from "@/pages/[username]/[type].vue";
import OrgOverview from "@/pages/organizations/[orgname]/index.vue";
import OrgType from "@/pages/organizations/[orgname]/[type].vue";

const PAGES = [
  ["user overview", UserOverview, "user", {}],
  ["user type page", UserType, "user", { type: "models" }],
  ["organization overview", OrgOverview, "org", {}],
  ["organization type page", OrgType, "org", { type: "models" }],
];

let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.listAllRepos.mockResolvedValue({ data: [], incomplete: [] });
  server.use(
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: "user", _source: "local" }),
    ),
    http.get("*/org/:name", () =>
      mocks.mode === "user"
        ? jsonResponse({}, { status: 404 })
        : jsonResponse({ name: "bob" }),
    ),
    http.get("*/api/users/:name/profile", () =>
      jsonResponse({ full_name: "Bob", created_at: "2025-01-01T00:00:00Z" }),
    ),
    http.get("*/api/quota/:name/public", () => jsonResponse(null)),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse(null, { status: 404 }),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage(component, mode, params) {
  mocks.mode = mode;
  mocks.route = reactive({
    params: { username: "bob", orgname: "bob", ...params },
    query: {},
    fullPath: "/bob",
  });
  wrapper = mount(component, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: true,
        SocialLinks: true,
        ElScrollbar: {
          setup:
            (_, { slots }) =>
            () =>
              h("div", slots.default?.()),
        },
      },
    },
  });
  await flushPromises();
  await vi.waitFor(() =>
    expect(wrapper.text()).not.toMatch(/Loading (user profile|organization)/),
  );
  await flushPromises();
}
const notice = () => wrapper.find('[data-testid="incomplete-notice"]');

describe.each(PAGES)("%s", (_name, component, mode, params) => {
  it("lists each type through the paginating call, and leaves the page size to it", async () => {
    await mountPage(component, mode, params);

    const types = mocks.listAllRepos.mock.calls.map(([type]) => type).sort();
    expect(types).toEqual(["dataset", "model", "space"]);
    for (const [, query] of mocks.listAllRepos.mock.calls) {
      expect(query.author).toBe("bob");
      expect(query.sort).toEqual(expect.any(String));
      expect(query).not.toHaveProperty("limit");
    }
  });

  it("shows no notice when every source answered", async () => {
    await mountPage(component, mode, params);

    expect(notice().exists()).toBe(false);
  });

  it("names the sources left out of any of the three lists, once each", async () => {
    const left = {
      model: ["HuggingFace"],
      dataset: ["HuggingFace", "Mirror"],
      space: [],
    };
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [],
      incomplete: left[type],
    }));

    await mountPage(component, mode, params);

    expect(notice().text()).toContain("HuggingFace, Mirror");
  });
});

describe.each(PAGES)(
  "%s, when a list is loaded again",
  (_name, component, mode, params) => {
    it("drops the notice once the source answers for that list", async () => {
      mocks.listAllRepos.mockImplementation(async (type) => ({
        data: [],
        incomplete: type === "model" ? ["HuggingFace"] : [],
      }));
      await mountPage(component, mode, params);
      expect(notice().exists()).toBe(true);

      mocks.listAllRepos.mockResolvedValue({ data: [], incomplete: [] });
      // the sort of the models list is the trigger each page has to load it again
      const state = wrapper.vm;
      if (state.selectedSorts) state.selectedSorts.model = "likes";
      else state.selectedSort = "likes";
      await flushPromises();
      await vi.waitFor(() => expect(notice().exists()).toBe(false));
    });
  },
);
