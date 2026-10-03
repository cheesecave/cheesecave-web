import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  route: {
    params: {},
    query: {},
  },
  repoSortPreference: {
    getRepoSortPreference: vi.fn(),
    setRepoSortPreference: vi.fn(),
  },
  elMessage: {
    error: vi.fn(),
  },
}));

vi.mock("vue-router/auto", () => ({
  useRouter: () => mocks.router,
  useRoute: () => mocks.route,
}));

vi.mock("@/utils/repoSortPreference", () => ({
  getRepoSortPreference: mocks.repoSortPreference.getRepoSortPreference,
  setRepoSortPreference: mocks.repoSortPreference.setRepoSortPreference,
}));

vi.mock("element-plus", () => ({
  ElMessage: mocks.elMessage,
}));

import HomePage from "@/pages/index.vue";
import HomepageHero from "../../src/shared/components/HomepageHero.vue";
import { DEFAULT_HOMEPAGE } from "../../src/shared/site-homepage";
import { useAuthStore } from "@/stores/auth";

describe("home page", () => {
  const requests = [];
  const wrappers = [];

  function installHandlers({
    modelRepos = [cloneFixture(uiApiFixtures.repo.info)],
    datasetRepos = cloneFixture(uiApiFixtures.userOverview.datasets),
    spaceRepos = cloneFixture(uiApiFixtures.userOverview.spaces),
    homepage = {},
    userRepos = cloneFixture(uiApiFixtures.userOverview),
  } = {}) {
    requests.length = 0;

    server.use(
      http.get("/api/site-homepage", () => jsonResponse(homepage)),
      http.get("/api/users/:username/repos", ({ request, params }) => {
        const url = new URL(request.url);
        requests.push({
          type: "personal",
          username: params.username,
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(userRepos);
      }),
      http.get("/api/models", ({ request }) => {
        const url = new URL(request.url);
        requests.push({
          type: "model",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(modelRepos);
      }),
      http.get("/api/datasets", ({ request }) => {
        const url = new URL(request.url);
        requests.push({
          type: "dataset",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(datasetRepos);
      }),
      http.get("/api/spaces", ({ request }) => {
        const url = new URL(request.url);
        requests.push({
          type: "space",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(spaceRepos);
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mocks.route.query = {};
    mocks.repoSortPreference.getRepoSortPreference.mockReturnValue("trending");
    installHandlers();
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  function mountPage() {
    const wrapper = mount(HomePage, {
      global: {
        mocks: {
          $router: mocks.router,
        },
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  }

  it("loads repo stats through the API client, routes hero actions, and persists sort changes", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(requests).toEqual([
      {
        type: "model",
        params: {
          limit: "100",
          sort: "trending",
          fallback: "false",
        },
      },
      {
        type: "dataset",
        params: {
          limit: "100",
          sort: "trending",
          fallback: "false",
        },
      },
      {
        type: "space",
        params: {
          limit: "100",
          sort: "trending",
          fallback: "false",
        },
      },
    ]);

    expect(wrapper.text()).toContain("Your next idea starts here.");
    expect(wrapper.text()).toContain("🔥 Trending");
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
    expect(wrapper.text()).toContain("mai_lin/street-sign-zh-en");
    expect(wrapper.text()).toContain("mai_lin/mai_lin");

    const hero = wrapper.get('[data-testid="homepage-hero"]');
    expect(wrapper.findComponent(HomepageHero).props("fullScreen")).toBe(true);
    expect(wrapper.findComponent(HomepageHero).props("preview")).toBe(false);
    expect(hero.get('a[href="/get-started"]').text()).toContain("Get Started");
    expect(hero.get('a[href="/self-hosted"]').text()).toContain(
      "Host Your Own Hub",
    );
    const buttons = wrapper.findAll("button");
    await buttons
      .find((button) => button.text().includes("View all models"))
      .trigger("click");
    await buttons
      .find((button) => button.text().includes("View all datasets"))
      .trigger("click");
    await buttons
      .find((button) => button.text().includes("View all spaces"))
      .trigger("click");

    await wrapper.get('select[data-el-select="true"]').setValue("likes");
    await flushPromises();
    expect(wrapper.text()).toContain("❤️ Most Liked");

    await wrapper.get('select[data-el-select="true"]').setValue("recent");
    await flushPromises();
    expect(wrapper.text()).toContain("🆕 Recently Created");

    await wrapper.get('select[data-el-select="true"]').setValue("updated");
    await flushPromises();
    expect(wrapper.text()).toContain("🕒 Recently Updated");

    await wrapper.get('select[data-el-select="true"]').setValue("downloads");
    await flushPromises();
    expect(wrapper.text()).toContain("⬇️ Most Downloaded");

    expect(mocks.repoSortPreference.setRepoSortPreference).toHaveBeenCalledWith(
      {
        scope: "home",
        repoType: "all",
        value: "downloads",
      },
    );
    expect(mocks.router.push).toHaveBeenCalledWith("/models");
    expect(mocks.router.push).toHaveBeenCalledWith("/datasets");
    expect(mocks.router.push).toHaveBeenCalledWith("/spaces");
  });

  it("handles invalid token query params and cleans up the URL", async () => {
    mocks.route.query = {
      error: "invalid_token",
      message: encodeURIComponent("Invitation expired"),
    };

    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.router.replace).toHaveBeenCalledWith("/");
    expect(wrapper.text()).toContain("Your next idea starts here.");
  });

  it("handles missing users and renders fallback metrics", async () => {
    mocks.route.query = {
      error: "user_not_found",
    };
    installHandlers({
      modelRepos: [
        {
          ...cloneFixture(uiApiFixtures.repo.info),
          id: "mai_lin/model-demo",
          downloads: undefined,
          likes: undefined,
          lastModified: null,
        },
      ],
      datasetRepos: [
        {
          ...cloneFixture(uiApiFixtures.repo.info),
          id: "mai_lin/dataset-demo",
          downloads: undefined,
          likes: undefined,
          lastModified: null,
        },
      ],
      spaceRepos: [
        {
          ...cloneFixture(uiApiFixtures.repo.info),
          id: "mai_lin/space-demo",
          downloads: undefined,
          likes: undefined,
          lastModified: null,
        },
      ],
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.router.replace).toHaveBeenCalledWith("/");
    expect(wrapper.text()).toContain("never");
    expect(wrapper.text()).toContain("0");
  });

  it("ignores unknown query errors and load failures without redirecting", async () => {
    mocks.route.query = {
      error: "something_else",
    };
    server.use(
      http.get("/api/models", () =>
        jsonResponse({ detail: "boom" }, { status: 500 }),
      ),
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.elMessage.error).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Your next idea starts here.");
  });

  it("renders the published card text and links without interpreting text as HTML", async () => {
    installHandlers({
      homepage: {
        eyebrow: "OUR COMMUNITY",
        title: "A place to build together",
        description: "<b>Share your next project</b>",
        primary_label: "Join the community",
        primary_url: "/register",
        secondary_label: "Read our docs",
        secondary_url: "https://docs.example.com/start",
        illustration: "none",
      },
    });
    const wrapper = mountPage();
    await flushPromises();

    const hero = wrapper.get('[data-testid="homepage-hero"]');
    expect(hero.text()).toContain("OUR COMMUNITY");
    expect(hero.text()).toContain("A place to build together");
    expect(hero.text()).toContain("<b>Share your next project</b>");
    expect(hero.find("b").exists()).toBe(false);
    expect(hero.get('a[href="/register"]').text()).toContain(
      "Join the community",
    );
    expect(
      hero.get('a[href="https://docs.example.com/start"]').text(),
    ).toContain("Read our docs");
    expect(hero.find("svg").exists()).toBe(false);
  });

  it.each([
    "First line\nSecond line",
    "First line\r\nSecond line",
    "First line\\nSecond line",
    "First line\\r\\nSecond line",
  ])(
    "renders title line breaks from %j in the visitor card and admin preview",
    (title) => {
      for (const preview of [false, true]) {
        const wrapper = mount(HomepageHero, {
          props: {
            config: { ...DEFAULT_HOMEPAGE, title, illustration: "none" },
            preview,
          },
          global: { stubs: { RouterLink: RouterLinkStub } },
        });
        expect(wrapper.get("h1").element.textContent).toBe(
          "First line\nSecond line",
        );
        wrapper.unmount();
      }
    },
  );

  it("keeps the admin hero preview constrained and its actions non-navigating", () => {
    const wrapper = mount(HomepageHero, {
      props: { config: { ...DEFAULT_HOMEPAGE }, preview: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    wrappers.push(wrapper);
    expect(wrapper.props("fullScreen")).toBe(false);
    expect(wrapper.findAll("a")).toHaveLength(0);
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "Get Started ↗",
      "Host Your Own Hub ↗",
    ]);
  });

  it("hides the disabled card while keeping repository discovery available", async () => {
    installHandlers({ homepage: { enabled: false } });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="homepage-hero"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
  });

  it("hides discovery when configured without loading repository lists", async () => {
    installHandlers({ homepage: { show_repositories: false } });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Your next idea starts here.");
    expect(wrapper.text()).not.toContain("mai_lin/lineart-caption-base");
    expect(requests).toEqual([]);
  });

  it("uses the default card if the public configuration request fails", async () => {
    server.use(
      http.get("/api/site-homepage", () =>
        jsonResponse({ detail: "offline" }, { status: 503 }),
      ),
    );
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Your next idea starts here.");
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
  });

  function signIn(username = "mai_lin") {
    const auth = useAuthStore();
    auth.user = { username, email: `${username}@example.com` };
    auth.userOrganizations = [
      { name: "deepghs", fullname: "DeepGHS", roleInOrg: "admin" },
    ];
    return auth;
  }

  it("shows personal repositories and organization links in the authenticated workspace", async () => {
    signIn();
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Your workspace");
    expect(wrapper.find('[data-testid="homepage-hero"]').exists()).toBe(false);
    const workspace = wrapper.get('[data-testid="workspace"]');
    expect(wrapper.find(".discovery-section").exists()).toBe(false);
    expect(workspace.find('[data-testid="workspace-personal"]').exists()).toBe(
      true,
    );
    expect(workspace.find('[data-testid="workspace-feed"]').exists()).toBe(
      true,
    );
    expect(workspace.find('[data-testid="workspace-trending"]').exists()).toBe(
      true,
    );
    expect(workspace.text()).toContain("mai_lin/lineart-caption-base");
    expect(workspace.text()).toContain("mai_lin/street-sign-zh-en");
    expect(workspace.text()).toContain("mai_lin/mai_lin");
    expect(workspace.get('a[href="/organizations/deepghs"]').text()).toContain(
      "deepghs",
    );
    expect(workspace.get(".organization-role").text()).toBe("admin");
    expect(requests.filter((request) => request.type === "personal")).toEqual([
      {
        type: "personal",
        username: "mai_lin",
        params: { sort: "recent", limit: "12" },
      },
    ]);
    expect(requests.filter((request) => request.type !== "personal")).toEqual([
      {
        type: "model",
        params: { limit: "3", sort: "trending", fallback: "false" },
      },
    ]);
  });

  it("shows an empty workspace with a way to create a first repository", async () => {
    installHandlers({ userRepos: { models: [], datasets: [], spaces: [] } });
    signIn();
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("No repositories yet");
    expect(wrapper.find('a[href^="/new"]').exists()).toBe(true);
  });

  it("keeps a loading state until personal repository results arrive", async () => {
    let release;
    let entered = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/users/:username/repos", async () => {
        entered = true;
        await gate;
        return jsonResponse(uiApiFixtures.userOverview);
      }),
    );
    signIn();
    const wrapper = mountPage();
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(wrapper.text()).toContain("Loading your repositories");
    release();
    await vi.waitFor(() =>
      expect(wrapper.text()).not.toContain("Loading your repositories"),
    );
    expect(wrapper.get('[data-testid="workspace"]').text()).toContain(
      "mai_lin/lineart-caption-base",
    );
  });

  it("retries a failed personal repository request", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/users/:username/repos", () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ detail: "offline" }, { status: 503 })
          : jsonResponse(uiApiFixtures.userOverview);
      }),
    );
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Could not load your repositories");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Try again"))
      .trigger("click");
    await flushPromises();
    expect(attempts).toBe(2);
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
    expect(wrapper.text()).not.toContain("Could not load your repositories");
  });

  it("clears private workspace content immediately on logout", async () => {
    installHandlers({
      userRepos: {
        models: [
          {
            ...cloneFixture(uiApiFixtures.repo.info),
            id: "mai_lin/private-work",
            private: true,
          },
        ],
        datasets: [],
        spaces: [],
      },
    });
    const auth = signIn();
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("mai_lin/private-work");

    auth.user = null;
    await flushPromises();
    expect(wrapper.text()).not.toContain("mai_lin/private-work");
    expect(wrapper.text()).not.toContain("Your workspace");
    expect(wrapper.find('[data-testid="homepage-hero"]').exists()).toBe(true);
  });

  it("does not restore a previous user's private data after an account change", async () => {
    let release;
    let entered = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/users/:username/repos", async ({ params }) => {
        if (params.username === "mai_lin") {
          entered = true;
          await gate;
          return jsonResponse({
            models: [
              {
                ...cloneFixture(uiApiFixtures.repo.info),
                id: "mai_lin/late-private",
                private: true,
              },
            ],
            datasets: [],
            spaces: [],
          });
        }
        return jsonResponse({ models: [], datasets: [], spaces: [] });
      }),
    );
    const auth = signIn();
    const wrapper = mountPage();
    await vi.waitFor(() => expect(entered).toBe(true));
    auth.user = null;
    await flushPromises();
    auth.user = { username: "alice", email: "alice@example.com" };
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("No repositories yet"),
    );
    release();
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(wrapper.text()).not.toContain("mai_lin/late-private");
    expect(wrapper.text()).toContain("No repositories yet");
  });

  it("filters personal repositories without another API request and restores them after clearing search", async () => {
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const workspace = wrapper.get('[data-testid="workspace-personal"]');
    const search = workspace.get('input[aria-label="Find a repository"]');
    await search.setValue("STREET-SIGN");
    expect(workspace.text()).toContain("mai_lin/street-sign-zh-en");
    expect(workspace.text()).not.toContain("mai_lin/lineart-caption-base");
    await search.setValue("does-not-exist");
    expect(workspace.text()).toContain("No repositories match your search.");
    await search.setValue("");
    expect(workspace.text()).toContain("mai_lin/lineart-caption-base");
    expect(
      requests.filter((request) => request.type === "personal"),
    ).toHaveLength(1);
  });

  it("sorts recent workspace repositories across all types and preserves private repository links", async () => {
    const repos = cloneFixture(uiApiFixtures.userOverview);
    repos.models[0].lastModified = "2026-04-20T10:00:00Z";
    repos.models[0].private = true;
    repos.datasets[0].lastModified = "2026-04-21T10:00:00Z";
    installHandlers({ userRepos: repos });
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const workspace = wrapper.get('[data-testid="workspace"]');
    const links = workspace.findAll(".workspace-repo");
    expect(links.map((link) => link.attributes("href"))).toEqual([
      "/datasets/mai_lin/street-sign-zh-en",
      "/models/mai_lin/lineart-caption-base",
      "/spaces/mai_lin/mai_lin",
    ]);
    expect(links[1].get('[aria-label="Private"]').attributes("title")).toBe(
      "Private",
    );
  });

  it("reloads workspace trending when the authenticated identity changes", async () => {
    const auth = signIn();
    const discoveryOwners = [];
    server.use(
      http.get("/api/models", () => {
        discoveryOwners.push(auth.username);
        return jsonResponse([
          {
            ...cloneFixture(uiApiFixtures.repo.info),
            id: `${auth.username}/own-discovery`,
            private: true,
          },
        ]);
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    const discovery = wrapper.get('[data-testid="workspace-trending"]');
    expect(discovery.text()).toContain("mai_lin/own-discovery");
    auth.user = { username: "alice", email: "alice@example.com" };
    await flushPromises();
    expect(discoveryOwners).toEqual(["mai_lin", "alice"]);
    expect(discovery.text()).not.toContain("mai_lin/own-discovery");
    expect(discovery.text()).toContain("alice/own-discovery");
  });

  it("clears workspace trending immediately on logout before public discovery completes", async () => {
    const auth = signIn();
    let release;
    let entered = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/models", async () => {
        if (auth.username)
          return jsonResponse([
            {
              ...cloneFixture(uiApiFixtures.repo.info),
              id: "mai_lin/discovery-private",
              private: true,
            },
          ]);
        entered = true;
        await gate;
        return jsonResponse([cloneFixture(uiApiFixtures.repo.info)]);
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get('[data-testid="workspace-trending"]').text()).toContain(
      "mai_lin/discovery-private",
    );
    auth.user = null;
    await nextTick();
    expect(wrapper.text()).not.toContain("mai_lin/discovery-private");
    await vi.waitFor(() => expect(entered).toBe(true));
    release();
    await vi.waitFor(() =>
      expect(wrapper.get(".discovery-section").text()).toContain(
        "mai_lin/lineart-caption-base",
      ),
    );
    expect(wrapper.text()).not.toContain("mai_lin/discovery-private");
  });

  it("ignores late workspace trending responses after logout", async () => {
    const auth = signIn();
    let release;
    let entered = false;
    let completed = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/models", async () => {
        if (!auth.username)
          return jsonResponse([cloneFixture(uiApiFixtures.repo.info)]);
        entered = true;
        await gate;
        completed = true;
        return jsonResponse([
          {
            ...cloneFixture(uiApiFixtures.repo.info),
            id: "mai_lin/late-discovery-private",
            private: true,
          },
        ]);
      }),
    );
    const wrapper = mountPage();
    await vi.waitFor(() => expect(entered).toBe(true));
    auth.user = null;
    await vi.waitFor(() =>
      expect(wrapper.get(".discovery-section").text()).toContain(
        "mai_lin/lineart-caption-base",
      ),
    );
    release();
    await vi.waitFor(() => expect(completed).toBe(true));
    await flushPromises();
    expect(wrapper.text()).not.toContain("mai_lin/late-discovery-private");
    expect(wrapper.get(".discovery-section").text()).toContain(
      "mai_lin/lineart-caption-base",
    );
  });

  it("filters center updates by repository type while retaining the personal sidebar", async () => {
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const feed = wrapper.get('[data-testid="workspace-feed"]');
    expect(
      feed.find('a[href="/models/mai_lin/lineart-caption-base"]').exists(),
    ).toBe(true);
    expect(
      feed.find('a[href="/datasets/mai_lin/street-sign-zh-en"]').exists(),
    ).toBe(true);
    const datasetFilter = feed
      .findAll("button")
      .find((button) => button.text() === "Datasets");
    await datasetFilter.trigger("click");
    expect(datasetFilter.attributes("aria-pressed")).toBe("true");
    expect(
      feed.find('a[href="/models/mai_lin/lineart-caption-base"]').exists(),
    ).toBe(false);
    expect(
      feed.find('a[href="/datasets/mai_lin/street-sign-zh-en"]').exists(),
    ).toBe(true);
    expect(wrapper.get('[data-testid="workspace-personal"]').text()).toContain(
      "mai_lin/lineart-caption-base",
    );
    await feed
      .findAll("button")
      .find((button) => button.text() === "All")
      .trigger("click");
    expect(
      feed.find('a[href="/models/mai_lin/lineart-caption-base"]').exists(),
    ).toBe(true);
    expect(
      requests.filter((request) => request.type === "personal"),
    ).toHaveLength(1);
  });

  it("loads only the selected trending type in the right rail", async () => {
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const trending = wrapper.get('[data-testid="workspace-trending"]');
    await trending
      .get('select[aria-label="Trending repository type"]')
      .setValue("dataset");
    await flushPromises();
    expect(trending.text()).toContain("mai_lin/street-sign-zh-en");
    expect(trending.text()).not.toContain("mai_lin/lineart-caption-base");
    expect(requests.filter((request) => request.type !== "personal")).toEqual([
      {
        type: "model",
        params: { limit: "3", sort: "trending", fallback: "false" },
      },
      {
        type: "dataset",
        params: { limit: "3", sort: "trending", fallback: "false" },
      },
    ]);
  });

  it("retries a failed trending request independently of the personal workspace", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/models", () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ detail: "offline" }, { status: 503 })
          : jsonResponse([cloneFixture(uiApiFixtures.repo.info)]);
      }),
    );
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const trending = wrapper.get('[data-testid="workspace-trending"]');
    expect(trending.text()).toContain("Could not load trending repositories");
    expect(wrapper.get('[data-testid="workspace-personal"]').text()).toContain(
      "mai_lin/lineart-caption-base",
    );
    await trending
      .findAll("button")
      .find((button) => button.text().includes("Try again"))
      .trigger("click");
    await flushPromises();
    expect(attempts).toBe(2);
    expect(trending.text()).toContain("mai_lin/lineart-caption-base");
    expect(trending.text()).not.toContain(
      "Could not load trending repositories",
    );
    expect(
      requests.filter((request) => request.type === "personal"),
    ).toHaveLength(1);
  });

  it("shows an empty trending rail while retaining center updates", async () => {
    installHandlers({ modelRepos: [] });
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get('[data-testid="workspace-trending"]').text()).toContain(
      "No trending repositories yet",
    );
    expect(wrapper.get('[data-testid="workspace-feed"]').text()).toContain(
      "mai_lin/lineart-caption-base",
    );
  });

  it("opens and closes personal repositories through the mobile navigation toggle", async () => {
    signIn();
    const wrapper = mountPage();
    await flushPromises();
    const personal = wrapper.get('[data-testid="workspace-personal"]');
    const toggle = personal.get(".personal-toggle");
    const content = personal.get(".personal-content");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(content.classes()).not.toContain("expanded");
    expect(toggle.attributes("aria-controls")).toBe(content.attributes("id"));
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(content.classes()).toContain("expanded");
    expect(content.text()).toContain("mai_lin/lineart-caption-base");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(content.classes()).not.toContain("expanded");
  });

  it("ignores late trending responses for a previously selected repository type", async () => {
    let release;
    let entered = false;
    let completed = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/models", async () => {
        entered = true;
        await gate;
        completed = true;
        return jsonResponse([cloneFixture(uiApiFixtures.repo.info)]);
      }),
    );
    signIn();
    const wrapper = mountPage();
    await vi.waitFor(() => expect(entered).toBe(true));
    const trending = wrapper.get('[data-testid="workspace-trending"]');
    await trending
      .get('select[aria-label="Trending repository type"]')
      .setValue("dataset");
    await vi.waitFor(() =>
      expect(trending.text()).toContain("mai_lin/street-sign-zh-en"),
    );
    release();
    await vi.waitFor(() => expect(completed).toBe(true));
    await flushPromises();
    expect(trending.text()).toContain("mai_lin/street-sign-zh-en");
    expect(trending.text()).not.toContain("mai_lin/lineart-caption-base");
  });
});
