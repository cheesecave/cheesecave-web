import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterLinkStub } from "../helpers/vue";
const mocks = vi.hoisted(() => ({ auth: null, notify: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/errors", () => ({ notifyError: mocks.notify }));
import Link from "@/components/repo/RepositoryGuestRegistrationLink.vue";
import { readRepositoryRegistration } from "@/utils/repository-registration";

const repository = { type: "model", namespace: "owner", name: "demo" };
const mountLink = (
  access = { access: "guest", registration_repository_id: 7 },
) =>
  mount(Link, {
    props: { repository, access },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.auth = reactive({ isAuthenticated: false });
});
describe("guest registration link", () => {
  it.each([
    {},
    { access: "invite", registration_repository_id: 7 },
    { access: "guest" },
    { access: "guest", registration_repository_id: "7" },
    { access: "guest", registration_repository_id: -1 },
  ])("does not offer unavailable registration: %j", (access) => {
    const wrapper = mountLink(access);
    expect(wrapper.find("a").exists()).toBe(false);
    wrapper.unmount();
  });
  it("hides account creation when a normal account is already signed in", async () => {
    const wrapper = mountLink();
    expect(wrapper.get("a").text()).toBe("Sign Up");
    mocks.auth.isAuthenticated = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("a").exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(["click", "auxclick", "contextmenu"])(
    "stages a nonsecret continuation on %s and changes context between repositories",
    async (event) => {
      const wrapper = mountLink();
      // RouterLinkStub has no router to consume ordinary anchor navigation.
      wrapper.element.addEventListener("click", (event) =>
        event.preventDefault(),
      );
      let target = JSON.parse(wrapper.get("a").attributes("href"));
      await wrapper.get("a").trigger(event);
      expect(
        readRepositoryRegistration(target.query.repository_invitation),
      ).toEqual({ guestRepositoryId: 7, repositoryPath: "/models/owner/demo" });
      const oldId = target.query.repository_invitation;
      await wrapper.setProps({
        repository: { ...repository, type: "dataset", name: "other" },
        access: { access: "guest", registration_repository_id: 8 },
      });
      target = JSON.parse(wrapper.get("a").attributes("href"));
      expect(target.query.repository_invitation).not.toBe(oldId);
      await wrapper.get("a").trigger(event);
      expect(
        readRepositoryRegistration(target.query.repository_invitation),
      ).toEqual({
        guestRepositoryId: 8,
        repositoryPath: "/datasets/owner/other",
      });
      wrapper.unmount();
    },
  );
  it("prevents navigation when browser storage cannot carry the continuation", () => {
    const wrapper = mountLink();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    wrapper.get("a").element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.notify).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
