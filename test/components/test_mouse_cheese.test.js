import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MouseCheese from "../../src/shared/components/MouseCheese.vue";
import mouseCheeseSource from "../../src/shared/components/MouseCheese.vue?raw";

describe("homepage mouse animation", () => {
  const wrappers = [];
  let motionQuery;

  beforeEach(() => {
    vi.useFakeTimers();
    motionQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => motionQuery),
    );
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.useRealTimers();
  });

  async function mountArt(props = {}) {
    const wrapper = mount(MouseCheese, { props });
    wrappers.push(wrapper);
    await nextTick();
    return wrapper;
  }

  it("plays once on mount and settles to the finished artwork", async () => {
    const wrapper = await mountArt();
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(wrapper.get("svg").classes()).toContain("mouse-cheese-combined-svg");
    expect(wrapper.get("svg style").text()).toContain(
      "mouse-cheese-combined-rustle",
    );
    expect(wrapper.get("svg style").text()).toContain("--p2m-duration: 4000ms");
    expect(wrapper.classes()).not.toContain("static-frame");
    await vi.advanceTimersByTimeAsync(3999);
    expect(wrapper.classes()).not.toContain("static-frame");
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.classes()).toContain("static-frame");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the completed static frame when the administrator disables animation", async () => {
    const wrapper = await mountArt({ animated: false });
    expect(wrapper.classes()).toContain("static-frame");
    expect(wrapper.find("svg").exists()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves artwork transforms when the animation settles", async () => {
    // Vitest omits SFC styles; load the component's deep rules into jsdom.
    // Native browsers also apply the SVG's presentation transforms, checked in
    // the browser review. Here we catch CSS overrides of those transforms.
    const style = document.createElement("style");
    style.textContent = mouseCheeseSource
      .match(/<style scoped>([\s\S]*?)<\/style>/)[1]
      .replace(/:deep\(([^)]+)\)/g, "$1");
    document.head.appendChild(style);
    const wrapper = mount(MouseCheese, { attachTo: document.body });
    wrappers.push(wrapper);
    try {
      await nextTick();
      const pores = wrapper.findAll('[id$="cheese-pores"] ellipse');
      expect(pores.length).toBe(4);
      const before = pores.map(
        (pore) => getComputedStyle(pore.element).transform,
      );
      await vi.advanceTimersByTimeAsync(4000);
      expect(wrapper.classes()).toContain("static-frame");
      expect(
        pores.map((pore) => getComputedStyle(pore.element).transform),
      ).toEqual(before);
    } finally {
      style.remove();
    }
  });

  it("remounts the SVG to restart when animation is enabled again", async () => {
    const wrapper = await mountArt({ animated: false });
    const firstSvg = wrapper.get("svg").element;
    await wrapper.setProps({ animated: true });
    expect(wrapper.get("svg").element).not.toBe(firstSvg);
    expect(wrapper.classes()).not.toContain("static-frame");
    await wrapper.setProps({ animated: false });
    expect(wrapper.classes()).toContain("static-frame");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors reduced motion on mount and changes to the preference", async () => {
    motionQuery.matches = true;
    const wrapper = await mountArt();
    expect(wrapper.classes()).toContain("static-frame");
    expect(vi.getTimerCount()).toBe(0);
    const listener = motionQuery.addEventListener.mock.calls[0][1];
    listener({ matches: false });
    await nextTick();
    expect(wrapper.classes()).not.toContain("static-frame");
    listener({ matches: true });
    await nextTick();
    expect(wrapper.classes()).toContain("static-frame");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes the preference listener and pending animation timer on unmount", async () => {
    const wrapper = await mountArt();
    const listener = motionQuery.addEventListener.mock.calls[0][1];
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    wrappers.pop();
    expect(motionQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      listener,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps SVG clipping, gradients, and accessibility references unique per instance", async () => {
    const first = await mountArt({ animated: false });
    const second = await mountArt({ animated: false });
    const firstIds = new Set(
      first.findAll("[id]").map((element) => element.attributes("id")),
    );
    const secondIds = new Set(
      second.findAll("[id]").map((element) => element.attributes("id")),
    );
    expect([...firstIds].some((id) => secondIds.has(id))).toBe(false);
    for (const wrapper of [first, second]) {
      const ids = new Set(
        wrapper.findAll("[id]").map((element) => element.attributes("id")),
      );
      const svg = wrapper.get("svg");
      expect(svg.attributes("role")).toBe("img");
      expect(svg.attributes("aria-label")).toBe("奶酪里探出头的小老鼠");
      expect(svg.find("title").exists()).toBe(false);
      svg
        .attributes("aria-describedby")
        .split(" ")
        .forEach((id) => expect(ids.has(id)).toBe(true));
      wrapper
        .findAll("use")
        .forEach((element) =>
          expect(ids.has(element.attributes("href").slice(1))).toBe(true),
        );
      wrapper.findAll("[clip-path]").forEach((element) => {
        const reference = element
          .attributes("clip-path")
          .match(/url\(#(.+)\)/)[1];
        expect(ids.has(reference)).toBe(true);
      });
    }
  });
});
