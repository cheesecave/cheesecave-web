import { h, reactive } from "vue";
import { createMemoryHistory, createRouter } from "vue-router/auto";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  auth: null,
  router: { push: vi.fn() },
  getFollowState: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  listFollowers: vi.fn(),
  listFollowing: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({ socialAPI: mocks }));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => ({ fullPath: "/bob?sort=updated" }),
  useRouter: () => mocks.router,
}));
import FollowControls from "@/components/profile/FollowControls.vue";
import FollowListDialog from "@/components/profile/FollowListDialog.vue";

const original = {
  username: "bob",
  is_org: false,
  following: false,
  can_follow: true,
  followers_count: 3,
  following_count: 2,
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe("profile follow controls", () => {
  let wrapper;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = reactive({
      isAuthenticated: true,
      username: "alice",
      user: { id: 1, username: "alice", is_org: false, is_active: true },
      token: null,
    });
    mocks.getFollowState.mockImplementation(async (username) => ({
      data: { ...original, username },
    }));
    mocks.follow.mockResolvedValue({
      data: { ...original, following: true, followers_count: 4 },
    });
    mocks.unfollow.mockResolvedValue({ data: { ...original } });
    mocks.listFollowers.mockResolvedValue({
      data: { items: [], has_more: false, next_cursor: null },
    });
    mocks.listFollowing.mockResolvedValue({
      data: { items: [], has_more: false, next_cursor: null },
    });
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });
  async function mountComponent(
    component = FollowControls,
    props = { username: "bob" },
  ) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/:pathMatch(.*)*", component: { template: "<div />" } },
      ],
    });
    await router.push("/bob");
    wrapper = mount(component, {
      props,
      global: {
        plugins: [router],
        stubs: {
          ...ElementPlusStubs,
          ElScrollbar: {
            setup:
              (_, { slots }) =>
              () =>
                h("div", { "data-scrollbar": true }, slots.default?.()),
          },
        },
      },
    });
    await flushPromises();
  }
  function button(text) {
    return wrapper.findAll("button").find((item) => item.text() === text);
  }

  it("follows and unfollows after confirmed writes, updating counts and notifying the feed", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await mountComponent();
    await button("Follow").trigger("click");
    await flushPromises();
    expect(mocks.follow).toHaveBeenCalledExactlyOnceWith("bob");
    expect(button("Following").attributes("aria-pressed")).toBe("true");
    expect(wrapper.get(".follow-counts").text()).toContain("4 followers");
    expect(
      dispatch.mock.calls.some(
        ([event]) =>
          event.type === "hub-follow-changed" &&
          event.detail.username === "bob",
      ),
    ).toBe(true);
    await button("Following").trigger("click");
    await flushPromises();
    expect(mocks.unfollow).toHaveBeenCalledExactlyOnceWith("bob");
    expect(wrapper.get(".follow-counts").text()).toContain("3 followers");
    expect(button("Follow")).toBeDefined();
  });

  it("redirects anonymous Follow to login with the current path, allowing lists to remain public", async () => {
    Object.assign(mocks.auth, {
      isAuthenticated: false,
      username: null,
      user: null,
    });
    await mountComponent();
    await button("Follow").trigger("click");
    expect(mocks.router.push).toHaveBeenCalledWith({
      path: "/login",
      query: { return: "/bob?sort=updated" },
    });
    expect(mocks.follow).not.toHaveBeenCalled();
    await button("3 followers").trigger("click");
    await flushPromises();
    expect(mocks.listFollowers).toHaveBeenCalledWith("bob", { limit: 20 });
  });

  it("hides self-follow while keeping both counts available", async () => {
    await mountComponent(FollowControls, { username: "alice" });
    expect(wrapper.find(".follow-button").exists()).toBe(false);
    expect(wrapper.findAll(".follow-counts button")).toHaveLength(2);
  });

  it("disables writes when the server reports this account cannot follow", async () => {
    mocks.getFollowState.mockResolvedValue({
      data: { ...original, can_follow: false },
    });
    await mountComponent();
    expect(button("Follow").element.disabled).toBe(true);
    await button("Follow").trigger("click");
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it("allows local organizations as follow targets", async () => {
    mocks.getFollowState.mockResolvedValue({
      data: { ...original, username: "team", is_org: true },
    });
    await mountComponent(FollowControls, { username: "team" });
    await button("Follow").trigger("click");
    await flushPromises();
    expect(mocks.follow).toHaveBeenCalledWith("team");
  });

  it("blocks repeated writes and retains the original state on failure", async () => {
    const pending = deferred();
    mocks.follow.mockReturnValue(pending.promise);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await mountComponent();
    await button("Follow").trigger("click");
    await button("Follow").trigger("click");
    expect(mocks.follow).toHaveBeenCalledOnce();
    expect(button("Follow").element.disabled).toBe(true);
    pending.reject({ response: { status: 403 } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Could not update");
    expect(wrapper.get(".follow-counts").text()).toContain("3 followers");
    expect(button("Follow").element.disabled).toBe(false);
    expect(
      dispatch.mock.calls.some(
        ([event]) => event.type === "hub-follow-changed",
      ),
    ).toBe(false);
  });

  it("routes expired-session writes to login without changing counts", async () => {
    mocks.follow.mockRejectedValue({ response: { status: 401 } });
    await mountComponent();
    await button("Follow").trigger("click");
    await flushPromises();
    expect(mocks.router.push).toHaveBeenCalledWith({
      path: "/login",
      query: { return: "/bob?sort=updated" },
    });
    expect(wrapper.get(".follow-counts").text()).toContain("3 followers");
  });

  it("retries unavailable follow information", async () => {
    mocks.getFollowState.mockRejectedValueOnce(new Error("Offline"));
    await mountComponent();
    expect(wrapper.find(".follow-button").exists()).toBe(false);
    await button("Try again").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(button("Follow")).toBeDefined();
  });

  it("discards stale target reads and writes", async () => {
    const initial = deferred();
    mocks.getFollowState.mockReturnValueOnce(initial.promise);
    await mountComponent();
    await wrapper.setProps({ username: "carol" });
    await flushPromises();
    initial.resolve({ data: { ...original, followers_count: 999 } });
    await flushPromises();
    expect(wrapper.text()).not.toContain("999");
    const pending = deferred();
    mocks.follow.mockReturnValue(pending.promise);
    await button("Follow").trigger("click");
    await wrapper.setProps({ username: "dave" });
    await flushPromises();
    pending.resolve({
      data: { ...original, following: true, followers_count: 999 },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("999");
    expect(button("Follow")).toBeDefined();
  });

  it("clears stale identity state and ignores the previous viewer's response", async () => {
    const pending = deferred();
    await mountComponent();
    mocks.follow.mockReturnValue(pending.promise);
    await button("Follow").trigger("click");
    Object.assign(mocks.auth, {
      isAuthenticated: false,
      username: null,
      user: null,
    });
    expect(wrapper.vm.state).toBe(null);
    await flushPromises();
    pending.resolve({
      data: { ...original, following: true, followers_count: 999 },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("999");
    expect(button("Follow")).toBeDefined();
  });

  it.each(["token", "account id"])(
    "clears follow state on same-name %s changes and ignores stale writes",
    async (change) => {
      const pending = deferred();
      const currentRead = deferred();
      const dispatch = vi.spyOn(window, "dispatchEvent");
      await mountComponent();
      mocks.follow.mockReturnValueOnce(pending.promise);
      await button("Follow").trigger("click");
      mocks.getFollowState.mockReturnValueOnce(currentRead.promise);
      if (change === "token") mocks.auth.token = "new-session";
      else mocks.auth.user.id = 2;
      expect(wrapper.vm.state).toBe(null);
      expect(wrapper.vm.writing).toBe(false);
      expect(mocks.getFollowState).toHaveBeenCalledTimes(2);
      currentRead.resolve({ data: { ...original } });
      await flushPromises();
      pending.resolve({
        data: { ...original, following: true, followers_count: 999 },
      });
      await flushPromises();
      expect(wrapper.text()).not.toContain("999");
      expect(button("Follow")).toBeDefined();
      expect(
        dispatch.mock.calls.some(
          ([event]) => event.type === "hub-follow-changed",
        ),
      ).toBe(false);
    },
  );

  it("uses cursor pages and routes users and organizations correctly", async () => {
    mocks.listFollowers.mockResolvedValueOnce({
      data: {
        items: [
          { username: "alex", full_name: "Alex", is_org: false },
          { username: "team", is_org: true },
        ],
        has_more: true,
        next_cursor: "next-page",
      },
    });
    mocks.listFollowers.mockResolvedValueOnce({
      data: {
        items: [{ username: "sam", is_org: false }],
        has_more: false,
        next_cursor: null,
      },
    });
    await mountComponent();
    await button("3 followers").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-scrollbar]").exists()).toBe(true);
    expect(wrapper.findAll("a").map((link) => link.attributes("href"))).toEqual(
      ["/alex", "/organizations/team"],
    );
    const avatars = wrapper.findAllComponents({ name: "EntityAvatar" });
    expect(avatars[0].get("img").attributes("src")).toBe(
      "/api/users/alex/avatar",
    );
    expect(avatars[1].get("img").attributes("src")).toBe(
      "/api/organizations/team/avatar",
    );
    await avatars[0].get("img").trigger("error");
    await avatars[1].get("img").trigger("error");
    expect(avatars[0].text()).toBe("AL");
    expect(avatars[1].text()).toBe("TE");
    await button("Load more").trigger("click");
    await flushPromises();
    expect(mocks.listFollowers).toHaveBeenLastCalledWith("bob", {
      limit: 20,
      cursor: "next-page",
    });
    expect(wrapper.findAll("a")).toHaveLength(3);
    expect(button("Load more")).toBeUndefined();
  });

  it("loads following and retries failed pages without losing prior items", async () => {
    mocks.listFollowing.mockResolvedValueOnce({
      data: {
        items: [{ username: "alex" }],
        has_more: true,
        next_cursor: "cursor",
      },
    });
    mocks.listFollowing.mockRejectedValueOnce(new Error("Offline"));
    await mountComponent();
    await button("2 following").trigger("click");
    await flushPromises();
    await button("Load more").trigger("click");
    await flushPromises();
    expect(wrapper.findAll("a")).toHaveLength(1);
    await button("Try again").trigger("click");
    await flushPromises();
    expect(mocks.listFollowing).toHaveBeenLastCalledWith("bob", {
      limit: 20,
      cursor: "cursor",
    });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("rejects stale dialog pages after a target switch and close", async () => {
    const pending = deferred();
    mocks.listFollowers.mockReturnValueOnce(pending.promise);
    await mountComponent(FollowListDialog, {
      username: "bob",
      modelValue: true,
    });
    await wrapper.setProps({ username: "carol" });
    await flushPromises();
    pending.resolve({
      data: {
        items: [{ username: "stale-user" }],
        has_more: false,
        next_cursor: null,
      },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("stale-user");
    const closing = deferred();
    mocks.listFollowers.mockReturnValueOnce(closing.promise);
    await wrapper.setProps({ username: "dave" });
    await wrapper.setProps({ modelValue: false });
    closing.resolve({
      data: {
        items: [{ username: "closed-user" }],
        has_more: false,
        next_cursor: null,
      },
    });
    await flushPromises();
    expect(wrapper.vm.items).toEqual([]);
  });
});
