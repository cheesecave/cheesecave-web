import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  auth: null,
  route: null,
  listAllRepos: vi.fn(),
  getProfileInfo: vi.fn(),
  getOrgProfile: vi.fn(),
  getLocalProfileType: vi.fn(),
  listMembers: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", async (original) => {
  const api = await original();
  return {
    ...api,
    getLocalProfileType: (...args) => mocks.getLocalProfileType(...args),
    repoAPI: {
      ...api.repoAPI,
      listAllRepos: (...args) => mocks.listAllRepos(...args),
    },
    orgAPI: {
      ...api.orgAPI,
      getProfileInfo: (...args) => mocks.getProfileInfo(...args),
      listMembers: (...args) => mocks.listMembers(...args),
    },
    settingsAPI: {
      ...api.settingsAPI,
      getOrgProfile: (...args) => mocks.getOrgProfile(...args),
    },
  };
});
import OrganizationRepositories from "@/pages/organizations/[orgname]/[type].vue";

const organization = {
  name: "acme",
  description: "Acme Open Research",
  created_at: "2025-01-01T00:00:00Z",
  repo_count: { model: 50, dataset: 50, space: 50, total: 150 },
  _source: "local",
};
const profile = {
  name: "acme",
  description: organization.description,
  bio: "Building shared models and datasets.",
  website: "https://acme.example/",
  created_at: organization.created_at,
  member_count: 2,
};
const members = [
  { user: "alice", role: "admin" },
  { user: "bob", role: "member" },
];
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "alice",
    user: { id: 1, username: "alice", is_active: true, is_org: false },
    token: null,
    fetchUserInfo: vi.fn().mockResolvedValue({
      name: "alice",
      orgs: [{ name: "acme", roleInOrg: "admin" }],
    }),
  });
  mocks.getProfileInfo.mockResolvedValue({ data: organization });
  mocks.getOrgProfile.mockResolvedValue({ data: profile });
  mocks.getLocalProfileType.mockResolvedValue({
    data: { type: "org", _source: "local" },
  });
  mocks.listMembers.mockResolvedValue({ data: { members } });
  mocks.listAllRepos.mockImplementation(async (type) => ({
    data: [
      {
        id: `acme/portrait-${type}`,
        author: "acme",
        tags: ["drawing"],
        private: false,
      },
      {
        id: `acme/landscape-${type}`,
        author: "guest",
        tags: ["nature"],
        private: true,
      },
    ],
    incomplete: [],
  }));
  mocks.router.replace.mockImplementation(async ({ query }) => {
    if (query) mocks.route.query = query;
  });
  server.use(http.get("*/org/:name", () => jsonResponse(organization)));
});
afterEach(() => wrapper?.unmount());

async function mountPage(type = "models", query = {}) {
  mocks.route = reactive({
    params: { orgname: "acme", type },
    path: `/organizations/acme/${type}`,
    fullPath: `/organizations/acme/${type}`,
    query,
    hash: "",
  });
  wrapper = mount(OrganizationRepositories, {
    global: {
      stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub },
    },
  });
  await vi.waitFor(() =>
    expect(wrapper.findAll("main .card h3 a").length).toBeGreaterThan(0),
  );
  await flushPromises();
}

describe("organization repository list profile", () => {
  it("shows organization details and real organization and member avatars", async () => {
    await mountPage();
    const sidebar = wrapper.get("aside");
    expect(sidebar.text()).toContain(organization.description);
    expect(sidebar.text()).toContain(profile.bio);
    expect(sidebar.get('a[title="Website"]').attributes("href")).toBe(
      profile.website,
    );
    const avatars = sidebar
      .findAll(".entity-avatar img")
      .map((img) => img.attributes("src"));
    expect(avatars).toEqual(
      expect.arrayContaining([
        "/api/organizations/acme/avatar",
        "/api/users/alice/avatar",
        "/api/users/bob/avatar",
      ]),
    );
    expect(sidebar.get('a[href="/alice"]').text()).toBe("alice");
    expect(sidebar.get('a[href="/bob"]').text()).toBe("bob");
  });

  it.each(["models", "datasets", "spaces"])(
    "uses real navigation links and marks only the current %s page",
    async (type) => {
      await mountPage(type);
      const sidebar = wrapper.get("aside");
      const current = sidebar.get('a[aria-current="page"]');
      expect(current.attributes("href")).toBe(`/organizations/acme/${type}`);
      expect(sidebar.findAll('a[aria-current="page"]')).toHaveLength(1);
      for (const destination of ["", "/models", "/datasets", "/spaces"]) {
        const links = sidebar.findAll(
          `a[href="/organizations/acme${destination}"]`,
        );
        expect(links).toHaveLength(1);
        expect(links[0].find("button").exists()).toBe(false);
      }
      expect(wrapper.findAll("h1")).toHaveLength(1);
    },
  );

  it.each(["models", "datasets", "spaces"])(
    "searches %s locally and requests sorting only for that type",
    async (type) => {
      await mountPage(type);
      const apiType = type.slice(0, -1);
      const names = () =>
        wrapper.findAll("main .card h3 a").map((link) => link.text());
      const initialRequests = mocks.listAllRepos.mock.calls.length;
      const search = wrapper.get(`input[aria-label="Search ${type}"]`);
      await search.setValue("PORTRAIT");
      expect(names()).toEqual([`acme/portrait-${apiType}`]);
      await search.setValue("guest");
      expect(names()).toEqual([`acme/landscape-${apiType}`]);
      await search.setValue("DRAWING");
      expect(names()).toEqual([`acme/portrait-${apiType}`]);
      await search.setValue("no-match");
      expect(names()).toEqual([]);
      await search.setValue("");
      expect(names()).toHaveLength(2);
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(initialRequests);

      await wrapper.get(`select[aria-label="Sort ${type}"]`).setValue("likes");
      await flushPromises();
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(initialRequests + 1);
      expect(mocks.listAllRepos).toHaveBeenLastCalledWith(apiType, {
        author: "acme",
        sort: "likes",
      });
      expect(
        window.sessionStorage.getItem(
          `kohakuhub:repo-sort-preference:org:${apiType}`,
        ),
      ).toBe("likes");
    },
  );

  it.each(["admin", "super-admin"])(
    "offers %s one Organization Settings link to the organization settings",
    async (role) => {
      mocks.auth.fetchUserInfo.mockResolvedValue({
        name: "alice",
        orgs: [{ name: "acme", roleInOrg: role }],
      });
      await mountPage();
      const edits = wrapper
        .findAll("aside a")
        .filter((link) => link.text() === "Organization Settings");
      expect(edits).toHaveLength(1);
      expect(edits[0].attributes("href")).toBe("/organizations/acme/settings");
      expect(edits[0].find("button").exists()).toBe(false);
      expect(
        wrapper.find('button[aria-label="View as visitor"]').exists(),
      ).toBe(true);
    },
  );

  it("lets an ordinary member preview public content without an Organization Settings action", async () => {
    mocks.auth.fetchUserInfo.mockResolvedValue({
      name: "alice",
      orgs: [{ name: "acme", roleInOrg: "member" }],
    });
    await mountPage();
    expect(
      wrapper.find('a[href="/organizations/acme/settings"]').exists(),
    ).toBe(false);
    expect(wrapper.find('button[aria-label="View as visitor"]').exists()).toBe(
      true,
    );
  });

  it.each(["non-member", "anonymous"])(
    "keeps members publicly visible without member actions for an %s viewer",
    async (identity) => {
      mocks.auth.fetchUserInfo.mockResolvedValue({ name: "alice", orgs: [] });
      if (identity === "anonymous") {
        mocks.auth.isAuthenticated = false;
        mocks.auth.username = null;
        mocks.auth.user = null;
      }
      await mountPage();
      expect(
        wrapper.find('a[href="/organizations/acme/settings"]').exists(),
      ).toBe(false);
      expect(
        wrapper.find('button[aria-label="View as visitor"]').exists(),
      ).toBe(false);
      expect(wrapper.get('aside a[href="/alice"]').text()).toBe("alice");
      expect(wrapper.get('aside a[href="/bob"]').text()).toBe("bob");
    },
  );

  it.each(["models", "datasets", "spaces"])(
    "keeps %s visitor content, counts and all organization links public",
    async (type) => {
      await mountPage(type, { view: "visitor" });
      const apiType = type.slice(0, -1);
      expect(wrapper.text()).toContain(`acme/portrait-${apiType}`);
      expect(wrapper.text()).not.toContain(`acme/landscape-${apiType}`);
      expect(wrapper.get("main .profile-count").text()).toBe("1");
      expect(
        wrapper.find('a[href="/organizations/acme/settings"]').exists(),
      ).toBe(false);
      expect(
        wrapper
          .get('button[aria-label="Exit visitor view"]')
          .attributes("aria-pressed"),
      ).toBe("true");

      const sidebar = wrapper.get("aside");
      expect(
        sidebar.get('a[href="/organizations/acme?view=visitor"]').text(),
      ).toBe("Overview");
      for (const destination of ["models", "datasets", "spaces"]) {
        const link = sidebar.get(
          `a[href="/organizations/acme/${destination}?view=visitor"]`,
        );
        expect(link.text().replace(/\s/g, "")).toBe(
          `${destination[0].toUpperCase()}${destination.slice(1)}1`,
        );
      }
      expect(sidebar.get('a[href="/alice"]').text()).toBe("alice");
      expect(sidebar.get('a[href="/bob"]').text()).toBe("bob");
      await wrapper
        .get(`input[aria-label="Search ${type}"]`)
        .setValue("landscape");
      expect(wrapper.findAll("main .card h3 a")).toHaveLength(0);
    },
  );

  it("switches visitor mode off and on without signing out or requesting repositories again", async () => {
    await mountPage("models", { from: "saved" });
    const initialRequests = mocks.listAllRepos.mock.calls.length;
    expect(wrapper.text()).toContain("acme/landscape-model");
    expect(wrapper.get("main .profile-count").text()).toBe("2");
    await wrapper.get('button[aria-label="View as visitor"]').trigger("click");
    await flushPromises();
    expect(mocks.route.query).toEqual({ from: "saved", view: "visitor" });
    expect(wrapper.text()).not.toContain("acme/landscape-model");
    expect(
      wrapper.find('a[href="/organizations/acme/settings"]').exists(),
    ).toBe(false);

    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.route.query).toEqual({ from: "saved" });
    expect(wrapper.text()).toContain("acme/landscape-model");
    expect(wrapper.get("main .profile-count").text()).toBe("2");
    expect(wrapper.get('a[href="/organizations/acme/settings"]').text()).toBe(
      "Organization Settings",
    );
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(initialRequests);
    expect(mocks.auth.isAuthenticated).toBe(true);
    expect(mocks.auth.username).toBe("alice");
  });
});
