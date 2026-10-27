// The user and organization pages draw their own repository cards. A private repository must say so there, as it
// does on the home page, in the repository list and on the discovery card: its owner, or an organization member,
// should be able to tell at a glance which of the repositories are private. And the names of the three types are
// links in the same colour: the type colours belong to the icons and headings, not to the names. And each page has one
// <h1>, the name of the account or the page's own title, so a screen reader's heading list starts somewhere.

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
  orgAPI: {
    ...(await original()).orgAPI,
    listMembers: async () => ({ data: { members: [] } }),
  },
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
  ...["models", "datasets", "spaces"].map((type) => [
    `user ${type} page`,
    UserType,
    "user",
    { type },
  ]),
  ["organization overview", OrgOverview, "org", {}],
  ...["models", "datasets", "spaces"].map((type) => [
    `organization ${type} page`,
    OrgType,
    "org",
    { type },
  ]),
];

let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.listAllRepos.mockResolvedValue({ data: [], incomplete: [] });
  server.use(
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: mocks.mode, _source: "local" }),
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

const repo = (type, name, isPrivate) => ({
  id: `bob/${name}-${type}`,
  private: isPrivate,
  lastModified: "2026-01-01T00:00:00Z",
  tags: [],
  downloads: 0,
  likes: 0,
});
const cardsOf = (name) =>
  wrapper.findAll(".card").filter((card) => card.text().includes(`${name}-`));

describe.each(PAGES)("%s", (_name, component, mode, params) => {
  it("marks a private repository's card, and only that one", async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [repo(type, "open", false), repo(type, "secret", true)],
      incomplete: [],
    }));
    await mountPage(component, mode, params);

    const secret = cardsOf("secret");
    expect(secret.length).toBeGreaterThan(0);
    for (const card of secret)
      expect(card.get(".repo-private").text()).toBe("Private");
    const open = cardsOf("open");
    expect(open.length).toBe(secret.length);
    for (const card of open)
      expect(card.find(".repo-private").exists()).toBe(false);
  });

  it("styles the name of a model, a dataset and a space alike: a link, in no type colour", async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [repo(type, "open", false)],
      incomplete: [],
    }));
    await mountPage(component, mode, params);

    const names = wrapper
      .findAll(".card h3 a")
      .map((link) => link.classes().sort().join(" "));
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toContain("text-blue-600");
    expect(names[0]).not.toMatch(/text-(green|purple)-|keep-type-color/);
  });

  it("makes each card one link to its own repository, whatever the type, with no click handler behind it", async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [repo(type, "open", false)],
      incomplete: [],
    }));
    await mountPage(component, mode, params);

    const cards = wrapper
      .findAll(".card")
      .filter((card) => card.find("h3 a").exists());
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const link = card.get("h3 a");
      // the id carries the type: bob/open-model must open /models/bob/open-model
      const [, type] = link.text().match(/^bob\/open-(\w+)$/);
      expect(link.attributes("href")).toBe(`/${type}s/bob/open-${type}`);
      expect(link.classes()).toContain("stretched-link");
      expect(card.classes()).toContain("relative");
      expect(card.classes()).not.toContain("cursor-pointer");
      await card.trigger("click");
    }
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("has exactly one <h1>", async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [repo(type, "open", false)],
      incomplete: [],
    }));
    await mountPage(component, mode, params);

    expect(wrapper.findAll("h1")).toHaveLength(1);
  });

  it('has no link without a name (the "show all" link is only there when there is more to show)', async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: [repo(type, "open", false)],
      incomplete: [],
    }));
    await mountPage(component, mode, params);

    for (const link of wrapper.findAll("a")) {
      expect(
        link.text() || link.attributes("aria-label"),
        link.html(),
      ).toBeTruthy();
    }
  });
});

describe("user overview navigation", () => {
  it("links to each complete repository list without nesting a button in the link", async () => {
    mocks.listAllRepos.mockImplementation(async (type) => ({
      data: Array.from({ length: 7 }, (_, index) =>
        repo(type, `repository-${index + 1}`, false),
      ),
      incomplete: [],
    }));
    await mountPage(UserOverview, "user", {});

    for (const type of ["models", "datasets", "spaces"]) {
      const links = wrapper
        .findAll("a")
        .filter((link) => link.text().startsWith(`Show all 7 ${type}`));
      expect(
        links,
        `the complete ${type} list has one named link`,
      ).toHaveLength(1);
      expect(links[0].attributes("href")).toBe(`/bob/${type}`);
      expect(links[0].find("button").exists()).toBe(false);
      expect(links[0].element.querySelector("a")).toBeNull();
    }
  });

  it("offers a real homepage link when the user does not exist", async () => {
    server.use(
      http.get("*/api/users/:name/type", () =>
        jsonResponse({}, { status: 404 }),
      ),
      http.get("*/api/users/:name/profile", () =>
        jsonResponse({}, { status: 404 }),
      ),
    );
    await mountPage(UserOverview, "user", {});

    expect(wrapper.get("h1").text()).toBe("User Not Found");
    const homepage = wrapper
      .findAll("a, button")
      .filter((control) => control.text() === "Go to Homepage");
    expect(homepage).toHaveLength(1);
    expect(homepage[0].element.tagName).toBe("A");
    expect(homepage[0].attributes("href")).toBe("/");
    expect(homepage[0].find("button").exists()).toBe(false);
  });
});
