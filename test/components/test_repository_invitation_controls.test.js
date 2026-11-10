import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ auth: null, getRequest: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repositoryAccessAPI: { getRequest: mocks.getRequest },
  collectionsAPI: {},
}));
import Invitation from "@/components/repo/RepositoryInvitationPage.vue";

const repository = { type: "model", namespace: "owner", name: "demo" };
const action = (wrapper, name) =>
  wrapper.findAll("button").find((button) => button.text() === name);
const mountInvitation = () =>
  mount(Invitation, {
    props: {
      repository,
      access: { visibility: "invite", invite_markdown: "# Join" },
    },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });

describe("invitation controls follow application state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.auth = reactive({ isAuthenticated: false, username: null });
    mocks.getRequest.mockResolvedValue({ data: { request: null } });
  });

  it.each([false, true])(
    "hides application-only controls before applying (signed in: %s)",
    async (signedIn) => {
      mocks.auth.isAuthenticated = signedIn;
      const wrapper = mountInvitation();
      await flushPromises();
      expect(action(wrapper, "Submit application")).toBeDefined();
      expect(action(wrapper, "Refresh application status")).toBeUndefined();
      expect(action(wrapper, "Check approved access")).toBeUndefined();
      expect(
        wrapper.find('[aria-label="Repository invitation code"]').exists(),
      ).toBe(false);
      expect(action(wrapper, "Bind to my account")).toBeUndefined();
      expect(action(wrapper, "Open temporary web preview")).toBeUndefined();
      wrapper.unmount();
    },
  );

  it.each([false, true])(
    "opens code actions only in the invitation dialog (signed in: %s)",
    async (signedIn) => {
      mocks.auth.isAuthenticated = signedIn;
      const wrapper = mountInvitation();
      await action(wrapper, "Repository invitation").trigger("click");
      expect(
        wrapper.find('[data-el-dialog="Repository invitation"]').exists(),
      ).toBe(true);
      expect(
        wrapper.get('input[aria-label="Repository invitation code"]'),
      ).toBeDefined();
      expect(Boolean(action(wrapper, "Bind to my account"))).toBe(signedIn);
      expect(action(wrapper, "Open temporary web preview")).toBeDefined();
      wrapper.unmount();
    },
  );

  it("shows refresh only for an actual pending request and hides duplicate application submission", async () => {
    mocks.getRequest.mockResolvedValue({
      data: { request: { status: "pending" } },
    });
    const wrapper = mountInvitation();
    await flushPromises();
    expect(action(wrapper, "Refresh application status")).toBeDefined();
    expect(action(wrapper, "Submit application")).toBeUndefined();
    expect(wrapper.find('[aria-label="Application email"]').exists()).toBe(
      false,
    );
    expect(action(wrapper, "Check approved access")).toBeUndefined();
    wrapper.unmount();
  });

  it.each([false, true])(
    "offers approved-account recheck only to signed-in approved applicants (%s)",
    async (signedIn) => {
      mocks.auth.isAuthenticated = signedIn;
      mocks.getRequest.mockResolvedValue({
        data: { request: { status: "approved" } },
      });
      const wrapper = mountInvitation();
      await flushPromises();
      expect(Boolean(action(wrapper, "Check approved access"))).toBe(signedIn);
      expect(action(wrapper, "Submit application")).toBeUndefined();
      wrapper.unmount();
    },
  );

  it("clears the invitation secret on dialog close and repository change", async () => {
    const wrapper = mountInvitation();
    await action(wrapper, "Repository invitation").trigger("click");
    await wrapper
      .get('input[aria-label="Repository invitation code"]')
      .setValue("private-code");
    wrapper
      .findComponent({ name: "ElDialog" })
      .vm.$emit("update:modelValue", false);
    await flushPromises();
    await action(wrapper, "Repository invitation").trigger("click");
    expect(
      wrapper.get('input[aria-label="Repository invitation code"]').element
        .value,
    ).toBe("");
    await wrapper
      .get('input[aria-label="Repository invitation code"]')
      .setValue("other-code");
    await wrapper.setProps({ repository: { ...repository, name: "other" } });
    expect(wrapper.find("[data-el-dialog]").exists()).toBe(false);
    wrapper.unmount();
  });
});
