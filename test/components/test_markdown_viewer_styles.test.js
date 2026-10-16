// MarkdownViewer wears the style in force, stays hidden until its stylesheet is loaded, adds the copy button of
// each code block (the sanitizer would not let the renderer do it) and sends `#images` to `user-content-images`.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/markdownStyle", async () => {
  const { reactive } = await import("vue");
  const style = reactive({ resolved: "github" });
  return { useMarkdownStyleStore: () => style, style };
});
const loader = vi.hoisted(() => ({ load: null }));
vi.mock("@/markdown-styles/registry", async (original) => {
  const registry = await original();
  return {
    ...registry,
    loadMarkdownStyle: (id) =>
      loader.load ? loader.load(id) : registry.loadMarkdownStyle(id),
  };
});

import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import { style } from "@/stores/markdownStyle";

const CODE =
  "Intro\n\n```python\nprint('one')\n```\n\n```bash\necho two\n```\n";
let wrapper;
const mountViewer = (content = CODE) => {
  wrapper = mount(MarkdownViewer, {
    props: { content },
    attachTo: document.body,
  });
  return wrapper;
};
const root = () => wrapper.get(".markdown-body");

beforeEach(() => {
  setActivePinia(createPinia());
  style.resolved = "github";
  loader.load = null;
  window.location.hash = "";
});
afterEach(() => wrapper?.unmount());

describe("the style it wears", () => {
  it("is the style in force, with the class that style wants", async () => {
    mountViewer();
    expect(root().classes()).toEqual(
      expect.arrayContaining(["mdx", "s-github"]),
    );
    style.resolved = "gitlab";
    await flushPromises();
    expect(root().classes()).toEqual(
      expect.arrayContaining(["mdx", "s-gitlab", "bar"]),
    );
    expect(root().classes()).not.toContain("s-github");
  });

  it("stays hidden until the stylesheet is loaded, then shows", async () => {
    let finish;
    loader.load = () => new Promise((resolve) => (finish = resolve));
    mountViewer();
    expect(root().classes()).toContain("mdx-loading");

    finish("github");
    await flushPromises();

    expect(root().classes()).not.toContain("mdx-loading");
  });

  it("hides again while the next style loads, and does not show a stale answer", async () => {
    const pending = {};
    loader.load = (id) =>
      new Promise((resolve) => (pending[id] = () => resolve(id)));
    mountViewer();
    pending.github();
    await flushPromises();
    style.resolved = "hf";
    await flushPromises();
    expect(root().classes()).toContain("mdx-loading");
    style.resolved = "mdn";
    await flushPromises();

    pending.hf(); // the style that is no longer wanted arrives late
    await flushPromises();
    expect(root().classes()).toContain("mdx-loading");

    pending.mdn();
    await flushPromises();
    expect(root().classes()).not.toContain("mdx-loading");
    expect(root().classes()).toContain("s-mdn");
  });

  it("shows the content anyway when a stylesheet cannot be loaded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    loader.load = () => Promise.reject(new Error("chunk failed"));
    mountViewer();
    await flushPromises();
    expect(root().classes()).not.toContain("mdx-loading");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("the copy button of a code block", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue() },
    });
  });

  it("is added to each block's bar after the content is sanitized, and not to a Mermaid block", async () => {
    mountViewer(`${CODE}\n\`\`\`mermaid\ngraph TD; A-->B\n\`\`\`\n`);
    await flushPromises();
    const buttons = wrapper.findAll(".code-block .code-bar button.copy-code");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes("aria-label")).toBe("Copy code");
    expect(wrapper.find(".mermaid-wrapper .copy-code").exists()).toBe(false);
  });

  it("adds nothing when the viewer is gone before the content has settled", async () => {
    mountViewer();
    wrapper.unmount();
    await flushPromises();
    expect(document.querySelector(".copy-code")).toBeNull();
  });

  it("copies nothing, without failing, for a copy button that sits outside any code block", async () => {
    mountViewer("plain text");
    await flushPromises();
    const stray = document.createElement("button");
    stray.className = "copy-code";
    root().element.appendChild(stray);
    await wrapper.get(".copy-code").trigger("click");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("");
  });

  it("copies the block's code, says so for a moment, then goes back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    mountViewer();
    await flushPromises();
    const [first, second] = wrapper.findAll(".copy-code");

    await second.trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("echo two\n");
    expect(second.classes()).toContain("copied");
    expect(second.attributes("aria-label")).toBe("Copied");
    expect(first.classes()).not.toContain("copied");
    vi.advanceTimersByTime(1600);
    expect(second.classes()).not.toContain("copied");
    expect(second.attributes("aria-label")).toBe("Copy code");
    vi.useRealTimers();
  });

  it("does nothing, quietly, when the browser refuses clipboard access", async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error("denied"));
    mountViewer();
    await flushPromises();
    await wrapper.get(".copy-code").trigger("click");
    expect(wrapper.get(".copy-code").classes()).not.toContain("copied");
  });

  it("ignores a click anywhere else in the document", async () => {
    mountViewer();
    await flushPromises();
    await wrapper.get("p").trigger("click");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("is added again when the content changes", async () => {
    mountViewer();
    await flushPromises();
    await wrapper.setProps({ content: "```js\nlet a\n```\n" });
    await flushPromises();
    expect(wrapper.findAll(".copy-code")).toHaveLength(1);
  });
});

describe("a link to a heading", () => {
  it("finds the heading when the link is written without the prefix, or with it", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.location.hash = "#images";
    mountViewer("## Images\n\ntext\n");
    await flushPromises();
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.map((el) => el.id)).toEqual(
      scroll.mock.contexts.map(() => "user-content-images"),
    );

    const before = scroll.mock.calls.length;
    window.location.hash = "#user-content-images";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(scroll.mock.calls.length).toBeGreaterThan(before);
    expect(scroll.mock.contexts.at(-1).id).toBe("user-content-images");
  });

  it("does not scroll for a hash that is not in the document, or for none", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mountViewer("## Images\n");
    await flushPromises();
    window.location.hash = "#nothing-here";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("stops listening when the viewer goes", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    mountViewer();
    wrapper.unmount();
    expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
    remove.mockRestore();
  });
});
