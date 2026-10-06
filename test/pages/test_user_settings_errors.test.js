// The account settings page reports failed saves through notifyError.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => {
  const boom = () => Promise.reject(new Error("boom"));
  return {
    notify: vi.fn(),
    prompt: vi.fn(),
    authAPI: {
      listTokens: vi.fn(boom),
      getAvailableSources: vi.fn(boom),
      addExternalToken: vi.fn(boom),
    },
    settingsAPI: {
      whoamiV2: vi.fn(boom),
      updateUserSettings: vi.fn(boom),
      getUserProfile: vi.fn(boom),
    },
  };
});

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/utils/api", () => ({
  authAPI: mocks.authAPI,
  settingsAPI: mocks.settingsAPI,
}));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
  ElMessageBox: { confirm: vi.fn(), prompt: mocks.prompt },
}));

import SettingsPage from "@/pages/settings.vue";
import { useAuthStore } from "@/stores/auth";

const source = { name: "HF", url: "https://hf.example" };
const expectFallback = (fallback) =>
  expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), { fallback });

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice", email: "a@x.io" };
  vi.clearAllMocks();
  localStorage.clear();
  mocks.prompt.mockResolvedValue({ value: "secret" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const mountPage = () =>
  mount(SettingsPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        AvatarUpload: true,
      },
    },
  });
const httpFailure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });

describe("account settings failures", () => {
  it("reports a profile that could not be saved", async () => {
    mocks.settingsAPI.getUserProfile.mockResolvedValueOnce({ data: {} });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.vm.updateProfile();
    expectFallback("Failed to update profile");
  });

  it("says which lists could not be loaded", async () => {
    mountPage();
    await flushPromises();
    expectFallback("Failed to load tokens");
    expectFallback("Failed to load organizations");
    expectFallback("Failed to load available sources");
  });

  describe("when the profile did not load", () => {
    it("shows why instead of a form of blanks, and refuses to save over the real profile", async () => {
      mocks.settingsAPI.getUserProfile.mockRejectedValueOnce(httpFailure(503));
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.get('[data-testid="error-title"]').text()).toBe(
        "Service unavailable",
      );
      expect(wrapper.find("input[disabled]").exists()).toBe(false);
      await wrapper.vm.updateProfile();
      expect(mocks.settingsAPI.updateUserSettings).not.toHaveBeenCalled();
      expect(wrapper.vm.profileReady).toBe(false);
    });

    it("shows the form again, with the real profile, after a retry", async () => {
      mocks.settingsAPI.getUserProfile
        .mockRejectedValueOnce(httpFailure(503))
        .mockResolvedValueOnce({ data: { full_name: "Alice A" } });
      const wrapper = mountPage();
      await flushPromises();
      await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
      await flushPromises();
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
      expect(wrapper.vm.profileForm.full_name).toBe("Alice A");
    });

    it("shows nothing for a load that was cancelled", async () => {
      mocks.settingsAPI.getUserProfile.mockRejectedValueOnce(
        new DOMException("a", "AbortError"),
      );
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    });
  });

  it("reports an external token that could not be added or updated", async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
          AvatarUpload: true,
        },
      },
    });
    await flushPromises();
    await wrapper.vm.startAddToken(source);
    expectFallback("Failed to add token");
    await wrapper.vm.startEditToken(source);
    expectFallback("Failed to update token");
  });
});
