// On the organization pages, every control that goes to a page of its own is a link, so it opens in a
// new tab: the Create Organization buttons, each organization card, the settings and storage buttons
// and the member rows.

import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  router: { push: vi.fn(), replace: vi.fn() },
  orgs: [],
  fetchUserInfo: vi.fn(),
  orgAPI: { get: vi.fn(), listMembers: vi.fn() },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    username: "alice",
    user: { username: "alice" },
    token: null,
    fetchUserInfo: mocks.fetchUserInfo,
    canWriteToNamespace: () => true,
  }),
}));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  repoAPI: { listAllRepos: async () => ({ data: [], incomplete: [] }) },
  orgAPI: { ...(await original()).orgAPI, ...mocks.orgAPI },
  settingsAPI: { getOrgProfile: async () => ({ data: {} }) },
  socialAPI: {
    getFollowState: async () => ({
      data: {
        username: "acme",
        is_org: true,
        following: false,
        can_follow: false,
        followers_count: 0,
        following_count: 0,
      },
    }),
  },
}));

import OrganizationList from "@/pages/organizations/index.vue";
import OrganizationPage from "@/pages/organizations/[orgname]/index.vue";
import OrganizationTypePage from "@/pages/organizations/[orgname]/[type].vue";

let wrapper;
const MEMBERS = [{ user: "bob", role: "member" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetchUserInfo.mockResolvedValue({
    name: "alice",
    orgs: [{ name: "acme", roleInOrg: "admin" }],
  });
  mocks.orgAPI.get.mockResolvedValue({
    data: { description: "Acme", repo_count: { total: 2 } },
  });
  mocks.orgAPI.listMembers.mockResolvedValue({ data: { members: MEMBERS } });
  server.use(
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: "org", _source: "local" }),
    ),
    http.get("*/org/:name", () => jsonResponse({ name: "acme" })),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse(null, { status: 404 }),
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
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage(component, params = {}) {
  mocks.route = reactive({
    params: { orgname: "acme", ...params },
    query: {},
    fullPath: "/organizations/acme",
  });
  wrapper = mount(component, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        EntityAvatar: true,
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
    expect(wrapper.text()).not.toMatch(/Loading (organization|organizations)/),
  );
  await flushPromises();
  return wrapper;
}

const link = (text) =>
  wrapper.findAll("a").find((item) => item.text().includes(text));
const hasButton = (text) =>
  wrapper.findAll("button").some((item) => item.text().includes(text));

describe("organizations list", () => {
  it("links Create Organization to the form, as a button-looking link", async () => {
    await mountPage(OrganizationList);
    expect(link("Create Organization").attributes("href")).toBe(
      "/organizations/new",
    );
    expect(hasButton("Create Organization")).toBe(false);
  });

  it("makes each organization card one link, with no click handler behind it", async () => {
    await mountPage(OrganizationList);
    const name = wrapper.get("h3 a");
    expect(name.attributes("href")).toBe("/organizations/acme");
    expect(name.classes()).toContain("stretched-link");
    const card = wrapper.findAll(".card").find((c) => c.find("h3 a").exists());
    expect(card.classes()).toContain("relative");
    expect(card.classes()).not.toContain("cursor-pointer");
    await card.trigger("click");
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("links the invitation to create a first organization", async () => {
    mocks.fetchUserInfo.mockResolvedValue({ name: "alice", orgs: [] });
    await mountPage(OrganizationList);
    expect(link("Create Your First Organization").attributes("href")).toBe(
      "/organizations/new",
    );
    expect(hasButton("Create Your First Organization")).toBe(false);
  });
});

describe("organization page", () => {
  it("links the settings and storage buttons and each member", async () => {
    await mountPage(OrganizationPage);
    expect(link("Edit profile").attributes("href")).toBe(
      "/organizations/acme/settings",
    );
    expect(link("View Details").attributes("href")).toBe(
      "/organizations/acme/storage",
    );
    expect(hasButton("Edit profile")).toBe(false);
    expect(hasButton("View Details")).toBe(false);

    const member = wrapper.get("a[href='/bob']");
    expect(member.text()).toBe("bob");
    expect(member.classes()).toContain("stretched-link");
    const row = member.element.closest(".relative");
    expect(row).not.toBeNull();
    row.click();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("shows neither to someone who is not an admin of it", async () => {
    mocks.fetchUserInfo.mockResolvedValue({
      name: "alice",
      orgs: [{ name: "acme", roleInOrg: "member" }],
    });
    await mountPage(OrganizationPage);
    expect(link("Edit profile")).toBeUndefined();
    expect(hasButton("Edit profile")).toBe(false);
  });
});

describe("organization models page", () => {
  it("links each member to their profile", async () => {
    await mountPage(OrganizationTypePage, { type: "models" });
    const member = wrapper.get("a[href='/bob']");
    expect(member.text()).toBe("bob");
    expect(member.classes()).toContain("stretched-link");
    expect(member.element.closest(".relative")).not.toBeNull();
  });
});
