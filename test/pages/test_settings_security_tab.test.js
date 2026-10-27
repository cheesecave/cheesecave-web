// The account settings page has a Security tab, and the password form is in it.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  authAPI: {
    listTokens: vi.fn(() => Promise.resolve({ data: { tokens: [] } })),
    getAvailableSources: vi.fn(() => Promise.resolve({ data: [] })),
    listExternalTokens: vi.fn(() => Promise.resolve({ data: { tokens: [] } })),
  },
  settingsAPI: {
    whoamiV2: vi.fn(() => Promise.resolve({ data: { name: "alice", orgs: [] } })),
    getUserProfile: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock("@/errors/notify", () => ({ notifyError: vi.fn() }));
vi.mock("vue-router/auto", () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/utils/api", () => ({ authAPI: mocks.authAPI, settingsAPI: mocks.settingsAPI }));

import SettingsPage from "@/pages/settings.vue";
import { useAuthStore } from "@/stores/auth";

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice", email: "a@x.io" };
  localStorage.clear();
});

describe("account settings: Security", () => {
  it("has a Security tab that holds the change-password form", async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          ...ElementPlusStubs,
          ElTabs: { template: "<div><slot /></div>" },
          ElTabPane: {
            props: ["label", "name"],
            template: '<section :data-tab="name" :data-label="label"><slot /></section>',
          },
          ElTable: true,
          ElTableColumn: true,
          RouterLink: RouterLinkStub,
          AvatarUpload: true,
          MarkdownStylePicker: true,
          ChangePasswordForm: { template: '<div data-testid="password-form" />' },
        },
      },
    });
    await flushPromises();

    const tab = wrapper.get('[data-tab="security"]');
    expect(tab.attributes("data-label")).toBe("Security");
    expect(tab.find('[data-testid="password-form"]').exists()).toBe(true);
  });
});
