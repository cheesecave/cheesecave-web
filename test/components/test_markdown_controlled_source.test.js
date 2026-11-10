import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  image: vi.fn(),
  denied: vi.fn(),
  open: vi.fn(),
  mermaid: { initialize: vi.fn(), render: vi.fn() },
}));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ isDark: false }) }));
vi.mock("@/stores/markdownStyle", () => ({
  useMarkdownStyleStore: () => ({ resolved: "github" }),
}));
vi.mock("mermaid", () => ({ default: mocks.mermaid }));
vi.mock("panzoom", () => ({
  default: () => ({
    zoomWithWheel: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    moveTo: vi.fn(),
    zoomAbs: vi.fn(),
  }),
}));
import Viewer from "@/components/common/MarkdownViewer.vue";
import { renderMarkdown } from "@/utils/markdown";
const repoContext = {
  repoType: "model",
  namespace: "owner",
  name: "demo",
  branch: "main",
};
const controlledResources = { filePath: "docs/readme.md" };
const wrappers = [];
function mountViewer(props = {}) {
  const wrapper = mount(Viewer, {
    props: {
      content: "# Card",
      ...repoContext,
      controlledSource: {
        loadThumbnail: mocks.image,
        onAccessDenied: mocks.denied,
        openFile: mocks.open,
      },
      ...props,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.image.mockResolvedValue({
    kind: "image",
    data_url: "data:image/png;base64,AA==",
  });
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
describe("ordinary Markdown parser with controlled repository resources", () => {
  it("retains shared headings, code bars, footnotes, alerts and math", () => {
    const html = renderMarkdown(
      "# Card\n\n> [!NOTE]\n> Shared\n\n```python\nprint(1)\n```\n\n$E=mc^2$ A[^1]\n\n[^1]: Note",
      { controlledResources, headingOffset: 1, repoContext },
    );
    expect(html).toContain("user-content-card");
    expect(html).toContain("<h2");
    expect(html).toContain("code-bar");
    expect(html).toContain("footnote-ref");
    expect(html).toContain("markdown-alert-note");
    expect(html).toContain("katex");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("a.heading-anchor svg")).not.toBeNull();
  });
  it("never parses raw HTML images, CSS resources or frames into resource-bearing DOM", () => {
    const html = renderMarkdown(
      '<style>body{background:url(/secret)}</style><img src="/raw.png"><video src="/raw.mp4"></video>\n\n![remote](https://raw.invalid/a.png) ![local](assets/a.png)',
      { repoContext, controlledResources },
    );
    expect(html).not.toMatch(/<img|<video|<style|<iframe|src=/);
    expect(html).not.toContain("raw.invalid");
    expect(html).toContain('data-guest-image="docs/assets/a.png"');
  });
  it("keeps ordinary resource rendering unchanged", () => {
    const html = renderMarkdown(
      '![local](assets/a.png)<img src="https://safe.invalid/image.png">',
      { repoContext },
    );
    expect(html).toContain("/models/owner/demo/resolve/main/assets/a.png");
    expect(html).toContain('src="https://safe.invalid/image.png"');
  });
  it("normalizes relative links and refuses root escapes and raw URLs", () => {
    const html = renderMarkdown(
      "[Config](../config.json) [escape](../../outside) [raw](/models/owner/demo/resolve/main/a) [section](#card)",
      { repoContext, controlledResources },
    );
    expect(html).toContain("/models/owner/demo/blob/main/config.json");
    expect(html).toContain('href="#card"');
    expect(html).not.toContain("/resolve/");
    expect(html).not.toContain('href="../../outside"');
  });
});
describe("ordinary MarkdownViewer with controlled source", () => {
  it("loads only controlled raster thumbnails and never invokes loose Mermaid", async () => {
    const w = mountViewer({
      content: "![image](../assets/a.png)\n\n```mermaid\ngraph TD; A-->B\n```",
      filePath: "docs/readme.md",
    });
    await flushPromises();
    expect(mocks.image).toHaveBeenCalledExactlyOnceWith("assets/a.png");
    expect(w.get("img").attributes("src")).toBe("data:image/png;base64,AA==");
    expect(mocks.mermaid.initialize).not.toHaveBeenCalled();
    expect(mocks.mermaid.render).not.toHaveBeenCalled();
  });
  it("caps thumbnail requests at sixteen and concurrency three", async () => {
    const release = [];
    let active = 0,
      peak = 0;
    mocks.image.mockImplementation(() => {
      active++;
      peak = Math.max(peak, active);
      return new Promise((r) =>
        release.push(() => {
          active--;
          r({ kind: "image", data_url: "data:image/png;base64,AA==" });
        }),
      );
    });
    const w = mountViewer({
      content: Array.from({ length: 20 }, (_, i) => `![image](a${i}.png)`).join(
        "\n",
      ),
    });
    await flushPromises();
    expect(mocks.image).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 7; i++) {
      release.splice(0).forEach((f) => f());
      await flushPromises();
    }
    expect(mocks.image).toHaveBeenCalledTimes(16);
    expect(peak).toBe(3);
    expect(w.findAll("img")).toHaveLength(16);
  });
  it("rejects late images after source changes and non-raster server URLs", async () => {
    let resolve;
    mocks.image.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const w = mountViewer({ content: "![old](old.png)" });
    await flushPromises();
    await w.setProps({ content: "# Other" });
    resolve({ kind: "image", data_url: "data:image/png;base64,AA==" });
    await flushPromises();
    expect(w.find("img").exists()).toBe(false);
    mocks.image.mockResolvedValueOnce({ kind: "image", data_url: "/raw.png" });
    await w.setProps({ content: "![new](new.png)" });
    await flushPromises();
    expect(w.find("img").exists()).toBe(false);
  });
  it("clears displayed thumbnails and notifies parent when session is denied", async () => {
    mocks.image
      .mockResolvedValueOnce({
        kind: "image",
        data_url: "data:image/png;base64,AA==",
      })
      .mockRejectedValueOnce({
        response: { status: 404, headers: { "x-error-code": "RepoNotFound" } },
      });
    const w = mountViewer({
      content: "![visible](visible.png) ![denied](denied.png)",
    });
    await flushPromises();
    expect(w.find("img").exists()).toBe(false);
    expect(mocks.denied).toHaveBeenCalledOnce();
  });
  it("uses real links and intercepts only unmodified primary SPA navigation", async () => {
    const w = mountViewer({ content: "[Config](config.json)" });
    await flushPromises();
    const a = w.get("a[data-guest-path]");
    expect(a.attributes("href")).toBe(
      "/models/owner/demo/blob/main/config.json",
    );
    await a.trigger("click", { ctrlKey: true });
    expect(mocks.open).not.toHaveBeenCalled();
    await a.trigger("click");
    expect(mocks.open).toHaveBeenCalledWith("config.json");
  });
  it("retains ordinary copy-code controls in restricted mode", async () => {
    const w = mountViewer({ content: "```python\nprint(1)\n```" });
    await flushPromises();
    expect(w.get(".copy-code").attributes("aria-label")).toBe("Copy code");
  });
  it("removes old thumbnails immediately when the repository changes without changing Markdown", async () => {
    const w = mountViewer({ content: "![same](same.png)" });
    await flushPromises();
    expect(w.find("img").exists()).toBe(true);
    let complete;
    mocks.image.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await w.setProps({ name: "other" });
    expect(w.find("img").exists()).toBe(false);
    complete({ kind: "image", data_url: "data:image/png;base64,BB==" });
    await flushPromises();
    expect(w.get("img").attributes("src")).toBe("data:image/png;base64,BB==");
  });
  it("ignores denied thumbnail completions after unmount", async () => {
    let reject;
    mocks.image.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const w = mountViewer({ content: "![pending](pending.png)" });
    await flushPromises();
    w.unmount();
    wrappers.splice(wrappers.indexOf(w), 1);
    reject({ response: { status: 403 } });
    await flushPromises();
    expect(mocks.denied).not.toHaveBeenCalled();
  });
  it("renders repeated image references once per source and leaves missing/bad thumbnails inert", async () => {
    mocks.image
      .mockResolvedValueOnce({
        kind: "image",
        data_url: "data:image/png;base64,AA==",
      })
      .mockResolvedValueOnce({ kind: "text", text: "not an image" })
      .mockRejectedValueOnce({ response: { status: 404 } });
    const w = mountViewer({
      content:
        "![one](same.png) ![two](same.png) ![bad](bad.png) ![missing](missing.png)",
    });
    await flushPromises();
    expect(mocks.image).toHaveBeenCalledTimes(3);
    expect(w.findAll("img")).toHaveLength(2);
    expect(mocks.denied).not.toHaveBeenCalled();
  });
  it("removes an existing normal Mermaid diagram when the same content becomes controlled", async () => {
    mocks.mermaid.render.mockResolvedValue({
      svg: "<svg><text>ordinary diagram</text></svg>",
    });
    const w = mountViewer({
      content: "```mermaid\ngraph TD; A-->B\n```",
      controlledSource: null,
    });
    await flushPromises();
    expect(w.find(".mermaid-wrapper").exists()).toBe(true);
    await w.setProps({
      controlledSource: {
        loadThumbnail: mocks.image,
        onAccessDenied: mocks.denied,
      },
    });
    await flushPromises();
    expect(w.find(".mermaid-wrapper").exists()).toBe(false);
    expect(w.get("pre code.language-mermaid").text()).toContain("graph TD");
  });
});
