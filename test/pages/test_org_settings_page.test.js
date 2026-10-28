// The organization settings page: what happens when everything works (test_org_settings_errors covers the failures).

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
  copy: vi.fn(),
  push: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  orgAPI: {
    updateSettings: vi.fn(),
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
  invitationAPI: { create: vi.fn(), list: vi.fn(), delete: vi.fn() },
  settingsAPI: { getOrgProfile: vi.fn() },
  route: { params: { orgname: "acme" } },
}));

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("@/utils/clipboard", () => ({ copyToClipboard: mocks.copy }));
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
  ElMessage: Object.assign(vi.fn(), mocks.message),
  ElMessageBox: { confirm: mocks.confirm },
}));

import OrgSettings from "@/pages/organizations/[orgname]/settings.vue";

const PROFILE = {
  description: "Makers",
  bio: "We make things",
  website: "https://acme.example",
  social_media: {
    twitter_x: "acme",
    threads: "",
    github: "acme",
    huggingface: "",
  },
};
const MEMBERS = [
  { user: "alice", role: "super-admin" },
  { user: "bob", role: "member" },
];
const INVITATIONS = [{ token: "tok1", is_available: true }];

let wrapper;
async function mountPage() {
  wrapper = mount(OrgSettings, {
    global: {
      mocks: { $route: mocks.route, $router: { push: mocks.push } },
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        AvatarUpload: true,
      },
    },
  });
  await flushPromises();
  return wrapper.vm;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue("confirm");
  mocks.copy.mockResolvedValue(true);
  mocks.settingsAPI.getOrgProfile.mockResolvedValue({ data: PROFILE });
  mocks.orgAPI.updateSettings.mockResolvedValue({});
  mocks.orgAPI.listMembers.mockResolvedValue({ data: { members: MEMBERS } });
  mocks.orgAPI.updateMemberRole.mockResolvedValue({});
  mocks.orgAPI.removeMember.mockResolvedValue({});
  mocks.invitationAPI.list.mockResolvedValue({
    data: { invitations: INVITATIONS },
  });
  mocks.invitationAPI.create.mockResolvedValue({
    data: { invitation_link: "https://hub.example/invite/abc" },
  });
  mocks.invitationAPI.delete.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the profile", () => {
  it("is loaded for the organization in the route, and a change to it can be saved", async () => {
    const vm = await mountPage();

    expect(mocks.settingsAPI.getOrgProfile).toHaveBeenCalledWith("acme");
    expect(vm.generalForm.description).toBe("Makers");
    expect(vm.hasGeneralChanges).toBe(false);

    vm.generalForm.description = "";
    vm.generalForm.bio = "";
    vm.generalForm.website = "";
    expect(vm.hasGeneralChanges).toBe(true);
    await vm.saveGeneralSettings();

    expect(mocks.orgAPI.updateSettings).toHaveBeenCalledWith("acme", {
      description: null,
      bio: null,
      website: null,
      social_media: PROFILE.social_media,
    });
    expect(mocks.message.success).toHaveBeenCalledWith(
      "Settings saved successfully",
    );
    expect(mocks.settingsAPI.getOrgProfile).toHaveBeenCalledTimes(2);
  });

  it("falls back to empty fields for a profile that has none", async () => {
    mocks.settingsAPI.getOrgProfile.mockResolvedValue({ data: {} });
    const vm = await mountPage();

    expect(vm.generalForm).toEqual({
      description: "",
      bio: "",
      website: "",
      social_media: { twitter_x: "", threads: "", github: "", huggingface: "" },
    });
  });

  it("takes the typed values of each field", async () => {
    const vm = await mountPage();
    const fields = wrapper.findAll("input:not([disabled]), textarea");
    expect(fields.length).toBeGreaterThanOrEqual(6);
    for (const [index, field] of fields.entries())
      await field.setValue(`v${index}`);

    expect(vm.hasGeneralChanges).toBe(true);
    expect(vm.generalForm.description).toMatch(/^v/);
    expect(vm.generalForm.website).toMatch(/^v/);
    expect(vm.generalForm.social_media.huggingface).toMatch(/^v/);
  });

  it("bumps the avatar's key when one is uploaded or deleted", async () => {
    const vm = await mountPage();
    const before = vm.avatarKey;
    const avatar = wrapper.findComponent({ name: "AvatarUpload" });

    avatar.vm.$emit("uploaded");
    avatar.vm.$emit("deleted");

    expect(vm.avatarKey).toBe(before + 2);
  });
});

describe("the members", () => {
  it("are listed when the page opens, and a role change is saved", async () => {
    const vm = await mountPage();

    expect(vm.members).toEqual(MEMBERS);
    await vm.updateMemberRole("bob", "admin");

    expect(mocks.orgAPI.updateMemberRole).toHaveBeenCalledWith("acme", "bob", {
      role: "admin",
    });
    expect(mocks.message.success).toHaveBeenCalledWith(
      "Updated bob's role to admin",
    );
  });

  it("can be removed after a confirmation, and the list is loaded again", async () => {
    const vm = await mountPage();
    mocks.orgAPI.listMembers.mockClear();

    await vm.removeMember("bob");

    expect(mocks.orgAPI.removeMember).toHaveBeenCalledWith("acme", "bob");
    expect(mocks.message.success).toHaveBeenCalledWith(
      "bob removed successfully",
    );
    expect(mocks.orgAPI.listMembers).toHaveBeenCalledTimes(1);
  });

  it("stay when the confirmation is cancelled, without an error", async () => {
    const vm = await mountPage();
    mocks.confirm.mockRejectedValue("cancel");

    await vm.removeMember("bob");

    expect(mocks.orgAPI.removeMember).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("each have a tag for their role", async () => {
    const vm = await mountPage();
    expect(
      ["super-admin", "admin", "member", "visitor", "other"].map(
        vm.getRoleType,
      ),
    ).toEqual(["danger", "warning", "info", "", ""]);
  });
});

describe("the invitations", () => {
  it("are listed when their tab opens (and not asked for again once there are some)", async () => {
    const vm = await mountPage();
    expect(mocks.invitationAPI.list).not.toHaveBeenCalled();

    vm.activeTab = "invitations";
    await flushPromises();
    expect(vm.invitations).toEqual(INVITATIONS);
    expect(mocks.invitationAPI.list).toHaveBeenCalledTimes(1);

    vm.activeTab = "general";
    await flushPromises();
    vm.activeTab = "invitations";
    await flushPromises();
    expect(mocks.invitationAPI.list).toHaveBeenCalledTimes(1);
  });

  it("asks for the members again when their tab opens and there are none", async () => {
    mocks.orgAPI.listMembers.mockResolvedValue({ data: { members: [] } });
    const vm = await mountPage();
    mocks.orgAPI.listMembers.mockClear();

    vm.activeTab = "members";
    await flushPromises();

    expect(mocks.orgAPI.listMembers).toHaveBeenCalledTimes(1);
  });

  it("need an email for a single-use one", async () => {
    const vm = await mountPage();

    await vm.sendInvitation();

    expect(mocks.message.warning).toHaveBeenCalledWith(
      "Please enter an email address for single-use invitation",
    );
    expect(mocks.invitationAPI.create).not.toHaveBeenCalled();
  });

  it("send a single-use one by email and close the dialog", async () => {
    const vm = await mountPage();
    vm.showInviteDialog = true;
    vm.inviteForm.email = "new@example.com";

    await vm.sendInvitation();

    expect(mocks.invitationAPI.create).toHaveBeenCalledWith("acme", {
      role: "member",
      email: "new@example.com",
    });
    expect(mocks.message.success).toHaveBeenCalledWith(
      "Invitation sent successfully",
    );
    expect(vm.showInviteDialog).toBe(false);
    expect(vm.inviteForm.email).toBe("");
    expect(vm.invitations).toEqual(INVITATIONS);
  });

  it("make a reusable link, keep the dialog open to show it, and copy it", async () => {
    const vm = await mountPage();
    vm.showInviteDialog = true;
    vm.inviteForm.type = "reusable";

    await vm.sendInvitation();

    expect(mocks.invitationAPI.create).toHaveBeenCalledWith("acme", {
      role: "member",
      max_usage: 10,
      expires_days: 7,
    });
    expect(vm.generatedLink).toBe("https://hub.example/invite/abc");
    expect(vm.showInviteDialog).toBe(true);

    await vm.copyGeneratedLink();
    expect(mocks.copy).toHaveBeenCalledWith("https://hub.example/invite/abc");
    expect(mocks.message.success).toHaveBeenCalledWith(
      "Invitation link copied to clipboard",
    );

    mocks.copy.mockResolvedValue(false);
    await vm.copyGeneratedLink();
    expect(mocks.message.error).toHaveBeenCalledWith("Failed to copy link");

    vm.closeInviteDialog();
    expect(vm.generatedLink).toBe("");
    expect(vm.inviteForm.type).toBe("single");
  });

  it("can be copied as a link to their token, or fail to", async () => {
    const vm = await mountPage();

    await vm.copyInvitationLink("tok1");
    expect(mocks.copy).toHaveBeenCalledWith(
      `${window.location.origin}/invite/tok1`,
    );
    expect(mocks.message.success).toHaveBeenCalledWith(
      "Invitation link copied to clipboard",
    );

    mocks.copy.mockResolvedValue(false);
    await vm.copyInvitationLink("tok1");
    expect(mocks.message.error).toHaveBeenCalledWith("Failed to copy link");
  });

  it("can be deleted after a confirmation, or left when it is cancelled", async () => {
    const vm = await mountPage();

    await vm.deleteInvitation("tok1");
    expect(mocks.invitationAPI.delete).toHaveBeenCalledWith("tok1");
    expect(mocks.message.success).toHaveBeenCalledWith("Invitation deleted");

    mocks.invitationAPI.delete.mockClear();
    mocks.confirm.mockRejectedValue("cancel");
    await vm.deleteInvitation("tok1");
    expect(mocks.invitationAPI.delete).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("say why one is unavailable", async () => {
    const vm = await mountPage();
    expect(vm.getInvitationStatus({ is_available: true })).toBe("");
    expect(
      vm.getInvitationStatus({
        is_available: false,
        usage_count: 10,
        max_usage: 10,
      }),
    ).toBe("Maximum usage reached");
    expect(
      vm.getInvitationStatus({ is_available: false, usage_count: 1 }),
    ).toBe("Maximum usage reached");
    expect(
      vm.getInvitationStatus({
        is_available: false,
        usage_count: 0,
        max_usage: 5,
      }),
    ).toBe("Expired or unavailable");
    expect(vm.formatDate("2026-03-04T12:00:00Z")).toBe("Mar 4, 2026");
  });
});

describe("the lists as they are drawn", () => {
  it("changes a member's role from the select next to them, and locks the super-admin's", async () => {
    await mountPage();

    const bob = wrapper.get('[aria-label="Role of bob"]');
    await bob.setValue("admin");
    expect(mocks.orgAPI.updateMemberRole).toHaveBeenCalledWith("acme", "bob", {
      role: "admin",
    });
    expect(
      wrapper.get('[aria-label="Role of alice"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("shows how much of each invitation was used, and why one cannot be", async () => {
    mocks.invitationAPI.list.mockResolvedValue({
      data: {
        invitations: [
          {
            token: "a",
            role: "member",
            created_by: "alice",
            is_available: true,
            is_reusable: true,
            usage_count: 0,
            max_usage: -1,
          },
          {
            token: "b",
            role: "member",
            created_by: "alice",
            is_available: true,
            is_reusable: true,
            usage_count: 2,
            max_usage: 5,
          },
          {
            token: "c",
            role: "admin",
            created_by: "alice",
            is_available: true,
            is_reusable: true,
            usage_count: 1,
          },
          {
            token: "d",
            role: "member",
            created_by: "alice",
            is_available: false,
            usage_count: 1,
          },
          {
            token: "e",
            role: "member",
            created_by: "alice",
            is_available: true,
            usage_count: 1,
          },
        ],
      },
    });
    const vm = await mountPage();
    vm.activeTab = "invitations";
    await flushPromises();

    const text = wrapper.text().replace(/\s+/g, " ");
    expect(text).toContain("Usage: 0 / \u221e");
    expect(text).toContain("Usage: 2 / 5");
    expect(text).toContain("Usage: 1 / 1");
    expect(text).toContain("Maximum usage reached");
    expect(text).toContain("✓ Used 1 time");
    expect(text).not.toContain("✓ Used 1 times");
  });

  it("has a button that opens the invitation dialog", async () => {
    const vm = await mountPage();
    const open = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Invite"));

    await open.trigger("click");

    expect(vm.showInviteDialog).toBe(true);
  });
});

describe("the generated link", () => {
  it("says how often it can be used", async () => {
    const vm = await mountPage();
    vm.showInviteDialog = true;
    vm.inviteForm.type = "reusable";
    vm.inviteForm.max_usage = 10;
    await vm.sendInvitation();
    await flushPromises();
    expect(wrapper.text().replace(/\s+/g, " ")).toContain("Usage: 0 / 10");

    vm.inviteForm.max_usage = -1;
    await flushPromises();
    expect(wrapper.text().replace(/\s+/g, " ")).toContain("Usage: 0 / \u221e");
    expect(wrapper.find('[role="img"][aria-label="No limit"]').exists()).toBe(
      true,
    );
  });

  it('offers "\u221e No limit" first in the list of maximum usages', async () => {
    const vm = await mountPage();
    vm.showInviteDialog = true;
    vm.inviteForm.type = "reusable";
    await flushPromises();

    const options = wrapper.findAll("option").map((option) => option.text());
    expect(options).toContain("\u221e No limit");
    expect(options).toContain("1 use");
  });
});
