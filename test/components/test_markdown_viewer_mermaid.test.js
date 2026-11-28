// The Mermaid path of MarkdownViewer. Mermaid itself is replaced by a stand-in that returns what "loose" mode
// produces for a diagram with a click link (the link target kept as written); the viewer's own handling is real.
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaid }));
vi.mock("panzoom", () => ({
  default: vi.fn(() => ({
    dispose: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    reset: vi.fn(),
    zoomWithWheel: vi.fn(),
  })),
}));

import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import DOMPurify from "isomorphic-dompurify";
import { useThemeStore } from "@/stores/theme";

const DIAGRAM = '```mermaid\nflowchart LR\n  A --> B\n  click A "x"\n```\n';
const scriptLinkSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 40"><a href="javascript:(function(){document.body.dataset.pwned='1'})()" xlink:href="javascript:(function(){document.body.dataset.pwned='1'})()"><text x="5" y="20">Click me</text></a></svg>`;
const httpsLinkSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 40"><a href="https://example.com/docs"><text x="5" y="20">Docs</text></a></svg>`;

let wrapper;
const mountViewer = (content = DIAGRAM) => {
  wrapper = mount(MarkdownViewer, {
    props: { content },
    attachTo: document.body,
  });
  return wrapper;
};
const anchorsInDiagrams = () =>
  [...document.querySelectorAll(".mermaid-diagram a")].map((a) => ({
    href: a.getAttribute("href"),
    xlink: a.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
  }));

beforeEach(() => {
  setActivePinia(createPinia());
  mermaid.initialize.mockClear();
  mermaid.render.mockReset();
  delete document.body.dataset.pwned;
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("the Mermaid configuration", () => {
  it("runs Mermaid in strict mode, never in loose mode", async () => {
    mermaid.render.mockResolvedValue({ svg: httpsLinkSvg });
    mountViewer();
    await flushPromises();

    expect(mermaid.initialize).toHaveBeenCalled();
    for (const [config] of mermaid.initialize.mock.calls) {
      expect(config.securityLevel).toBe("strict");
    }
  });
});

describe("a diagram with a script link", () => {
  it("shows the diagram but no script link after the first render", async () => {
    mermaid.render.mockResolvedValue({ svg: scriptLinkSvg });
    mountViewer();
    await flushPromises();

    expect(document.querySelector(".mermaid-diagram svg")).not.toBeNull();
    expect(document.querySelector(".mermaid-diagram")?.innerHTML).toContain(
      "Click me",
    );
    for (const { href, xlink } of anchorsInDiagrams()) {
      expect(href ?? "").not.toMatch(/^\s*javascript:/i);
      expect(xlink ?? "").not.toMatch(/^\s*javascript:/i);
    }
  });

  it("is still clean after a theme change re-renders it", async () => {
    mermaid.render.mockResolvedValue({ svg: scriptLinkSvg });
    mountViewer();
    await flushPromises();

    useThemeStore().toggle();
    await flushPromises();

    expect(mermaid.render).toHaveBeenCalledTimes(2);
    for (const { href, xlink } of anchorsInDiagrams()) {
      expect(href ?? "").not.toMatch(/^\s*javascript:/i);
      expect(xlink ?? "").not.toMatch(/^\s*javascript:/i);
    }
  });
});

describe("a diagram with an ordinary https link", () => {
  it("keeps the link", async () => {
    mermaid.render.mockResolvedValue({ svg: httpsLinkSvg });
    mountViewer();
    await flushPromises();

    expect(anchorsInDiagrams().map((a) => a.href)).toContain(
      "https://example.com/docs",
    );
  });
});

describe("a diagram that fails to render", () => {
  it("shows a fixed message, and an error text that looks like markup stays text", async () => {
    mermaid.render.mockRejectedValue(
      new Error(
        `Parse error: <img src=x onerror="document.body.dataset.pwned='1'">`,
      ),
    );
    mountViewer();
    await flushPromises();

    const shown = document.querySelector(".mermaid-wrapper")?.textContent ?? "";
    expect(shown).toContain("Diagram Syntax Error");
    expect(document.querySelector(".mermaid-wrapper img")).toBeNull();
    expect(document.body.dataset.pwned).toBeUndefined();
  });
});

describe("a failure after rendering, while the diagram is inserted", () => {
  it("shows the error box with its message as text, and nothing it contains runs", async () => {
    const original = DOMPurify.sanitize.bind(DOMPurify);
    const spy = vi
      .spyOn(DOMPurify, "sanitize")
      .mockImplementation((input, config) => {
        if (String(input).includes("<svg")) {
          throw new Error(
            `boom <img src=x onerror="document.body.dataset.pwned='1'">`,
          );
        }
        return original(input, config);
      });
    try {
      mermaid.render.mockResolvedValue({ svg: httpsLinkSvg });
      mountViewer();
      await flushPromises();

      const box = document.querySelector(".mermaid-error");
      expect(box?.textContent).toContain("boom <img src=x onerror=");
      expect(box?.querySelector("img")).toBeNull();
      expect(document.body.dataset.pwned).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
