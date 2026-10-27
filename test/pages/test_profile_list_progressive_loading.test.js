import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: null,
  listAllRepos: vi.fn(),
  getLocalProfileType: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: false, username: null }),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: { listAllRepos: (...args) => mocks.listAllRepos(...args) },
  getLocalProfileType: (...args) => mocks.getLocalProfileType(...args),
}));
import Repositories from "@/pages/[username]/[type].vue";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Some assertions deliberately keep the real caller from reaching a request.
  promise.catch(() => {});
  return { promise, resolve, reject };
}
const profile = {
  username: "bob",
  full_name: "Bob Builder",
  bio: "Open models.",
  _source: "local",
};
const page = (...names) => ({
  data: names.map((name) => ({ id: `bob/${name}`, private: false })),
  incomplete: [],
});
const failure = (status = 503) =>
  Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
let wrapper, profileRequest, orgRequest, requests;
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  profileRequest = deferred();
  orgRequest = deferred();
  mocks.getLocalProfileType.mockImplementation(() => orgRequest.promise);
  requests = { model: [], dataset: [], space: [] };
  mocks.route = reactive({
    params: { username: "bob", type: "models" },
    query: {},
    fullPath: "/bob/models",
  });
  vi.spyOn(axios, "get").mockImplementation(() => profileRequest.promise);
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
  return wrapper;
}
async function startWithProfile() {
  mountPage();
  orgRequest.resolve({ data: { type: "user", _source: "local" } });
  profileRequest.resolve({ data: profile });
  await flushPromises();
}
const navText = (type) =>
  wrapper.get(`aside a[href="/bob/${type}"]`).text().replace(/\s/g, "");

describe("independent user repository list loading", () => {
  it("shows the profile and ready models while the other repository types remain pending", async () => {
    await startWithProfile();
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();

    expect(wrapper.get("aside").text()).toContain(profile.bio);
    expect(wrapper.get("main").text()).toContain("bob/ready-model");
    expect(navText("models")).toBe("Models1");
    expect(navText("datasets")).toBe("Datasets");
    expect(navText("spaces")).toBe("Spaces");

    mocks.route.params.type = "datasets";
    await flushPromises();
    expect(wrapper.get("main [role=status]").text()).toBe(
      "Loading datasets...",
    );
    expect(wrapper.get("main").text()).not.toContain("No datasets found");
    expect(wrapper.find("main .profile-count").exists()).toBe(false);
    requests.dataset[0].resolve(page("ready-dataset"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("bob/ready-dataset");
  });

  it("starts and shows repositories while both profile and organization lookups are pending", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("bob/ready-model");
    expect(wrapper.get("aside [role=status]").text()).toBe(
      "Loading user profile...",
    );
    profileRequest.resolve({ data: profile });
    await flushPromises();
    expect(wrapper.get("aside").text()).toContain(profile.bio);
    expect(wrapper.get("aside").text()).not.toContain(
      "Loading user profile...",
    );
    orgRequest.reject(failure(404));
    await flushPromises();
  });

  it("isolates a failed type and retries only that type without discarding other counts", async () => {
    await startWithProfile();
    requests.model[0].resolve(page("ready-model"));
    requests.dataset[0].reject(failure());
    requests.space[0].resolve(page("ready-space"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("bob/ready-model");
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(navText("models")).toBe("Models1");
    expect(navText("datasets")).toBe("Datasets");
    expect(navText("spaces")).toBe("Spaces1");

    mocks.route.params.type = "datasets";
    await flushPromises();
    expect(wrapper.get('[data-testid="error-title"]').text()).toBe(
      "Service unavailable",
    );
    expect(wrapper.get("main").text()).not.toContain("No datasets found");
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(4);
    expect(requests.model).toHaveLength(1);
    expect(requests.space).toHaveLength(1);
    requests.dataset[1].resolve(page("recovered-dataset"));
    await flushPromises();
    expect(wrapper.get("main").text()).toContain("bob/recovered-dataset");
    expect(navText("models")).toBe("Models1");
    expect(navText("datasets")).toBe("Datasets1");
  });

  it("keeps an identity failure and its retry in the profile card while repositories are ready", async () => {
    mountPage();
    await flushPromises();
    orgRequest.reject(failure());
    requests.model[0].resolve(page("ready-model"));
    await flushPromises();
    expect(wrapper.get("aside [data-testid=error-title]").text()).toBe(
      "Service unavailable",
    );
    expect(wrapper.get("main").text()).toContain("bob/ready-model");
    expect(wrapper.get("aside [role=status]").text()).toBe(
      "Loading user profile...",
    );

    const retry = deferred();
    mocks.getLocalProfileType.mockReturnValueOnce(retry.promise);
    await wrapper
      .get("aside [data-testid=error-action-retry]")
      .trigger("click");
    expect(mocks.getLocalProfileType).toHaveBeenCalledTimes(2);
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    expect(axios.get).toHaveBeenCalledTimes(1);
    retry.resolve({ data: { type: "user", _source: "local" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(wrapper.get("main").text()).toContain("bob/ready-model");
    expect(wrapper.get("aside [role=status]").text()).toBe(
      "Loading user profile...",
    );
    profileRequest.resolve({ data: profile });
    await flushPromises();
  });

  it.each(["resolve", "reject"])(
    "requests only the sorted type and ignores its stale %s",
    async (outcome) => {
      await startWithProfile();
      for (const type of ["model", "dataset", "space"])
        requests[type][0].resolve(page(`initial-${type}`));
      await flushPromises();
      const sort = wrapper.get('select[aria-label="Sort models"]');
      await sort.setValue("likes");
      await sort.setValue("downloads");
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(5);
      expect(requests.dataset).toHaveLength(1);
      expect(requests.space).toHaveLength(1);
      expect(requests.model[2].query).toEqual({
        author: "bob",
        sort: "downloads",
      });
      requests.model[2].resolve(page("newest-model"));
      await flushPromises();
      requests.model[1][outcome](
        outcome === "resolve" ? page("stale-model") : failure(),
      );
      await flushPromises();
      expect(wrapper.get("main").text()).toContain("bob/newest-model");
      expect(wrapper.get("main").text()).not.toContain("bob/stale-model");
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    },
  );

  it("waits for organization identification before displaying a profile 404", async () => {
    mountPage();
    await flushPromises();
    profileRequest.reject(failure(404));
    await flushPromises();
    expect(wrapper.text()).not.toContain("User Not Found");
    expect(wrapper.get("aside [role=status]").text()).toBe(
      "Loading user profile...",
    );
    orgRequest.resolve({ data: { type: "org", _source: "local" } });
    await flushPromises();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/organizations/bob/models",
    );
    expect(wrapper.text()).not.toContain("User Not Found");
  });

  it("keeps a confirmed 404 even when repositories finish later", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    profileRequest.reject(failure(404));
    orgRequest.reject(failure(404));
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("User Not Found");
    for (const type of ["model", "dataset", "space"])
      requests[type][0].resolve(page(`late-${type}`));
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("User Not Found");
    expect(wrapper.find(".profile-repo-card").exists()).toBe(false);
  });

  it.each(["local user", "failed identity", "cancelled identity"])(
    "keeps a profile 404 local and retryable for a %s",
    async (identity) => {
      mountPage();
      await flushPromises();
      requests.model[0].resolve(page("ready-model"));
      profileRequest.reject(failure(404));
      if (identity === "local user")
        orgRequest.resolve({ data: { type: "user", _source: "local" } });
      else
        orgRequest.reject(
          identity === "failed identity"
            ? failure()
            : new DOMException("Cancelled", "AbortError"),
        );
      await flushPromises();

      expect(wrapper.get("main").text()).toContain("bob/ready-model");
      expect(wrapper.get("h1").text()).toBe("All Models");
      const profileError = wrapper.get(
        'aside [data-testid="error-state"][data-kind="not-found"]',
      );
      const retry = deferred();
      vi.mocked(axios.get).mockReturnValueOnce(retry.promise);
      await profileError
        .get('[data-testid="error-action-retry"]')
        .trigger("click");
      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(mocks.getLocalProfileType).toHaveBeenCalledTimes(1);
      expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
      expect(wrapper.get("main").text()).toContain("bob/ready-model");
      retry.resolve({ data: profile });
      await flushPromises();
      expect(wrapper.get("aside").text()).toContain(profile.bio);
      expect(wrapper.find('aside [data-kind="not-found"]').exists()).toBe(
        false,
      );
      if (identity === "failed identity") {
        expect(wrapper.get('aside [data-testid="error-title"]').text()).toBe(
          "Service unavailable",
        );
        const identityRetry = deferred();
        mocks.getLocalProfileType.mockReturnValueOnce(identityRetry.promise);
        await wrapper
          .get('aside [data-testid="error-action-retry"]')
          .trigger("click");
        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
        identityRetry.resolve({ data: { type: "user", _source: "local" } });
        await flushPromises();
        expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(
          false,
        );
      }
    },
  );

  it("does not redirect or publish late request errors after the page is unmounted", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(3);
    wrapper.unmount();
    orgRequest.resolve({ data: { type: "org", _source: "local" } });
    profileRequest.reject(failure());
    for (const type of ["model", "dataset", "space"])
      requests[type][0].reject(failure());
    await flushPromises();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
