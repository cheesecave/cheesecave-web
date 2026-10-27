import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({ auth: null, route: null }));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  repoAPI: { listAllRepos: async () => ({ data: [], incomplete: [] }) },
  orgAPI: {},
  settingsAPI: {},
}));
import UserProfile from "@/pages/[username]/index.vue";

let wrapper;
beforeEach(() => {
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "bob",
    user: { username: "bob" },
  });
  mocks.route = reactive({
    params: { username: "bob" },
    query: {},
    fullPath: "/bob",
  });
  server.use(
    http.get("*/api/users/:name/type", () =>
      jsonResponse({ type: "user", _source: "local" }),
    ),
    http.get("*/org/:name", () => new HttpResponse(null, { status: 404 })),
    http.get("*/api/users/:name/profile", () =>
      jsonResponse({ username: "bob", full_name: "Bob", _source: "local" }),
    ),
    http.get("*/api/quota/:name/public", () => jsonResponse(null)),
    http.get(
      "*/spaces/:namespace/:name/resolve/main/README.md",
      () => new HttpResponse(null, { status: 404 }),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountProfile() {
  wrapper = mount(UserProfile, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        FollowControls: true,
        MarkdownViewer: true,
        ElTable: true,
        ElTableColumn: true,
      },
    },
  });
  await vi.waitFor(() =>
    expect(wrapper.text()).not.toContain("Loading user profile..."),
  );
  await flushPromises();
}

describe("profile owner actions", () => {
  it("offers only the edit profile destination on the signed-in user's own profile", async () => {
    await mountProfile();
    const actions = wrapper.get('[aria-label="Profile actions"]');
    const links = Object.fromEntries(
      actions
        .findAll("a")
        .map((link) => [link.text(), link.attributes("href")]),
    );
    expect(links).toEqual({
      "Edit profile": "/settings?tab=profile",
    });
    expect(
      actions.findAll("button").some((button) => button.text() === "New"),
    ).toBe(false);
    for (const link of actions.findAll("a"))
      expect(link.find("button").exists()).toBe(false);
  });

  it.each(["visitor", "other user"])(
    "does not offer owner actions for a %s",
    async (identity) => {
      mocks.auth.isAuthenticated = identity !== "visitor";
      mocks.auth.username = identity === "visitor" ? null : "alice";
      await mountProfile();
      expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(
        false,
      );
    },
  );

  it("removes owner actions immediately when the account changes or signs out", async () => {
    await mountProfile();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(true);
    mocks.auth.username = "alice";
    await flushPromises();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(false);
    mocks.auth.username = "bob";
    await flushPromises();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(true);
    mocks.auth.isAuthenticated = false;
    await flushPromises();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(false);
  });

  it("does not offer local owner actions for an external profile", async () => {
    server.use(
      http.get("*/api/users/:name/type", () =>
        jsonResponse({}, { status: 404 }),
      ),
      http.get("*/api/users/:name/profile", () =>
        jsonResponse({ username: "bob", _source: "huggingface" }),
      ),
    );
    await mountProfile();
    expect(wrapper.find('[aria-label="Profile actions"]').exists()).toBe(false);
  });
});
