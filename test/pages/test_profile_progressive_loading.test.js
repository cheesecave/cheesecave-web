// A slow repository list must not hide an already available profile or another list.
// Real deferred promises keep the requests pending until each test releases it.
import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  listAllRepos: vi.fn(),
  getFollowState: vi.fn(),
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
  orgAPI: {},
  settingsAPI: {},
  socialAPI: {
    getFollowState: (...args) => mocks.getFollowState(...args),
  },
}));
import UserProfile from "@/pages/[username]/index.vue";
import FollowControls from "@/components/profile/FollowControls.vue";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const profile = {
  username: "bob",
  full_name: "Bob Builder",
  bio: "I build open models.",
  created_at: "2025-01-01T00:00:00Z",
  _source: "local",
};
const page = (...names) => ({
  data: names.map((name) => ({
    id: `bob/${name}`,
    private: false,
    tags: [],
    downloads: 0,
    likes: 0,
    lastModified: "2026-01-01T00:00:00Z",
  })),
  incomplete: [],
});
const httpFailure = () =>
  Object.assign(new Error("The dataset service failed"), {
    isAxiosError: true,
    response: { status: 503, headers: {}, data: {} },
  });

let wrapper;
let profileRequest;
let identityResponse;
let requests;
let readmeRequested;
let quotaRequested;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  profileRequest = deferred();
  identityResponse = { type: "user", _source: "local" };
  requests = { model: [], dataset: [], space: [] };
  readmeRequested = vi.fn();
  quotaRequested = vi.fn();
  mocks.getFollowState.mockResolvedValue({
    data: {
      username: "bob",
      is_org: false,
      following: false,
      can_follow: false,
      followers_count: 0,
      following_count: 0,
    },
  });
  mocks.route = reactive({
    params: { username: "bob" },
    query: {},
    fullPath: "/bob",
  });
  mocks.listAllRepos.mockImplementation((type, query) => {
    const request = { ...deferred(), query };
    requests[type].push(request);
    return request.promise;
  });
  server.use(
    http.get("*/api/users/:name/type", async () => {
      const data = await identityResponse;
      return data
        ? jsonResponse(data)
        : new HttpResponse(null, { status: 404 });
    }),
    http.get("*/org/:name", () => new HttpResponse(null, { status: 404 })),
    http.get("*/api/users/:name/profile", async () =>
      jsonResponse(await profileRequest.promise),
    ),
    http.get("*/api/quota/:name/public", () => {
      quotaRequested();
      return jsonResponse(null);
    }),
    http.get("*/spaces/:namespace/:name/resolve/main/README.md", () => {
      readmeRequested();
      return new HttpResponse("Bob's independent README", {
        headers: { "Content-Type": "text/markdown" },
      });
    }),
  );
});
afterEach(() => wrapper?.unmount());

function mountProfile() {
  wrapper = mount(UserProfile, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: {
          props: ["content"],
          setup: (props) => () => h("div", props.content),
        },
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
  return wrapper;
}

async function finishProfile(data = profile) {
  profileRequest.resolve(data);
  await vi.waitFor(() => {
    for (const type of ["model", "dataset", "space"])
      expect(requests[type]).toHaveLength(1);
  });
  await vi.waitFor(() =>
    expect(wrapper.text()).not.toContain("Loading user profile..."),
  );
  await flushPromises();
}

function sectionFor(title) {
  const section = wrapper.findAll("section").find((candidate) => {
    const heading = candidate.find("h2");
    return heading.exists() && heading.text() === title;
  });
  expect(section, `The ${title} section is visible`).toBeDefined();
  return section;
}

describe("user profile progressive loading", () => {
  it("retries a failed README or quota without reloading successful regions", async () => {
    let readmeUp = false,
      quotaUp = false;
    const readmeCalls = vi.fn(),
      quotaCalls = vi.fn();
    server.use(
      http.get("*/spaces/:namespace/:name/resolve/main/README.md", () => {
        readmeCalls();
        return readmeUp
          ? new HttpResponse("Recovered README")
          : new HttpResponse(null, { status: 503 });
      }),
      http.get("*/api/quota/:name/public", () => {
        quotaCalls();
        return quotaUp
          ? jsonResponse({
              public_used_bytes: 1000,
              public_quota_bytes: null,
              total_used_bytes: 1000,
              can_see_private: false,
            })
          : new HttpResponse(null, { status: 503 });
      }),
    );
    mountProfile();
    await finishProfile();
    requests.model[0].resolve(page("available-model"));
    const readme = () => wrapper.get('[aria-label="Profile README"]');
    const quota = () => wrapper.get('[aria-label="Storage usage"]');
    await vi.waitFor(() => {
      expect(readme().find('[data-testid="error-action-retry"]').exists()).toBe(
        true,
      );
      expect(quota().find('[data-testid="error-action-retry"]').exists()).toBe(
        true,
      );
      expect(sectionFor("Models").text()).toContain("available-model");
    });
    readmeUp = true;
    await readme().get('[data-testid="error-action-retry"]').trigger("click");
    await vi.waitFor(() => expect(readme().text()).toBe("Recovered README"));
    expect(quotaCalls).toHaveBeenCalledOnce();
    expect(quota().find('[role="alert"]').exists()).toBe(true);
    quotaUp = true;
    await quota().get('[data-testid="error-action-retry"]').trigger("click");
    await vi.waitFor(() => expect(quota().text()).toContain("1 KB"));
    expect(readmeCalls).toHaveBeenCalledTimes(2);
    expect(quotaCalls).toHaveBeenCalledTimes(2);
    expect(mocks.getFollowState).toHaveBeenCalledOnce();
    for (const type of ["model", "dataset", "space"])
      expect(requests[type]).toHaveLength(1);
    expect(sectionFor("Models").text()).toContain("available-model");
  });

  it("starts every independent region while the profile request remains pending", async () => {
    mountProfile();
    await vi.waitFor(() => {
      expect(requests.model).toHaveLength(1);
      expect(requests.dataset).toHaveLength(1);
      expect(requests.space).toHaveLength(1);
      expect(mocks.getFollowState).toHaveBeenCalledOnce();
      expect(quotaRequested).toHaveBeenCalledOnce();
      expect(wrapper.text()).toContain("Bob's independent README");
    });
    expect(wrapper.get('aside [role="status"]').text()).toContain(
      "Loading user profile...",
    );
    expect(wrapper.find(".entity-avatar").exists()).toBe(true);
    requests.model[0].resolve(page("independent-model"));
    await flushPromises();
    expect(sectionFor("Models").text()).toContain("independent-model");
    expect(wrapper.text()).toContain("Loading user profile...");
  });

  it("keeps profile, README, quota and repositories visible while local identity is pending", async () => {
    const identity = deferred();
    identityResponse = identity.promise;
    server.use(
      http.get("*/api/quota/:name/public", () => {
        quotaRequested();
        return jsonResponse({
          public_used_bytes: 1000,
          can_see_private: false,
        });
      }),
    );
    mountProfile();
    await finishProfile();
    requests.model[0].resolve(page("available-model"));
    await flushPromises();
    expect(wrapper.text()).toContain(profile.full_name);
    expect(sectionFor("Models").text()).toContain("available-model");
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Bob's independent README");
      expect(quotaRequested).toHaveBeenCalledOnce();
      expect(wrapper.get('[aria-label="Storage usage"]').text()).toContain(
        "1 KB",
      );
    });
    expect(mocks.getFollowState).not.toHaveBeenCalled();
    identity.resolve({ type: "user", _source: "local" });
    await vi.waitFor(() => expect(mocks.getFollowState).toHaveBeenCalledOnce());
  });

  it("a slow README or quota request does not block follow information or repository results", async () => {
    const readme = deferred();
    const quota = deferred();
    server.use(
      http.get(
        "*/spaces/:namespace/:name/resolve/main/README.md",
        async () => new HttpResponse(await readme.promise),
      ),
      http.get("*/api/quota/:name/public", async () =>
        jsonResponse(await quota.promise),
      ),
    );
    mountProfile();
    await finishProfile();
    requests.model[0].resolve(page("available-model"));
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find(".follow-counts").exists()).toBe(true),
    );
    expect(sectionFor("Models").text()).toContain("available-model");
    expect(wrapper.text()).toContain("Loading profile README...");
    expect(wrapper.text()).toContain("Loading storage usage...");
    readme.resolve("Independent late README");
    quota.resolve({
      public_used_bytes: 1000,
      public_quota_bytes: null,
      total_used_bytes: 1000,
      can_see_private: false,
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Independent late README");
      expect(wrapper.text()).toContain("1 KB");
    });
  });

  it("shows the returned profile while all repository requests are still pending", async () => {
    mountProfile();
    expect(wrapper.text()).toContain("Loading user profile...");
    await finishProfile();

    expect(wrapper.get("h1").text()).toBe("bob");
    expect(wrapper.text()).toContain(profile.full_name);
    expect(wrapper.text()).toContain(profile.bio);
    expect(wrapper.text()).not.toContain("Loading user profile...");
    for (const type of ["model", "dataset", "space"])
      expect(requests[type][0].query).toEqual({
        author: "bob",
        sort: "recent",
      });
    await vi.waitFor(() => {
      expect(mocks.getFollowState).toHaveBeenCalledOnce();
      expect(quotaRequested).toHaveBeenCalledOnce();
    });
  });

  it("loads local account features from the independent identity response when the profile has no source", async () => {
    mountProfile();
    const { _source, ...profileWithoutSource } = profile;
    await finishProfile(profileWithoutSource);
    await vi.waitFor(() => {
      expect(mocks.getFollowState).toHaveBeenCalledOnce();
      expect(quotaRequested).toHaveBeenCalledOnce();
    });

    requests.model[0].resolve(page("local-model"));
    await flushPromises();
    expect(mocks.getFollowState).toHaveBeenCalledOnce();
    expect(quotaRequested).toHaveBeenCalledOnce();

    requests.dataset[0].resolve(page());
    requests.space[0].resolve(page());
    await vi.waitFor(() => {
      expect(mocks.getFollowState).toHaveBeenCalledOnce();
      expect(quotaRequested).toHaveBeenCalledOnce();
    });
  });

  it("omits local follow controls and treats absent quota as normal for an external profile", async () => {
    identityResponse = null;
    server.use(
      http.get("*/api/quota/:name/public", () => {
        quotaRequested();
        return new HttpResponse(null, { status: 404 });
      }),
    );
    mountProfile();
    const { _source, ...profileWithoutSource } = profile;
    await finishProfile(profileWithoutSource);
    expect(mocks.getFollowState).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(quotaRequested).toHaveBeenCalledOnce());

    const externalPage = page("external-model");
    externalPage.data[0]._source = "huggingface";
    requests.model[0].resolve(externalPage);
    requests.dataset[0].resolve(page());
    requests.space[0].resolve(page());
    await flushPromises();
    expect(sectionFor("Models").text()).toContain("external-model");
    expect(mocks.getFollowState).not.toHaveBeenCalled();
    expect(quotaRequested).toHaveBeenCalledOnce();
    expect(wrapper.find('[aria-label="Storage usage"]').exists()).toBe(false);
  });

  it("keeps established local follow controls mounted while a later sort is pending", async () => {
    mountProfile();
    const { _source, ...profileWithoutSource } = profile;
    await finishProfile(profileWithoutSource);
    requests.model[0].resolve(page("initial-model"));
    requests.dataset[0].resolve(page());
    requests.space[0].resolve(page());
    await vi.waitFor(() => expect(mocks.getFollowState).toHaveBeenCalledOnce());
    const followControls = wrapper.getComponent(FollowControls).element;

    await sectionFor("Models").get("select").setValue("likes");
    await vi.waitFor(() => expect(requests.model).toHaveLength(2));
    expect(wrapper.findComponent(FollowControls).exists()).toBe(true);
    expect(wrapper.getComponent(FollowControls).element).toBe(followControls);
    expect(mocks.getFollowState).toHaveBeenCalledOnce();

    requests.model[1].resolve(page("sorted-model"));
    await flushPromises();
    expect(sectionFor("Models").text()).toContain("sorted-model");
    expect(wrapper.getComponent(FollowControls).element).toBe(followControls);
    expect(mocks.getFollowState).toHaveBeenCalledOnce();
  });

  it("loads and displays the README without waiting for any repository list", async () => {
    mountProfile();
    await finishProfile();

    await vi.waitFor(() => expect(readmeRequested).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Bob's independent README"),
    );
    const readme = wrapper
      .findAll("section")
      .find((section) => section.text().includes("Bob's independent README"));
    const models = sectionFor("Models");
    expect(readme.element.compareDocumentPosition(models.element) & 4).toBe(4);
    expect(models.get('[role="status"]').text()).toBe("Loading models...");
  });

  it("marks each pending list as loading without claiming empty lists or zero counts", async () => {
    mountProfile();
    await finishProfile();

    for (const title of ["Models", "Datasets", "Spaces"]) {
      const section = sectionFor(title);
      expect(section.get('[role="status"]').text()).toBe(
        `Loading ${title.toLowerCase()}...`,
      );
      expect(section.text()).not.toContain(`No ${title.toLowerCase()} yet`);
      expect(section.findAll("span").some((span) => span.text() === "0")).toBe(
        false,
      );
      const sidebarLink = wrapper.get(
        `aside a[href="/bob/${title.toLowerCase()}"]`,
      );
      expect(sidebarLink.text()).not.toMatch(/\b0\b/);
    }
  });

  it("renders a completed model list while datasets and spaces keep loading", async () => {
    mountProfile();
    await finishProfile();
    requests.model[0].resolve(page("available-model"));
    await flushPromises();

    expect(sectionFor("Models").text()).toContain("available-model");
    expect(sectionFor("Models").find('[role="status"]').exists()).toBe(false);
    expect(sectionFor("Datasets").get('[role="status"]').text()).toBe(
      "Loading datasets...",
    );
    expect(sectionFor("Spaces").get('[role="status"]').text()).toBe(
      "Loading spaces...",
    );
    expect(wrapper.text()).not.toContain("No datasets yet");
    expect(wrapper.text()).not.toContain("No spaces yet");
  });

  it("keeps successful lists when one fails and retries only that section", async () => {
    mountProfile();
    await finishProfile();
    requests.model[0].resolve(page("kept-model"));
    requests.space[0].resolve(page("kept-space"));
    requests.dataset[0].reject(httpFailure());
    await flushPromises();

    expect(sectionFor("Models").text()).toContain("kept-model");
    expect(sectionFor("Spaces").text()).toContain("kept-space");
    expect(sectionFor("Datasets").get('[role="alert"]').text()).toContain(
      "Service unavailable",
    );
    expect(sectionFor("Datasets").text()).not.toContain("No datasets yet");
    await sectionFor("Datasets")
      .get('[data-testid="error-action-retry"]')
      .trigger("click");
    await vi.waitFor(() => expect(requests.dataset).toHaveLength(2));
    expect(requests.model).toHaveLength(1);
    expect(requests.space).toHaveLength(1);
    expect(sectionFor("Models").text()).toContain("kept-model");
    expect(sectionFor("Spaces").text()).toContain("kept-space");

    requests.dataset[1].resolve(page("recovered-dataset"));
    await flushPromises();
    expect(sectionFor("Datasets").text()).toContain("recovered-dataset");
    expect(sectionFor("Datasets").find('[role="alert"]').exists()).toBe(false);
  });

  it.each(["success", "failure"])(
    "ignores an obsolete sort request's late %s after a newer result is shown",
    async (outcome) => {
      mountProfile();
      await finishProfile();
      requests.model[0].resolve(page("initial-model"));
      requests.dataset[0].resolve(page("kept-dataset"));
      requests.space[0].resolve(page());
      await flushPromises();

      await sectionFor("Models").get("select").setValue("likes");
      await vi.waitFor(() => expect(requests.model).toHaveLength(2));
      await sectionFor("Models").get("select").setValue("downloads");
      await vi.waitFor(() => expect(requests.model).toHaveLength(3));
      expect(requests.model[2].query).toEqual({
        author: "bob",
        sort: "downloads",
      });
      requests.model[2].resolve(page("newest-model"));
      await flushPromises();
      expect(sectionFor("Models").text()).toContain("newest-model");

      if (outcome === "success")
        requests.model[1].resolve(page("obsolete-model"));
      else requests.model[1].reject(httpFailure());
      await flushPromises();
      expect(sectionFor("Models").text()).toContain("newest-model");
      expect(sectionFor("Models").text()).not.toContain("obsolete-model");
      expect(sectionFor("Models").find('[role="alert"]').exists()).toBe(false);
      expect(sectionFor("Datasets").text()).toContain("kept-dataset");
      expect(requests.dataset).toHaveLength(1);
    },
  );
});
