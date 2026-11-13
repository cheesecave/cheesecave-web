import { mount } from "@vue/test-utils";
import { h, nextTick, ref, defineComponent, KeepAlive } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Header from "@/components/repo/RepositoryHeader.vue";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

let observers, wrapper, root, resizeObservers, stickyOffset;
const props = {
  repoType: "model",
  namespace: "owner",
  name: "repo",
  namespaceLink: "/owner",
  repoInfo: { private: false },
  activeTab: "files",
  tabs: [{ key: "files", label: "Files", to: "/models/owner/repo/tree/main" }],
};
function open(options = {}) {
  stickyOffset = ref(0);
  root = document.createElement("div");
  root.className = "page-scroll-wrap";
  document.body.append(root);
  wrapper = mount(Header, {
    attachTo: root,
    props: { ...props, ...options.props },
    slots: options.slots,
    global: {
      provide: { repositoryStickyOffset: stickyOffset },
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        AddToCollectionMenu: true,
      },
    },
  });
  return observers.at(-1);
}
async function position(
  observer,
  bottom,
  { top = bottom - 180, intersects = bottom > 0 } = {},
) {
  observer.callback([
    {
      target: wrapper.element,
      isIntersecting: intersects,
      boundingClientRect: { top, bottom, height: 180 },
      rootBounds: { top: 0 },
    },
  ]);
  await nextTick();
}
beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  resizeObservers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
        resizeObservers.push(this);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  wrapper?.unmount();
  root?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("compact repository header", () => {
  it("observes the full header in the actual page scroll container", () => {
    const observer = open();
    expect(observer.options).toMatchObject({ root, threshold: 0 });
    expect(observer.observe).toHaveBeenCalledWith(wrapper.element);
    expect(wrapper.find(".is-compact").exists()).toBe(false);
  });
  it("compacts only after the entire full header has passed the top, keeping the same controls and flow height", async () => {
    const observer = open();
    const link = wrapper.get(".repository-tab").element;
    const action = wrapper.get(
      '[aria-label="Repository actions"] button',
    ).element;
    await position(observer, 1);
    expect(wrapper.find(".is-compact").exists()).toBe(false);
    await position(observer, -1);
    expect(wrapper.get(".repository-header-inner").classes()).toContain(
      "is-compact",
    );
    expect(wrapper.element.style.height).toBe("180px");
    expect(wrapper.get(".repository-tab").element).toBe(link);
    expect(
      wrapper.get('[aria-label="Repository actions"] button').element,
    ).toBe(action);
    expect(
      wrapper.findAll('nav[aria-label="Repository sections"]'),
    ).toHaveLength(1);
    await wrapper
      .get('[aria-label="Repository actions"] button')
      .trigger("click");
    expect(wrapper.emitted("download")).toHaveLength(1);
  });
  it("publishes the measured floating height for other sticky controls and resets it on return", async () => {
    const observer = open();
    let height = 56;
    wrapper.get(".repository-header-inner").element.getBoundingClientRect =
      () => ({ height });
    await position(observer, -1);
    await nextTick();
    expect(stickyOffset.value).toBe(56);
    height = 92;
    resizeObservers.at(-1).callback();
    expect(stickyOffset.value).toBe(92);
    await position(observer, 30);
    await vi.advanceTimersByTimeAsync(250);
    expect(stickyOffset.value).toBe(0);
  });

  it("does not compact a header below the viewport", async () => {
    const observer = open();
    await position(observer, 1100, { top: 920, intersects: false });
    expect(wrapper.find(".is-compact").exists()).toBe(false);
  });
  it("slides up on return, then restores natural flow with no duplicate header", async () => {
    const observer = open();
    await position(observer, -1);
    await position(observer, 30);
    expect(wrapper.get(".repository-header-inner").classes()).toContain(
      "is-returning",
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.find(".is-compact").exists()).toBe(false);
    expect(wrapper.element.style.height).toBe("");
    expect(
      wrapper.findAll('header[aria-label="Repository header"]'),
    ).toHaveLength(1);
  });
  it("finishes the scoped CSS leave animation without waiting for the fallback", async () => {
    const observer = open();
    await position(observer, -1);
    await position(observer, 30);
    const event = new Event("animationend", { bubbles: true });
    Object.defineProperty(event, "animationName", {
      value: "repository-header-out-v-test",
    });
    wrapper.get(".repository-header-inner").element.dispatchEvent(event);
    await nextTick();
    expect(wrapper.find(".is-compact").exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a pending return when scrolling down again", async () => {
    const observer = open();
    await position(observer, -1);
    await position(observer, 30);
    await position(observer, -1);
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.get(".repository-header-inner").classes()).toContain(
      "is-compact",
    );
    expect(wrapper.find(".is-returning").exists()).toBe(false);
  });
  it("retains guest-only actions, disabled tabs and live navigation permissions", async () => {
    const observer = open({
      props: {
        repoInfo: null,
        visibility: "invite",
        tabs: [
          { key: "files", label: "Files", disabledReason: "Access required" },
        ],
      },
      slots: { actions: () => h("button", "End temporary access") },
    });
    await position(observer, -1);
    expect(wrapper.text()).toContain("End temporary access");
    expect(wrapper.text()).not.toContain("Download");
    expect(wrapper.get('[aria-disabled="true"]').text()).toBe("Files");
    await wrapper.setProps({
      tabs: [
        {
          key: "settings",
          label: "Settings",
          to: "/models/owner/repo/settings",
        },
      ],
      activeTab: "settings",
    });
    expect(wrapper.get('nav a[aria-current="page"]').attributes("href")).toBe(
      "/models/owner/repo/settings",
    );
    await wrapper.setProps({ tabs: [] });
    expect(wrapper.find("nav a").exists()).toBe(false);
  });
  it("returns immediately for reduced motion and works without an observer", async () => {
    const observer = open();
    await position(observer, -1);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await position(observer, 30);
    expect(wrapper.find(".is-compact").exists()).toBe(false);
    wrapper.unmount();
    root.remove();
    vi.stubGlobal("IntersectionObserver", undefined);
    open();
    expect(wrapper.find(".is-compact").exists()).toBe(false);
  });
  it("disconnects when cached away and observes again on activation", async () => {
    const showing = ref(true);
    stickyOffset = ref(0);
    root = document.createElement("div");
    root.className = "page-scroll-wrap";
    document.body.append(root);
    wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(KeepAlive, null, {
            default: () => (showing.value ? h(Header, props) : null),
          }),
      }),
      {
        attachTo: root,
        global: {
          provide: { repositoryStickyOffset: stickyOffset },
          stubs: {
            ...ElementPlusStubs,
            RouterLink: RouterLinkStub,
            AddToCollectionMenu: true,
          },
        },
      },
    );
    const first = observers.at(-1);
    await position(first, -1);
    showing.value = false;
    await nextTick();
    expect(first.disconnect).toHaveBeenCalled();
    expect(stickyOffset.value).toBe(0);
    showing.value = true;
    await nextTick();
    expect(observers.at(-1)).not.toBe(first);
    expect(wrapper.find(".is-compact").exists()).toBe(false);
    await position(observers.at(-1), -1);
    expect(wrapper.find(".is-compact").exists()).toBe(true);
  });

  it("disconnects on unmount and ignores queued stale observations", async () => {
    const observer = open();
    wrapper.unmount();
    expect(observer.disconnect).toHaveBeenCalled();
    await position(observer, -1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
