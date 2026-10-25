// The account pages link to the pages they lead to: View Details on a profile goes to the storage
// page, and each organization in the settings goes to that organization.

import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  router: { push: vi.fn(), replace: vi.fn() },
  fetchUserInfo: vi.fn(),
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/utils/api", () => ({
  repoAPI: { listAllRepos: async () => ({ data: [], incomplete: [] }) },
  orgAPI: { listMembers: async () => ({ data: { members: [] } }) },
  authAPI: {
    listTokens: async () => ({ data: { tokens: [] } }),
    getAvailableSources: async () => ({ data: [] }),
  },
  settingsAPI: {
    getUserProfile: async () => ({ data: {} }),
    getOrgProfile: async () => ({ data: {} }),
    whoamiV2: async () => ({ data: { orgs: [] } }),
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

import ProfilePage from "@/pages/[username]/index.vue";
import SettingsPage from "@/pages/settings.vue";
import { useAuthStore } from "@/stores/auth";

let wrapper;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.clear();
  const auth = useAuthStore();
  auth.user = { username: "bob", email: "bob@example.org" };
  auth.fetchUserInfo = mocks.fetchUserInfo;
  mocks.fetchUserInfo.mockResolvedValue({
    orgs: [{ name: "acme", roleInOrg: "super-admin" }],
  });
  server.use(
    http.get("*/org/:name", () => jsonResponse({}, { status: 404 })),
    http.get("*/api/users/:name/profile", () =>
      jsonResponse({ full_name: "Bob", created_at: "2025-01-01T00:00:00Z" }),
    ),
    http.get("*/api/quota/:name/public", () =>
      jsonResponse({
        can_see_private: true,
        public_used_bytes: 10,
        public_quota_bytes: null,
        private_used_bytes: 5,
        private_quota_bytes: null,
        total_used_bytes: 15,
      }),
    ),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse(null, { status: 404 }),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage(component, params = {}) {
  mocks.route = reactive({
    params: { username: "bob", ...params },
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
        AvatarUpload: true,
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
  await flushPromises();
  return wrapper;
}

describe("profile page", () => {
  it("links View Details to the storage page", async () => {
    await mountPage(ProfilePage);
    const details = wrapper
      .findAll("a")
      .find((item) => item.text().includes("View Details"));
    expect(details.attributes("href")).toBe("/bob/storage");
    expect(
      wrapper.findAll("button").some((b) => b.text().includes("View Details")),
    ).toBe(false);
  });
});

describe("account settings", () => {
  it("makes each organization row one link to that organization", async () => {
    await mountPage(SettingsPage);
    const name = wrapper.findAll("a").find((item) => item.text() === "acme");
    expect(name.attributes("href")).toBe("/organizations/acme");
    expect(name.classes()).toContain("stretched-link");
    const row = name.element.closest(".relative");
    expect(row).not.toBeNull();
    row.click();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
