import { h, reactive } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: null,
  auth: null,
  router: { push: vi.fn(), replace: vi.fn() },
  identity: vi.fn(),
  info: vi.fn(),
  profile: vi.fn(),
  members: vi.fn(),
  readme: vi.fn(),
  quota: vi.fn(),
  repos: vi.fn(),
  visibility: vi.fn(),
  follow: vi.fn(),
  followAccount: vi.fn(),
  unfollowAccount: vi.fn(),
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  getLocalProfileType: (...args) => mocks.identity(...args),
  orgAPI: {
    getProfileInfo: (...args) => mocks.info(...args),
    listMembers: (...args) => mocks.members(...args),
    getProfileReadme: (...args) => mocks.readme(...args),
    getPublicQuota: (...args) => mocks.quota(...args),
  },
  settingsAPI: { getOrgProfile: (...args) => mocks.profile(...args) },
  repoAPI: {
    listAllRepos: (...args) => mocks.repos(...args),
    getInfo: (...args) => mocks.visibility(...args),
  },
  socialAPI: {
    getFollowState: (...args) => mocks.follow(...args),
    follow: (...args) => mocks.followAccount(...args),
    unfollow: (...args) => mocks.unfollowAccount(...args),
  },
}));
import OrgProfile from "@/pages/organizations/[orgname]/index.vue";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const failure = (status = 503) =>
  Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const page = (...names) => ({
  data: names.map((name) => ({
    id: `acme/${name}`,
    private: name.startsWith("private"),
    tags: [],
  })),
  incomplete: [],
});
const quota = {
  public_used_bytes: 1000,
  public_quota_bytes: null,
  private_used_bytes: 9000,
  private_quota_bytes: null,
  total_used_bytes: 10000,
  can_see_private: true,
};
let wrapper, requests;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.route = reactive({
    params: { orgname: "acme" },
    query: {},
    fullPath: "/organizations/acme",
  });
  mocks.router.replace.mockImplementation(async ({ query }) => {
    mocks.route.query = query;
  });
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "alice",
    user: { username: "alice" },
    token: null,
    fetchUserInfo: vi.fn().mockResolvedValue({
      name: "alice",
      orgs: [{ name: "acme", roleInOrg: "admin" }],
    }),
  });
  mocks.identity.mockResolvedValue({ data: { type: "org", _source: "local" } });
  mocks.info.mockResolvedValue({
    data: { name: "acme", description: "Base organization", _source: "local" },
  });
  mocks.profile.mockResolvedValue({
    data: {
      name: "acme",
      bio: "Organization biography",
      created_at: "2025-01-01T00:00:00Z",
    },
  });
  mocks.members.mockResolvedValue({
    data: { members: [{ user: "alice", role: "admin" }] },
  });
  mocks.readme.mockResolvedValue({ data: "Independent organization README" });
  mocks.quota.mockResolvedValue({ data: quota });
  mocks.visibility.mockResolvedValue({ data: { private: false } });
  mocks.follow.mockResolvedValue({
    data: {
      username: "acme",
      is_org: true,
      following: false,
      can_follow: true,
      followers_count: 3,
      following_count: 2,
    },
  });
  mocks.followAccount.mockResolvedValue({
    data: {
      username: "acme",
      is_org: true,
      following: true,
      can_follow: true,
      followers_count: 4,
      following_count: 2,
    },
  });
  mocks.unfollowAccount.mockResolvedValue({
    data: {
      username: "acme",
      is_org: true,
      following: false,
      can_follow: true,
      followers_count: 3,
      following_count: 2,
    },
  });
  requests = { model: [], dataset: [], space: [] };
  mocks.repos.mockImplementation((type) => {
    const d = deferred();
    requests[type].push(d);
    return d.promise;
  });
});
afterEach(() => wrapper?.unmount());
function mountPage() {
  wrapper = mount(OrgProfile, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        ElTable: true,
        ElTableColumn: true,
        ElScrollbar: true,
        MarkdownViewer: {
          props: ["content"],
          setup: (props) => () => h("div", props.content),
        },
        SocialLinks: true,
      },
    },
  });
  return wrapper;
}
function region(name) {
  return wrapper.get(`[aria-label="${name}"]`);
}
function repoSection(name) {
  return wrapper
    .findAll("section")
    .find((el) => el.find("h2").exists() && el.get("h2").text() === name);
}
function expectMemberAvatar(username) {
  const member = region("Organization members").get(
    `a[aria-label="${username}"]`,
  );
  expect(member.attributes("href")).toBe(`/${username}`);
  expect(member.attributes("title")).toBe(username);
  expect(member.get("img").attributes("src")).toBe(
    `/api/users/${username}/avatar`,
  );
}

describe("organization profile independent regions", () => {
  it("loads every region before the organization lookup resolves", async () => {
    const lookup = deferred();
    mocks.info.mockReturnValue(lookup.promise);
    mountPage();
    await flushPromises();
    expect(wrapper.find(".profile-card").exists()).toBe(true);
    expect(wrapper.find(".profile-avatar").exists()).toBe(true);
    for (const type of ["model", "dataset", "space"])
      expect(requests[type]).toHaveLength(1);
    for (const call of [
      mocks.profile,
      mocks.members,
      mocks.readme,
      mocks.quota,
      mocks.follow,
    ])
      expect(call).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("Independent organization README");
    expect(wrapper.text()).toContain("Organization biography");
    expect(wrapper.text()).toContain("Loading organization...");
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(repoSection("Models").text()).toContain("ready-model");
    expect(repoSection("Datasets").text()).toContain("Loading datasets...");
  });

  it("does not make content wait for identity or membership", async () => {
    const identity = deferred(),
      membership = deferred();
    mocks.identity.mockReturnValue(identity.promise);
    mocks.auth.fetchUserInfo.mockReturnValue(membership.promise);
    mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Organization biography");
    expect(region("Profile README").text()).toContain(
      "Independent organization README",
    );
    expect(region("Storage usage").text()).toContain("1 KB");
    expectMemberAvatar("alice");
    expect(
      wrapper.find('a[href="/organizations/acme/settings"]').exists(),
    ).toBe(false);
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(repoSection("Models").text()).toContain("ready-model");
  });

  it("keeps successful repositories while one fails and only retries that list", async () => {
    mountPage();
    await flushPromises();
    requests.model[0].resolve(page("kept-model"));
    requests.space[0].resolve(page("kept-space"));
    requests.dataset[0].reject(failure());
    await flushPromises();
    expect(repoSection("Models").text()).toContain("kept-model");
    expect(repoSection("Spaces").text()).toContain("kept-space");
    expect(repoSection("Datasets").text()).not.toContain("No datasets yet");
    await repoSection("Datasets")
      .get('[data-testid="error-action-retry"]')
      .trigger("click");
    expect(requests.dataset).toHaveLength(2);
    expect(requests.model).toHaveLength(1);
    expect(requests.space).toHaveLength(1);
    requests.dataset[1].resolve(page("recovered-dataset"));
    await flushPromises();
    expect(repoSection("Datasets").text()).toContain("recovered-dataset");
  });

  it.each(["members", "readme", "quota", "profile"])(
    "gives %s its own error and retry without disturbing other regions",
    async (key) => {
      mocks[key].mockRejectedValueOnce(failure());
      mountPage();
      await flushPromises();
      const panel =
        key === "members"
          ? region("Organization members")
          : key === "readme"
            ? region("Profile README")
            : key === "quota"
              ? region("Storage usage")
              : wrapper.get(".profile-card");
      expect(panel.text()).toContain("Service unavailable");
      expect(wrapper.text()).not.toContain("No members yet");
      requests.model[0].resolve(page("kept-model"));
      await flushPromises();
      await panel.get('[data-testid="error-action-retry"]').trigger("click");
      await flushPromises();
      expect(mocks[key]).toHaveBeenCalledTimes(2);
      expect(mocks.info).toHaveBeenCalledOnce();
      expect(requests.model).toHaveLength(1);
      expect(repoSection("Models").text()).toContain("kept-model");
    },
  );

  it("keeps content and local retry when lookup returns 404 for a confirmed local organization", async () => {
    mocks.info.mockRejectedValueOnce(failure(404));
    mountPage();
    await flushPromises();
    expect(wrapper.find(".profile-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("Independent organization README");
    await wrapper
      .get('.profile-card [data-testid="error-action-retry"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.readme).toHaveBeenCalledOnce();
  });

  it("shows a single Organization Settings link and previews public content without waiting for Spaces", async () => {
    mountPage();
    await flushPromises();
    const edit = wrapper.get('a[href="/organizations/acme/settings"]');
    expect(edit.text()).toBe("Organization Settings");
    requests.model[0].resolve(page("public-model", "private-model"));
    await flushPromises();
    expect(repoSection("Models").text()).toContain("private-model");
    await wrapper.get('button[aria-label="View as visitor"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.find('a[href="/organizations/acme/settings"]').exists(),
    ).toBe(false);
    expect(repoSection("Models").text()).not.toContain("private-model");
    expect(region("Storage usage").text()).not.toContain("Private");
    expect(region("Storage usage").text()).not.toContain("10 KB");
    expect(region("Profile README").text()).toContain(
      "Independent organization README",
    );
    expectMemberAvatar("alice");
    expect(
      wrapper
        .get('aside a[href="/organizations/acme/models?view=visitor"]')
        .text(),
    ).toContain("1");
    expect(repoSection("Spaces").text()).toContain("Loading spaces...");
  });

  it("does not expose a private README in visitor mode", async () => {
    mocks.route.query = { view: "visitor" };
    mocks.visibility.mockResolvedValue({ data: { private: true } });
    mountPage();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Independent organization README");
  });

  it("keeps real follow actions and counts while visitor mode only filters organization content", async () => {
    mocks.route.query = { view: "visitor" };
    mocks.follow.mockResolvedValue({
      data: {
        username: "acme",
        is_org: true,
        following: true,
        can_follow: true,
        followers_count: 4,
        following_count: 2,
      },
    });
    mountPage();
    await flushPromises();
    requests.model[0].resolve(page("public-model", "private-model"));
    await flushPromises();
    const controls = region("Follow information");
    const expectFollowerCount = (count) => {
      expect(
        controls
          .findAll(".follow-counts button")
          .map((button) => button.text()),
      ).toEqual([`${count} followers`]);
      expect(controls.get(".follow-counts").text()).not.toContain("following");
    };
    const expectPublicContent = () => {
      expect(repoSection("Models").text()).toContain("public-model");
      expect(repoSection("Models").text()).not.toContain("private-model");
      expect(region("Storage usage").text()).toContain("1 KB");
      expect(region("Storage usage").text()).not.toContain("Private");
      expect(region("Storage usage").text()).not.toContain("10 KB");
    };
    expect(controls.get(".follow-button").text()).toBe("Following");
    expect(
      controls.get(".follow-button").attributes("disabled"),
    ).toBeUndefined();
    expectFollowerCount(4);
    expectPublicContent();

    await controls.get(".follow-button").trigger("click");
    await flushPromises();
    expect(mocks.unfollowAccount).toHaveBeenCalledExactlyOnceWith("acme");
    expect(mocks.followAccount).not.toHaveBeenCalled();
    expect(controls.get(".follow-button").text()).toBe("Follow");
    expectFollowerCount(3);
    expectPublicContent();

    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(controls.get(".follow-button").text()).toBe("Follow");
    expectFollowerCount(3);
    expect(repoSection("Models").text()).toContain("private-model");
    expect(region("Storage usage").text()).toContain("10 KB");
    await wrapper.get('button[aria-label="View as visitor"]').trigger("click");
    await flushPromises();
    expect(controls.get(".follow-button").text()).toBe("Follow");
    expectFollowerCount(3);
    expectPublicContent();

    await controls.get(".follow-button").trigger("click");
    await flushPromises();
    expect(mocks.followAccount).toHaveBeenCalledExactlyOnceWith("acme");
    expect(controls.get(".follow-button").text()).toBe("Following");
    expectFollowerCount(4);
    expectPublicContent();
    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(controls.get(".follow-button").text()).toBe("Following");
    expectFollowerCount(4);
    await wrapper.get('button[aria-label="View as visitor"]').trigger("click");
    await flushPromises();
    expect(controls.get(".follow-button").text()).toBe("Following");
    expectFollowerCount(4);
    expect(mocks.follow).toHaveBeenCalledOnce();
    expectPublicContent();
  });

  it("keeps old sort results from replacing the newest result", async () => {
    mountPage();
    await flushPromises();
    await repoSection("Models").get("select").setValue("likes");
    requests.model[1].resolve(page("new-sort"));
    await flushPromises();
    requests.model[0].resolve(page("old-sort"));
    await flushPromises();
    expect(repoSection("Models").text()).toContain("new-sort");
    expect(repoSection("Models").text()).not.toContain("old-sort");
  });
});
