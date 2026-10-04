import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  mode: "user",
  source: "local",
  missing: false,
  getFollowState: vi.fn(),
  listRepos: vi.fn(),
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
vi.mock("@/utils/api", () => ({
  repoAPI: { listRepos: (...args) => mocks.listRepos(...args) },
  orgAPI: { listMembers: async () => ({ data: { members: [] } }) },
  settingsAPI: {
    whoamiV2: async () => ({ data: { orgs: [] } }),
    getOrgProfile: async () => ({ data: { description: "Our team" } }),
  },
  socialAPI: { getFollowState: (...args) => mocks.getFollowState(...args) },
}));
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import UserProfile from "@/pages/[username]/index.vue";
import OrgProfile from "@/pages/organizations/[orgname]/index.vue";

describe("local profile Follow integration", () => {
  let wrapper;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route = reactive({
      params: { username: "bob", orgname: "bob" },
      query: {},
      fullPath: "/bob",
    });
    mocks.source = "local";
    mocks.missing = false;
    mocks.listRepos.mockResolvedValue({ data: [] });
    mocks.getFollowState.mockResolvedValue({
      data: {
        username: "bob",
        is_org: false,
        following: false,
        can_follow: false,
        followers_count: 1,
        following_count: 2,
      },
    });
    server.use(
      http.get("*/org/:name", () =>
        mocks.mode === "user" || mocks.missing
          ? jsonResponse({}, { status: 404 })
          : jsonResponse({ name: "bob", _source: mocks.source }),
      ),
      http.get("*/api/users/:name/profile", () =>
        mocks.missing
          ? jsonResponse({}, { status: 404 })
          : jsonResponse({
              full_name: "Bob",
              _source: mocks.source,
              created_at: "2025-01-01T00:00:00Z",
            }),
      ),
      http.get("*/api/quota/:name/public", () => jsonResponse(null)),
      http.get("*/spaces/:namespace/:name/resolve/main/README.md", () =>
        jsonResponse({}, { status: 404 }),
      ),
    );
  });
  afterEach(() => wrapper?.unmount());
  async function mountProfile(mode) {
    mocks.mode = mode;
    wrapper = mount(mode === "user" ? UserProfile : OrgProfile, {
      global: {
        stubs: {
          ...ElementPlusStubs,
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
      expect(wrapper.text()).not.toContain(
        mode === "user" ? "Loading user profile" : "Loading organization",
      ),
    );
    await flushPromises();
  }
  it.each(["user", "org"])(
    "adds public follow controls to a local %s profile",
    async (mode) => {
      await mountProfile(mode);
      const avatar = wrapper.getComponent(EntityAvatar);
      expect(avatar.props()).toMatchObject({
        username: "bob",
        isOrg: mode === "org",
        size: 80,
      });
      expect(avatar.get("img").attributes("src")).toBe(
        `/api/${mode === "org" ? "organizations" : "users"}/bob/avatar`,
      );
      await avatar.get("img").trigger("error");
      expect(avatar.text()).toBe("BO");
      expect(wrapper.find(".follow-controls").exists()).toBe(true);
      expect(mocks.getFollowState).toHaveBeenCalledExactlyOnceWith("bob");
      expect(wrapper.get(".follow-counts").text()).toContain("1 followers");
    },
  );
  it.each(["user", "org"])(
    "does not issue social requests for external %s profiles",
    async (mode) => {
      mocks.source = "huggingface";
      await mountProfile(mode);
      expect(wrapper.find(".follow-controls").exists()).toBe(false);
      expect(mocks.getFollowState).not.toHaveBeenCalled();
    },
  );
  it.each(["user", "org"])(
    "preserves the missing %s profile state without follow requests",
    async (mode) => {
      mocks.missing = true;
      await mountProfile(mode);
      expect(wrapper.text()).toContain("Not Found");
      expect(mocks.getFollowState).not.toHaveBeenCalled();
    },
  );
});
