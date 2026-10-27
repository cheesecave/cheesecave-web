import { reactive } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ auth: null }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
import ProfileOwnerActions from "@/components/profile/ProfileOwnerActions.vue";

let wrapper;
beforeEach(() => {
  mocks.auth = reactive({ isAuthenticated: true, username: "bob" });
});
afterEach(() => wrapper?.unmount());

function mountActions(props = {}) {
  wrapper = mount(ProfileOwnerActions, {
    props: { username: "bob", ...props },
    global: {
      stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub },
    },
  });
}

describe("profile owner edit action", () => {
  it("offers the owner only a real Edit profile link to the profile settings tab", () => {
    mountActions();

    expect(wrapper.findAll("a")).toHaveLength(1);
    const link = wrapper.get("a");
    expect(link.text()).toBe("Edit profile");
    expect(link.attributes("href")).toBe("/settings?tab=profile");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("New");
    expect(wrapper.text()).not.toContain("Settings");
  });

  it("hides the edit action in visitor view and restores it when leaving visitor view", async () => {
    mountActions({ visitorView: true });

    expect(wrapper.find("a").exists()).toBe(false);
    await wrapper.setProps({ visitorView: false });
    expect(wrapper.get("a").text()).toBe("Edit profile");
    await wrapper.setProps({ visitorView: true });
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it.each([
    ["anonymous visitor", false, "bob"],
    ["another account", true, "alice"],
  ])(
    "does not offer an edit action to an %s",
    (_label, authenticated, username) => {
      mocks.auth.isAuthenticated = authenticated;
      mocks.auth.username = username;
      mountActions();

      expect(wrapper.find("a").exists()).toBe(false);
      expect(wrapper.find("button").exists()).toBe(false);
    },
  );

  it("updates the owner guard when the viewed profile or signed-in account changes", async () => {
    mountActions();
    expect(wrapper.find("a").exists()).toBe(true);

    await wrapper.setProps({ username: "alice" });
    expect(wrapper.find("a").exists()).toBe(false);
    mocks.auth.username = "alice";
    await wrapper.vm.$nextTick();
    expect(wrapper.get("a").attributes("href")).toBe("/settings?tab=profile");
    mocks.auth.isAuthenticated = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("a").exists()).toBe(false);
  });
});
