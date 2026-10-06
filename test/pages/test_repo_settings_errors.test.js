// A settings page whose data did not load must say why, offer a retry, and
// refuse to save defaults over the real settings.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  push: vi.fn(),
  msg: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  box: { confirm: vi.fn(), prompt: vi.fn() },
  repoAPI: { getInfo: vi.fn(), delete: vi.fn() },
  settingsAPI: {
    getSiteConfig: vi.fn(),
    updateRepoSettings: vi.fn(),
    moveRepo: vi.fn(),
    squashRepo: vi.fn(),
    createBranch: vi.fn(),
    createTag: vi.fn(),
    getLfsSettings: vi.fn(),
  },
  quotaAPI: {
    getRepoQuota: vi.fn(),
    recalculateRepoStorage: vi.fn(),
    setRepoQuota: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { type: "model", namespace: "acme", name: "demo" },
  }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { username: "alice" } }),
}));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("@/utils/api", () => ({
  repoAPI: mocks.repoAPI,
  settingsAPI: mocks.settingsAPI,
  quotaAPI: mocks.quotaAPI,
  validationAPI: {},
}));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(
    vi.fn(() => ({ close: vi.fn() })),
    mocks.msg,
  ),
  ElMessageBox: mocks.box,
}));

import SettingsPage from "@/pages/[type]s/[namespace]/[name]/settings.vue";

const down = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const cancelled = () => new DOMException("a", "AbortError");
const QUOTA = {
  quota_bytes: 2_000_000_000,
  namespace_available_bytes: 5_000_000_000,
  effective_quota_bytes: 2_000_000_000,
};
const LFS = {
  server_defaults: {},
  lfs_threshold_bytes: null,
  lfs_keep_versions: null,
  lfs_suffix_rules: ["a", " "],
};

const mountPage = async () => {
  const wrapper = mount(SettingsPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
  await flushPromises();
  return wrapper;
};
const title = (w) => w.get('[data-testid="error-title"]').text();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.repoAPI.getInfo.mockResolvedValue({ data: { private: true } });
  mocks.settingsAPI.getSiteConfig.mockResolvedValue({
    data: { capabilities: { repository_operations: { squash: true } } },
  });
  mocks.settingsAPI.getLfsSettings.mockResolvedValue({ data: LFS });
  mocks.quotaAPI.getRepoQuota.mockResolvedValue({ data: QUOTA });
  mocks.box.confirm.mockResolvedValue();
  mocks.box.prompt.mockResolvedValue();
});

describe("repo settings load failures", () => {
  it("shows why the repository did not load, saves nothing, and recovers on retry", async () => {
    mocks.repoAPI.getInfo.mockRejectedValueOnce(down(503));
    const wrapper = await mountPage();
    expect(title(wrapper)).toBe("Service unavailable");

    await wrapper.vm.saveGeneralSettings();
    expect(mocks.msg.warning).toHaveBeenCalledWith(
      expect.stringContaining("still loading"),
    );
    expect(mocks.settingsAPI.updateRepoSettings).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    await wrapper.vm.saveGeneralSettings();
    expect(mocks.settingsAPI.updateRepoSettings).toHaveBeenCalledWith(
      "model",
      "acme",
      "demo",
      {
        private: true,
      },
    );
  });

  it("shows nothing for a cancelled repository load", async () => {
    mocks.repoAPI.getInfo.mockRejectedValueOnce(cancelled());
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("shows the quota failure, retries, and refuses to save without data", async () => {
    mocks.quotaAPI.getRepoQuota.mockRejectedValueOnce(down(500));
    const wrapper = await mountPage();
    wrapper.vm.activeTab = "quota";
    await flushPromises();
    expect(title(wrapper)).toBe("Something went wrong on the server");
    await wrapper.vm.saveQuotaSettings();
    expect(mocks.quotaAPI.setRepoQuota).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(wrapper.vm.quotaSettings.mode).toBe("custom");
  });

  it("shows the LFS failure, retries, and refuses to save without data", async () => {
    mocks.settingsAPI.getLfsSettings.mockRejectedValueOnce(down(503));
    const wrapper = await mountPage();
    wrapper.vm.activeTab = "lfs";
    await flushPromises();
    expect(title(wrapper)).toBe("Service unavailable");
    await wrapper.vm.saveLfsSettings();
    expect(mocks.settingsAPI.updateRepoSettings).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });
});

describe("repo settings action failures", () => {
  const fallback = (text) =>
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
      fallback: text,
    });

  it("update settings", async () => {
    const wrapper = await mountPage();
    mocks.settingsAPI.updateRepoSettings.mockRejectedValueOnce(down(500));
    await wrapper.vm.saveGeneralSettings();
    fallback("Failed to update settings");
  });

  it("move repository (and stays quiet on cancel)", async () => {
    const wrapper = await mountPage();
    wrapper.vm.moveToRepo = "acme/other";
    mocks.settingsAPI.moveRepo.mockRejectedValueOnce(down(409));
    await wrapper.vm.handleMoveRepo();
    fallback("Failed to move repository");
    mocks.notify.mockClear();
    mocks.box.confirm.mockRejectedValueOnce("cancel");
    await wrapper.vm.handleMoveRepo();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("squash repository (and stays quiet on cancel/close)", async () => {
    const wrapper = await mountPage();
    mocks.settingsAPI.squashRepo.mockRejectedValueOnce(down(500));
    await wrapper.vm.handleSquashRepo();
    fallback("Failed to squash repository");
    mocks.notify.mockClear();
    mocks.box.confirm.mockRejectedValueOnce("close");
    await wrapper.vm.handleSquashRepo();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("delete repository (and stays quiet on cancel)", async () => {
    const wrapper = await mountPage();
    mocks.repoAPI.delete.mockRejectedValueOnce(down(500));
    await wrapper.vm.handleDeleteRepo();
    fallback("Failed to delete repository");
    mocks.notify.mockClear();
    mocks.box.confirm.mockRejectedValueOnce("cancel");
    await wrapper.vm.handleDeleteRepo();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("create branch and tag", async () => {
    const wrapper = await mountPage();
    wrapper.vm.newBranch = { name: "b", revision: "" };
    mocks.settingsAPI.createBranch.mockRejectedValueOnce(down(500));
    await wrapper.vm.handleCreateBranch();
    fallback("Failed to create branch");
    wrapper.vm.newTag = { name: "t", revision: "", message: "" };
    mocks.settingsAPI.createTag.mockRejectedValueOnce(down(500));
    await wrapper.vm.handleCreateTag();
    fallback("Failed to create tag");
  });

  it("recalculate storage and save quota", async () => {
    const wrapper = await mountPage();
    wrapper.vm.activeTab = "quota";
    await flushPromises();
    mocks.quotaAPI.recalculateRepoStorage.mockRejectedValueOnce(down(500));
    await wrapper.vm.handleRecalculateStorage();
    fallback("Failed to recalculate storage");
    mocks.quotaAPI.setRepoQuota.mockRejectedValueOnce(down(500));
    await wrapper.vm.saveQuotaSettings();
    fallback("Failed to save quota settings");
  });

  it("save LFS settings", async () => {
    const wrapper = await mountPage();
    wrapper.vm.activeTab = "lfs";
    await flushPromises();
    mocks.settingsAPI.updateRepoSettings.mockRejectedValueOnce(down(500));
    await wrapper.vm.saveLfsSettings();
    fallback("Failed to save LFS settings");
  });
});
