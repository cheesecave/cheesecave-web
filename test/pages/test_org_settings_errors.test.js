// Every failure on the organization settings pages is reported through
// notifyError, with what was being attempted as the fallback.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => {
  const boom = () => Promise.reject(new Error("boom"));
  return {
    boom,
    notify: vi.fn(),
    confirm: vi.fn(),
    push: vi.fn(),
    orgAPI: {
      get: vi.fn(boom),
      create: vi.fn(boom),
      updateSettings: vi.fn(boom),
      listMembers: vi.fn(boom),
      addMember: vi.fn(boom),
      updateMemberRole: vi.fn(boom),
      removeMember: vi.fn(boom),
    },
    invitationAPI: {
      create: vi.fn(boom),
      list: vi.fn(boom),
      delete: vi.fn(boom),
    },
    settingsAPI: { getOrgProfile: vi.fn(boom) },
    route: { params: { org: "acme", orgname: "acme" } },
  };
});

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/utils/api", () => ({
  orgAPI: mocks.orgAPI,
  invitationAPI: mocks.invitationAPI,
  settingsAPI: mocks.settingsAPI,
}));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
  ElMessageBox: { confirm: mocks.confirm },
}));

import OrgSettings from "@/pages/organizations/[org]/settings.vue";
import LegacyOrgSettings from "@/pages/organizations/[orgname]/settings.vue";
import { useAuthStore } from "@/stores/auth";

const mountPage = (page) =>
  mount(page, {
    global: {
      mocks: {
        $route: mocks.route,
        $router: { push: mocks.push, back: vi.fn() },
      },
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        AvatarUpload: true,
      },
    },
  });
const expectFallback = (fallback) =>
  expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), { fallback });

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice" };
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue("confirm");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("organization settings (by org)", () => {
  it("refuses to save over a profile that did not load", async () => {
    const wrapper = mountPage(OrgSettings);
    await flushPromises();
    await wrapper.vm.saveGeneralSettings();
    expect(mocks.orgAPI.updateSettings).not.toHaveBeenCalled();
  });

  it("reports each failed load and write", async () => {
    const wrapper = mountPage(OrgSettings);
    await flushPromises();
    expectFallback("Failed to load organization profile");

    mocks.settingsAPI.getOrgProfile.mockResolvedValueOnce({ data: {} });
    await wrapper.vm.loadOrgProfile();
    await wrapper.vm.saveGeneralSettings();
    expectFallback("Failed to save settings");

    await wrapper.vm.loadMembers();
    expectFallback("Failed to load members");

    await wrapper.vm.updateMemberRole("bob", "admin");
    expectFallback("Failed to update role");

    await wrapper.vm.removeMember("bob");
    expectFallback("Failed to remove member");

    wrapper.vm.inviteForm.email = "x@y.io";
    await wrapper.vm.sendInvitation();
    expectFallback("Failed to send invitation");

    await wrapper.vm.loadInvitations();
    expectFallback("Failed to load invitations");

    await wrapper.vm.deleteInvitation("tok");
    expectFallback("Failed to delete invitation");
  });

  it("stays quiet when the user cancels a confirmation", async () => {
    const wrapper = mountPage(OrgSettings);
    await flushPromises();
    mocks.notify.mockClear();
    mocks.confirm.mockRejectedValue("cancel");
    await wrapper.vm.removeMember("bob");
    await wrapper.vm.deleteInvitation("tok");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe("organization settings (by orgname)", () => {
  it("refuses to save over a description that did not load", async () => {
    const wrapper = mountPage(LegacyOrgSettings);
    await flushPromises();
    await wrapper.vm.saveGeneralSettings();
    expect(mocks.orgAPI.updateSettings).not.toHaveBeenCalled();
  });

  it("reports each failed load and write", async () => {
    const wrapper = mountPage(LegacyOrgSettings);
    await flushPromises();
    expectFallback("Failed to load organization information");
    expectFallback("Failed to load members");

    mocks.orgAPI.get.mockResolvedValueOnce({ data: { description: "d" } });
    await wrapper.vm.loadOrgInfo();
    await wrapper.vm.saveGeneralSettings();
    expectFallback("Failed to update settings");

    wrapper.vm.newMember.username = "carol";
    await wrapper.vm.handleAddMember();
    expectFallback("Failed to add member");

    await wrapper.vm.handleUpdateRole({ user: "bob", role: "member" }, "admin");
    expectFallback("Failed to update role");

    await wrapper.vm.handleRemoveMember({ user: "bob" });
    expectFallback("Failed to remove member");
  });

  it("stays quiet when the user cancels removing a member", async () => {
    const wrapper = mountPage(LegacyOrgSettings);
    await flushPromises();
    mocks.notify.mockClear();
    mocks.confirm.mockRejectedValue("cancel");
    await wrapper.vm.handleRemoveMember({ user: "bob" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
