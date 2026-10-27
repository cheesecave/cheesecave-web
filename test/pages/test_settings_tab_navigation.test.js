import { h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: null,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authAPI: {
    listTokens: vi.fn(async () => ({ data: { tokens: [] } })),
    getAvailableSources: vi.fn(async () => ({ data: [] })),
  },
  settingsAPI: {
    whoamiV2: vi.fn(async () => ({ data: { name: "alice", orgs: [] } })),
    getUserProfile: vi.fn(async () => ({ data: { full_name: "Alice" } })),
  },
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/utils/api", () => ({
  authAPI: mocks.authAPI,
  settingsAPI: mocks.settingsAPI,
}));

import SettingsPage from "@/pages/settings.vue";
import { useAuthStore } from "@/stores/auth";

const tabs = ["profile", "security", "appearance", "external-tokens", "tokens"];
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice", email: "alice@example.test" };
  mocks.route = reactive({ path: "/settings", params: {}, query: {} });
});
afterEach(() => wrapper?.unmount());

async function mountPage(tab) {
  if (tab !== undefined) mocks.route.query.tab = tab;
  wrapper = mount(SettingsPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTabs: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          setup:
            (props, { emit, slots }) =>
            () =>
              h("div", { "data-active-tab": props.modelValue }, [
                ...tabs.map((name) =>
                  h(
                    "button",
                    {
                      type: "button",
                      "data-select-tab": name,
                      onClick: () => emit("update:modelValue", name),
                    },
                    name,
                  ),
                ),
                slots.default?.(),
              ]),
        },
        ElTabPane: { template: "<section><slot /></section>" },
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        AvatarUpload: true,
        MarkdownStylePicker: true,
        ChangePasswordForm: true,
      },
    },
  });
  await flushPromises();
}

const selectedTab = () =>
  wrapper.get("[data-active-tab]").attributes("data-active-tab");

describe("settings tab links", () => {
  it.each(tabs)("opens the %s tab from its link", async (tab) => {
    await mountPage(tab);
    expect(selectedTab()).toBe(tab);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "unknown", ["security"], []])(
    "opens Profile for an absent or invalid tab (%j)",
    async (tab) => {
      await mountPage(tab);
      expect(selectedTab()).toBe("profile");
      expect(mocks.router.replace).not.toHaveBeenCalled();
    },
  );

  it("follows a new tab query without reloading the form or losing its draft", async () => {
    await mountPage("security");
    const profileLoads = mocks.settingsAPI.getUserProfile.mock.calls.length;
    await wrapper
      .get('input[placeholder="Your full name"]')
      .setValue("Unsaved draft");

    mocks.route.query.tab = "profile";
    await flushPromises();
    expect(selectedTab()).toBe("profile");
    expect(
      wrapper.get('input[placeholder="Your full name"]').element.value,
    ).toBe("Unsaved draft");
    expect(mocks.settingsAPI.getUserProfile).toHaveBeenCalledTimes(
      profileLoads,
    );

    mocks.route.query.tab = "appearance";
    await flushPromises();
    expect(selectedTab()).toBe("appearance");
    mocks.route.query.tab = ["security"];
    await flushPromises();
    expect(selectedTab()).toBe("profile");
    mocks.route.query.tab = "tokens";
    await flushPromises();
    expect(selectedTab()).toBe("tokens");
    delete mocks.route.query.tab;
    await flushPromises();
    expect(selectedTab()).toBe("profile");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("keeps manual tab selection usable without changing the URL", async () => {
    await mountPage("profile");
    await wrapper.get('[data-select-tab="security"]').trigger("click");
    expect(selectedTab()).toBe("security");
    mocks.route.query.from = "profile";
    await flushPromises();
    expect(selectedTab()).toBe("security");
    expect(mocks.route.query.tab).toBe("profile");
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
