import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouterLinkStub } from "../helpers/vue";
import SessionBanner from "@/components/common/SessionBanner.vue";
import { useAuthStore } from "@/stores/auth";

const route = { fullPath: "/alice/repo?tab=files" };
let auth;
const mountBanner = () =>
  mount(SessionBanner, {
    global: {
      stubs: { RouterLink: RouterLinkStub },
      mocks: { $route: route },
      provide: {},
    },
  });

vi.mock("vue-router", () => ({ useRoute: () => route }));

beforeEach(() => {
  setActivePinia(createPinia());
  auth = useAuthStore();
});

describe("SessionBanner", () => {
  it("shows nothing while the session is fine", () => {
    expect(mountBanner().find('[data-testid="session-banner"]').exists()).toBe(
      false,
    );
  });

  it("says the session ended and offers to sign in, coming back here", () => {
    auth.sessionExpired = true;
    const wrapper = mountBanner();
    const banner = wrapper.get('[data-testid="session-banner"]');
    expect(banner.attributes("role")).toBe("status");
    expect(banner.text()).toContain("session has ended");
    expect(wrapper.getComponent(RouterLinkStub).props("to")).toBe(
      "/login?return=%2Falice%2Frepo%3Ftab%3Dfiles",
    );
  });

  it("says the sign-in could not be checked, and checks again on Retry", async () => {
    auth.verifyError = new Error("down");
    auth.retryVerify = vi.fn(async () => {});
    const wrapper = mountBanner();
    expect(wrapper.text()).toContain("couldn't check whether you're signed in");
    await wrapper.get('[data-testid="session-retry"]').trigger("click");
    await flushPromises();
    expect(auth.retryVerify).toHaveBeenCalled();
  });
});
