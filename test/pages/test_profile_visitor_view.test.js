import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  auth: null,
  route: null,
  source: "local",
  privateReadme: false,
  listAllRepos: vi.fn(),
  getInfo: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  repoAPI: {
    listAllRepos: (...args) => mocks.listAllRepos(...args),
    getInfo: (...args) => mocks.getInfo(...args),
  },
}));
import Overview from "@/pages/[username]/index.vue";
import Repositories from "@/pages/[username]/[type].vue";

let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source = "local";
  mocks.privateReadme = false;
  mocks.getInfo.mockImplementation(async () => ({
    data: { id: "bob/bob", private: mocks.privateReadme },
  }));
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "bob",
    user: { username: "bob" },
  });
  mocks.route = reactive({
    path: "/bob",
    params: { username: "bob" },
    query: {},
    hash: "",
    fullPath: "/bob",
  });
  mocks.replace.mockImplementation(async ({ query }) => {
    mocks.route.query = query;
  });
  mocks.listAllRepos.mockImplementation(async (type) => ({
    data: [
      { id: `bob/public-${type}`, private: false },
      { id: `bob/private-${type}`, private: true },
      ...(type === "space"
        ? [{ id: "bob/bob", private: mocks.privateReadme }]
        : []),
    ],
    incomplete: [],
  }));
  server.use(
    http.get("*/api/users/:name/type", () =>
      mocks.source && mocks.source !== "local"
        ? jsonResponse({}, { status: 404 })
        : jsonResponse({ type: "user", _source: "local" }),
    ),
    http.get("*/org/:name", () => new HttpResponse(null, { status: 404 })),
    http.get("*/api/users/:name/profile", () =>
      jsonResponse({
        username: "bob",
        full_name: "Bob",
        _source: mocks.source,
      }),
    ),
    http.get("*/api/quota/:name/public", () =>
      jsonResponse({
        public_used_bytes: 1000,
        public_quota_bytes: null,
        private_used_bytes: 2000,
        private_quota_bytes: null,
        total_used_bytes: 3000,
        can_see_private: true,
      }),
    ),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse("Profile README"),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountPage(type) {
  if (type) mocks.route.params.type = type;
  wrapper = mount(type ? Repositories : Overview, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        FollowControls: {
          props: ["visitorView"],
          template: '<div data-follow-preview :data-preview="visitorView" />',
        },
        MarkdownViewer: {
          props: ["content"],
          setup: (props) => () =>
            h("div", { "data-readme": "" }, props.content),
        },
      },
    },
  });
  await vi.waitFor(() =>
    expect(wrapper.findAll(".profile-repo-card").length).toBeGreaterThan(0),
  );
  await flushPromises();
}

describe("profile visitor preview", () => {
  it("shows a public README while the Spaces list is still pending", async () => {
    mocks.route.query.view = "visitor";
    let finishSpaces;
    const spaces = new Promise((resolve) => {
      finishSpaces = resolve;
    });
    const original = mocks.listAllRepos.getMockImplementation();
    mocks.listAllRepos.mockImplementation((type) =>
      type === "space" ? spaces : original(type),
    );
    try {
      await mountPage();
      await vi.waitFor(() =>
        expect(wrapper.find("[data-readme]").exists()).toBe(true),
      );
      expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
      expect(wrapper.text()).toContain("Loading spaces...");
      expect(mocks.getInfo).toHaveBeenCalledWith("space", "bob", "bob", [
        "private",
      ]);
    } finally {
      finishSpaces({ data: [], incomplete: [] });
      await flushPromises();
    }
    expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
  });

  it("keeps a public README visible when the Spaces list fails", async () => {
    mocks.route.query.view = "visitor";
    const original = mocks.listAllRepos.getMockImplementation();
    mocks.listAllRepos.mockImplementation((type) =>
      type === "space"
        ? Promise.reject(new Error("list failed"))
        : original(type),
    );
    await mountPage();
    expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
  });

  it("keeps an unverified README hidden in preview while leaving the owner view usable", async () => {
    mocks.getInfo.mockRejectedValue(new Error("metadata failed"));
    mocks.route.query.view = "visitor";
    await mountPage();
    expect(wrapper.find("[data-readme]").exists()).toBe(false);
    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
  });

  it("filters the first responses before a legacy profile's source is established", async () => {
    mocks.source = undefined;
    mocks.privateReadme = true;
    mocks.route.query.view = "visitor";
    let finishDatasets, finishSpaces;
    const datasets = new Promise((resolve) => {
      finishDatasets = resolve;
    });
    const spaces = new Promise((resolve) => {
      finishSpaces = resolve;
    });
    mocks.listAllRepos.mockImplementation((type) =>
      type === "model"
        ? Promise.resolve({
            data: [
              { id: "bob/public-model", private: false },
              { id: "bob/private-model", private: true },
            ],
            incomplete: [],
          })
        : type === "dataset"
          ? datasets
          : spaces,
    );
    try {
      await mountPage();
      expect(wrapper.text()).not.toContain("bob/private-model");
      expect(wrapper.find("[data-readme]").exists()).toBe(false);
      expect(wrapper.find('a[href="/bob/models?view=visitor"]').exists()).toBe(
        true,
      );
      expect(
        wrapper.find('button[aria-label="Exit visitor view"]').exists(),
      ).toBe(true);
    } finally {
      finishDatasets({ data: [], incomplete: [] });
      finishSpaces({
        data: [{ id: "bob/bob", private: true }],
        incomplete: [],
      });
      await flushPromises();
    }
    expect(wrapper.find("[data-readme]").exists()).toBe(false);
    expect(
      wrapper.find('button[aria-label="Exit visitor view"]').exists(),
    ).toBe(true);
  });

  it("switches the overview to public data and back without signing out or refetching", async () => {
    mocks.route.query.from = "saved";
    await mountPage();
    const requests = mocks.listAllRepos.mock.calls.length;
    expect(wrapper.text()).toContain("bob/private-model");
    expect(wrapper.text()).toContain("3 KB");
    await wrapper.get('button[aria-label="View as visitor"]').trigger("click");
    await flushPromises();
    expect(mocks.route.query).toEqual({ from: "saved", view: "visitor" });
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("bob/private-");
    expect(wrapper.text()).not.toContain("3 KB");
    expect(wrapper.text()).not.toContain("2 KB");
    expect(wrapper.text()).toContain("1 KB");
    expect(wrapper.find('a[href="/bob/storage"]').exists()).toBe(false);
    expect(
      wrapper.get("[data-follow-preview]").attributes("data-preview"),
    ).toBe("true");
    expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
    expect(
      wrapper
        .get('a[href="/bob/models?view=visitor"]')
        .text()
        .replace(/\s/g, ""),
    ).toBe("Models1");
    expect(
      wrapper
        .get('button[aria-label="Exit visitor view"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.route.query).toEqual({ from: "saved" });
    expect(wrapper.text()).toContain("bob/private-model");
    expect(wrapper.text()).toContain("3 KB");
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(true);
    expect(mocks.listAllRepos).toHaveBeenCalledTimes(requests);
    expect(mocks.auth.isAuthenticated).toBe(true);
    expect(mocks.auth.username).toBe("bob");
  });

  it("does not preview the README of a private profile Space", async () => {
    mocks.privateReadme = true;
    mocks.route.query.view = "visitor";
    await mountPage();
    expect(wrapper.find("[data-readme]").exists()).toBe(false);
    await wrapper
      .get('button[aria-label="Exit visitor view"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-readme]").text()).toBe("Profile README");
  });

  it.each(["models", "datasets", "spaces"])(
    "preserves public-only %s counts, searching and navigation",
    async (type) => {
      mocks.route.query.view = "visitor";
      await mountPage(type);
      const singular = type.slice(0, -1);
      expect(wrapper.text()).not.toContain("bob/private-");
      expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(
        false,
      );
      expect(wrapper.get('a[href="/bob?view=visitor"]').text()).toBe(
        "Overview",
      );
      expect(wrapper.get(".profile-count").text()).toBe(
        type === "spaces" ? "2" : "1",
      );
      for (const destination of ["models", "datasets", "spaces"])
        expect(
          wrapper.find(`a[href="/bob/${destination}?view=visitor"]`).exists(),
        ).toBe(true);
      await wrapper
        .get(`input[aria-label="Search ${type}"]`)
        .setValue(`private-${singular}`);
      expect(wrapper.findAll(".profile-repo-card")).toHaveLength(0);
      await wrapper
        .get('button[aria-label="Exit visitor view"]')
        .trigger("click");
      await flushPromises();
      expect(wrapper.get(".profile-repo-card").text()).toContain(
        `bob/private-${singular}`,
      );
    },
  );

  it("allows newly authorized owner results after the session is restored", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.username = null;
    mocks.auth.user = null;
    const ownerResults = mocks.listAllRepos.getMockImplementation();
    mocks.listAllRepos.mockImplementation(async (type) => ({
      ...(await ownerResults(type)),
      data: [{ id: `bob/public-${type}`, private: false }],
    }));
    await mountPage();
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "bob";
    mocks.auth.user = { username: "bob" };
    mocks.listAllRepos.mockImplementation(ownerResults);
    await wrapper.get('select[aria-label="Sort models"]').setValue("likes");
    await flushPromises();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("bob/private-model");
  });

  it("keeps cached private content hidden after the owner signs out during preview", async () => {
    mocks.privateReadme = true;
    mocks.route.query.view = "visitor";
    await mountPage();
    mocks.auth.isAuthenticated = false;
    mocks.auth.username = null;
    mocks.auth.user = null;
    await flushPromises();
    expect(wrapper.text()).not.toContain("bob/private-");
    expect(wrapper.text()).not.toContain("3 KB");
    expect(wrapper.find("[data-readme]").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(false);
    expect(
      wrapper.find('button[aria-label="Exit visitor view"]').exists(),
    ).toBe(false);
  });

  it.each(["other user", "signed out", "external"])(
    "does not offer the switch to %s",
    async (identity) => {
      mocks.route.query.view = "visitor";
      if (identity === "other user") mocks.auth.username = "alice";
      if (identity === "signed out") mocks.auth.isAuthenticated = false;
      if (identity === "external") mocks.source = "huggingface";
      await mountPage();
      expect(
        wrapper.find('button[aria-label="View as visitor"]').exists(),
      ).toBe(false);
      expect(
        wrapper.find('button[aria-label="Exit visitor view"]').exists(),
      ).toBe(false);
    },
  );
});
