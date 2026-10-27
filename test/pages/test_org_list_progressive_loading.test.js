import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: null,
  auth: null,
  getProfileInfo: vi.fn(),
  getOrgProfile: vi.fn(),
  listMembers: vi.fn(),
  listAllRepos: vi.fn(),
  getLocalProfileType: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repoAPI: { listAllRepos: (...args) => mocks.listAllRepos(...args) },
  orgAPI: {
    getProfileInfo: (...args) => mocks.getProfileInfo(...args),
    listMembers: (...args) => mocks.listMembers(...args),
  },
  settingsAPI: { getOrgProfile: (...args) => mocks.getOrgProfile(...args) },
  getLocalProfileType: (...args) => mocks.getLocalProfileType(...args),
}));
import Repositories from "@/pages/organizations/[orgname]/[type].vue";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
const profile = {
  name: "acme",
  description: "Open models from Acme",
  created_at: "2025-01-01T00:00:00Z",
  _source: "local",
};
const page = (...names) => ({
  data: names.map((name) => ({ id: `acme/${name}`, private: false })),
  incomplete: [],
});
const failure = (status = 503) =>
  Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
let wrapper, orgRequest, memberRequests, requests;
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  orgRequest = deferred();
  memberRequests = [];
  requests = { model: [], dataset: [], space: [] };
  mocks.auth = reactive({
    isAuthenticated: false,
    username: null,
    user: null,
    token: null,
    fetchUserInfo: vi.fn(),
  });
  mocks.route = reactive({
    params: { orgname: "acme", type: "models" },
    query: {},
    fullPath: "/organizations/acme/models",
  });
  mocks.getLocalProfileType.mockResolvedValue({
    data: { type: "org", _source: "local" },
  });
  mocks.getProfileInfo.mockImplementation(() => orgRequest.promise);
  mocks.getOrgProfile.mockResolvedValue({ data: {} });
  vi.spyOn(axios, "get").mockImplementation(() => orgRequest.promise);
  mocks.listMembers.mockImplementation(() => {
    const request = deferred();
    memberRequests.push(request);
    return request.promise;
  });
  mocks.listAllRepos.mockImplementation((type, query) => {
    const request = { ...deferred(), query };
    requests[type].push(request);
    return request.promise;
  });
});
afterEach(() => wrapper?.unmount());
function mountPage() {
  wrapper = mount(Repositories, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        ElTable: true,
        ElTableColumn: true,
      },
    },
  });
}
async function startWithProfile() {
  mountPage();
  orgRequest.resolve({ data: profile });
  await flushPromises();
}
const navText = (type) =>
  wrapper
    .get(`aside a[href="/organizations/acme/${type}"]`)
    .text()
    .replace(/\s/g, "");
const memberPanel = () => wrapper.get('[aria-label="Organization members"]');
function expectMemberAvatar(username) {
  const member = memberPanel().get(`a[aria-label="${username}"]`);
  expect(member.attributes("href")).toBe(`/${username}`);
  expect(member.attributes("title")).toBe(username);
  expect(member.get("img").attributes("src")).toBe(
    `/api/users/${username}/avatar`,
  );
}

describe("independent organization list loading", () => {
  it("redirects an invalid list type to the organization overview", async () => {
    mocks.route.params.type = "invalid";
    mountPage();
    await flushPromises();
    expect(mocks.router.replace).toHaveBeenCalledWith("/organizations/acme");
    expect(mocks.getProfileInfo).not.toHaveBeenCalled();
    expect(mocks.listAllRepos).not.toHaveBeenCalled();
  });

  it("shows ready models without waiting for the profile, members, or other repository types", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    expect(wrapper.get("aside").text()).toContain(
      "Loading organization profile...",
    );
    expect(memberPanel().get('[role="status"]').text()).toBe(
      "Loading members...",
    );
    expect(memberPanel().text()).not.toContain("No members yet");
    expect(navText("models")).toBe("Models1");
    expect(navText("datasets")).toBe("Datasets");
    expect(navText("spaces")).toBe("Spaces");
    orgRequest.resolve({ data: profile });
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain(profile.description);
  });

  it("keeps the profile and members visible while the current list is pending", async () => {
    await startWithProfile();
    memberRequests[0].resolve({
      data: { members: [{ user: "alice", role: "admin" }] },
    });
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain(profile.description);
    expectMemberAvatar("alice");
    expect(wrapper.get('main [role="status"]').text()).toBe(
      "Loading models...",
    );
    expect(wrapper.get("main").text()).not.toContain("No models");
    expect(wrapper.find("main .profile-count").exists()).toBe(false);
  });

  it("retries failed members independently without reporting an empty membership", async () => {
    await startWithProfile();
    requests.model[0].resolve(page("ready-model"));
    memberRequests[0].reject(failure());
    await flushPromises();
    expect(memberPanel().get('[data-testid="error-title"]').text()).toBe(
      "Service unavailable",
    );
    expect(memberPanel().text()).not.toContain("No members yet");
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    await memberPanel()
      .get('[data-testid="error-action-retry"]')
      .trigger("click");
    expect(mocks.listMembers).toHaveBeenCalledTimes(2);
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    expect(mocks.getProfileInfo).toHaveBeenCalledTimes(1);
    memberRequests[1].resolve({
      data: { members: [{ user: "alice", role: "member" }] },
    });
    await flushPromises();
    expectMemberAvatar("alice");
  });

  it("loads extended profile details independently and retries only those details", async () => {
    const details = deferred();
    mocks.getOrgProfile.mockReturnValueOnce(details.promise);
    await startWithProfile();
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain(profile.description);
    expect(wrapper.get("aside").text()).toContain(
      "Loading organization details...",
    );
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    details.reject(failure());
    await flushPromises();
    expect(wrapper.get('aside [data-testid="error-title"]').text()).toBe(
      "Service unavailable",
    );
    const retry = deferred();
    mocks.getOrgProfile.mockReturnValueOnce(retry.promise);
    await wrapper
      .get('aside [data-testid="error-action-retry"]')
      .trigger("click");
    expect(mocks.getOrgProfile).toHaveBeenCalledTimes(2);
    expect(mocks.getProfileInfo).toHaveBeenCalledTimes(1);
    expect(mocks.listMembers).toHaveBeenCalledTimes(1);
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    retry.resolve({
      data: { bio: "Shared research", website: "https://acme.example/" },
    });
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain("Shared research");
    expect(wrapper.get("aside").text()).toContain(profile.description);
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
  });

  it("keeps an external organization's basic profile when local details are absent", async () => {
    mocks.getOrgProfile.mockRejectedValue(failure(404));
    mocks.getLocalProfileType.mockRejectedValue(failure(404));
    mountPage();
    orgRequest.resolve({ data: { ...profile, _source: "huggingface" } });
    await flushPromises();
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain(profile.description);
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="View as visitor"]').exists()).toBe(
      false,
    );
  });

  it("isolates a failed type and retries it without discarding other counts", async () => {
    await startWithProfile();
    requests.model[0].resolve(page("ready-model"));
    requests.dataset[0].reject(failure());
    requests.space[0].resolve(page("ready-space"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    expect(navText("models")).toBe("Models1");
    expect(navText("datasets")).toBe("Datasets");
    expect(navText("spaces")).toBe("Spaces1");
    mocks.route.params.type = "datasets";
    await flushPromises();
    expect(wrapper.get('main [data-testid="error-title"]').text()).toBe(
      "Service unavailable",
    );
    await wrapper
      .get('main [data-testid="error-action-retry"]')
      .trigger("click");
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(4);
    requests.dataset[1].resolve(page("recovered-dataset"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("acme/recovered-dataset");
    expect(navText("models")).toBe("Models1");
  });

  it.each(["resolve", "reject"])(
    "requests only the sorted type and ignores a stale %s",
    async (outcome) => {
      await startWithProfile();
      for (const type of ["model", "dataset", "space"])
        requests[type][0].resolve(page(`initial-${type}`));
      await flushPromises();
      const sort = wrapper.get('select[aria-label="Sort models"]');
      await sort.setValue("likes");
      await sort.setValue("downloads");
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(5);
      expect(requests.model[2].query).toEqual({
        author: "acme",
        sort: "downloads",
      });
      expect(requests.dataset).toHaveLength(1);
      expect(requests.space).toHaveLength(1);
      requests.model[2].resolve(page("newest-model"));
      await flushPromises();
      requests.model[1][outcome](
        outcome === "resolve" ? page("stale-model") : failure(),
      );
      await flushPromises();
      expect(wrapper.get("main").text()).toContain("acme/newest-model");
      expect(wrapper.get("main").text()).not.toContain("acme/stale-model");
      expect(wrapper.find('main [data-testid="error-state"]').exists()).toBe(
        false,
      );
    },
  );

  it.each(["local organization", "failed identity"])(
    "keeps a profile 404 local and retryable for a %s",
    async (identity) => {
      if (identity === "failed identity")
        mocks.getLocalProfileType.mockRejectedValue(failure());
      mountPage();
      await flushPromises();
      requests.model[0].resolve(page("ready-model"));
      orgRequest.reject(failure(404));
      await flushPromises();
      expect(wrapper.get("main").text()).toContain("acme/ready-model");
      const retry = deferred();
      mocks.getProfileInfo.mockReturnValueOnce(retry.promise);
      await wrapper
        .get('aside [data-kind="not-found"] [data-testid="error-action-retry"]')
        .trigger("click");
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
      expect(mocks.getLocalProfileType).toHaveBeenCalledTimes(1);
      retry.resolve({ data: profile });
      await flushPromises();
      expect(wrapper.get("aside").text()).toContain(profile.description);
    },
  );

  it("requires both profile and local identity misses before showing the organization 404", async () => {
    const identity = deferred();
    mocks.getLocalProfileType.mockReturnValue(identity.promise);
    mountPage();
    await flushPromises();
    orgRequest.reject(failure(404));
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("acme/ready-model");
    identity.reject(failure(404));
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Organization Not Found");
    expect(wrapper.get('a[href="/"]').text()).toBe("Go to Homepage");
    expect(mocks.listMembers).toHaveBeenCalledTimes(1);
  });

  it("ignores profile, member and repository errors after unmount", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    wrapper.unmount();
    orgRequest.reject(failure());
    memberRequests[0].reject(failure());
    for (const type of ["model", "dataset", "space"])
      requests[type][0].reject(failure());
    await flushPromises();
    expect(console.error).not.toHaveBeenCalled();
  });
});
