import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";

import RouteBoundary from "@/components/common/RouteBoundary.vue";

const Boom = defineComponent({
  setup() {
    throw new Error("render failed");
  },
});
const Fine = defineComponent({ setup: () => () => h("p", "all good") });
const ErrorStateStub = defineComponent({
  props: ["error", "context"],
  setup: (props) => () =>
    h("div", { "data-testid": "boundary-error" }, props.error.kind),
});

const mountBoundary = (child) =>
  mount(RouteBoundary, {
    slots: { default: () => h(child) },
    global: {
      stubs: { ErrorState: ErrorStateStub },
      config: { errorHandler: () => {} },
    },
  });

describe("RouteBoundary", () => {
  it("renders the page when nothing is wrong", () => {
    expect(mountBoundary(Fine).text()).toBe("all good");
  });

  it("shows a decoded bug state, not a blank page, when a page throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mountBoundary(Boom);
    await nextTick();
    expect(wrapper.get('[data-testid="boundary-error"]').text()).toBe("bug");
  });

  it("leaves the page alone when only an event handler throws, and passes the error on", async () => {
    const reported = [];
    const Clicky = defineComponent({
      setup: () => () =>
        h(
          "button",
          {
            onClick: () => {
              throw new Error("handler failed");
            },
          },
          "go",
        ),
    });
    const wrapper = mount(RouteBoundary, {
      slots: { default: () => h(Clicky) },
      global: {
        stubs: { ErrorState: ErrorStateStub },
        config: { errorHandler: (err) => reported.push(err.message) },
      },
    });
    await wrapper.get("button").trigger("click");
    expect(wrapper.find('[data-testid="boundary-error"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("go");
    expect(reported).toEqual(["handler failed"]);
  });

  it("clears the failure when the route changes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const page = shallowRef(Boom);
    const wrapper = mount(RouteBoundary, {
      props: { routeKey: "/a" },
      slots: { default: () => h(page.value) },
      global: { stubs: { ErrorState: ErrorStateStub } },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="boundary-error"]').exists()).toBe(true);
    page.value = Fine;
    await wrapper.setProps({ routeKey: "/b" });
    expect(wrapper.find('[data-testid="boundary-error"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("all good");
  });
});
