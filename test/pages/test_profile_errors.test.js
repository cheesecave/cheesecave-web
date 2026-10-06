// A profile page must not turn a failure into "no such user" or "no
// repositories": the first is a 404 only, the second says why the list failed.

import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { http, HttpResponse } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: null,
  mode: "user",
  listRepos: vi.fn(),
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
vi.mock("@/utils/api", () => ({
  repoAPI: { listRepos: (...args) => mocks.listRepos(...args) },
  orgAPI: { listMembers: async () => ({ data: { members: [] } }) },
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
import UserProfile from "@/pages/[username]/index.vue";
import OrgProfile from "@/pages/organizations/[orgname]/index.vue";

const httpFailure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });

let wrapper;
let infoStatus;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  infoStatus = 200;
  mocks.route = reactive({
    params: { username: "bob", orgname: "bob" },
    query: {},
    fullPath: "/bob",
  });
  mocks.listRepos.mockResolvedValue({ data: [] });
  server.use(
    http.get("*/org/:name", ({ request }) =>
      mocks.mode === "user"
        ? jsonResponse({}, { status: 404 })
        : infoStatus === 200
          ? jsonResponse({ name: "bob" })
          : new HttpResponse(null, { status: infoStatus }),
    ),
    http.get("*/api/users/:name/profile", () =>
      infoStatus === 200
        ? jsonResponse({ full_name: "Bob", created_at: "2025-01-01T00:00:00Z" })
        : new HttpResponse(null, { status: infoStatus }),
    ),
    http.get("*/api/quota/:name/public", () => jsonResponse(null)),
    http.get("*/spaces/:namespace/:name/resolve/main/README.md", () =>
      jsonResponse({}, { status: 404 }),
    ),
  );
});
afterEach(() => wrapper?.unmount());

async function mountProfile(mode) {
  mocks.mode = mode;
  wrapper = mount(mode === "user" ? UserProfile : OrgProfile, {
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
const title = () => wrapper.get('[data-testid="error-title"]').text();

describe.each(["user", "org"])("%s profile failures", (mode) => {
  it("says a failed lookup failed, instead of that the account does not exist", async () => {
    infoStatus = 503;
    await mountProfile(mode);
    expect(title()).toBe("Service unavailable");
    expect(wrapper.text()).not.toContain("Not Found");
    infoStatus = 200;
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false),
    );
  });

  it("carries on when the lookup was cancelled", async () => {
    const real = axios.get.bind(axios);
    vi.spyOn(axios, "get").mockImplementation((url, ...rest) =>
      /\/(org|api\/users)\/bob(\/profile)?$/.test(String(url)) &&
      mode === "user" &&
      String(url).includes("profile")
        ? Promise.reject(new DOMException("a", "AbortError"))
        : mode === "org" && String(url) === "/org/bob"
          ? Promise.reject(new DOMException("a", "AbortError"))
          : real(url, ...rest),
    );
    await mountProfile(mode);
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("says why the repositories could not be listed, instead of showing none", async () => {
    let up = false;
    mocks.listRepos.mockImplementation(async () => {
      if (!up) throw httpFailure(500);
      return { data: [] };
    });
    await mountProfile(mode);
    expect(title()).toBe("Something went wrong on the server");
    expect(wrapper.text()).not.toContain("No models");
    up = true;
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false),
    );
  });

  it("shows no error for a repository listing that was cancelled", async () => {
    mocks.listRepos.mockRejectedValue(new DOMException("a", "AbortError"));
    await mountProfile(mode);
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });
});
