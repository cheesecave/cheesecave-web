import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/no/such/page" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import NotFound from "@/pages/[...all].vue";

beforeEach(() => setActivePinia(createPinia()));

describe("catch-all page", () => {
  it("says the page does not exist, with a way home", () => {
    const wrapper = mount(NotFound, {
      global: {
        stubs: {
          ...ElementPlusStubs,
          ElTable: true,
          ElTableColumn: true,
          RouterLink: RouterLinkStub,
        },
      },
    });
    expect(wrapper.get('[data-testid="error-title"]').text()).toBe(
      "Page not found",
    );
    expect(wrapper.text()).toContain("/no/such/page");
    expect(wrapper.find('[data-testid="error-action-home"]').exists()).toBe(
      true,
    );
  });
});
