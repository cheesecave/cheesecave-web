import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guestPreview: vi.fn(),
  loadStyle: vi.fn(),
  style: null,
}));
vi.mock("@/stores/markdownStyle", () => ({
  useMarkdownStyleStore: () => mocks.style,
}));
vi.mock("@/markdown-styles/registry", async (importOriginal) => ({
  ...(await importOriginal()),
  loadMarkdownStyle: mocks.loadStyle,
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: mocks }));
import Markdown from "@/components/repo/GuestMarkdownPreview.vue";
const repo = { type: "model", namespace: "owner", name: "demo" };
const wrappers = [];
const mountMarkdown = (props = {}) => {
  const wrapper = mount(Markdown, {
    props: { repository: repo, source: "# Card", ...props },
  });
  wrappers.push(wrapper);
  return wrapper;
};
describe("controlled guest Markdown resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.style = reactive({ resolved: "github" });
    mocks.loadStyle.mockResolvedValue("github");
    mocks.guestPreview.mockResolvedValue({
      data: { kind: "image", data_url: "data:image/png;base64,AA==" },
    });
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
  it("resolves relative images as controlled thumbnails within the current repository", async () => {
    const wrapper = mountMarkdown({
      path: "docs/guide.md",
      source: "# Guide\n![preview](../assets/preview.png)",
    });
    await flushPromises();
    expect(mocks.guestPreview).toHaveBeenCalledExactlyOnceWith(
      repo,
      "assets/preview.png",
    );
    expect(wrapper.get("img").attributes("src")).toBe(
      "data:image/png;base64,AA==",
    );
    expect(wrapper.html()).not.toContain("/resolve/");
  });
  it("never requests remote, absolute, traversal, data or raw HTML image sources", async () => {
    const wrapper = mountMarkdown({
      source:
        '![remote](https://storage.invalid/file.png) ![absolute](/secret.png) ![escape](../outside.png) ![data](data:image/png;base64,AA==) <img src="/private.png">',
    });
    await flushPromises();
    expect(mocks.guestPreview).not.toHaveBeenCalled();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("a[href*=resolve]").exists()).toBe(false);
  });
  it("uses normal browser routes for relative file links and emits SPA navigation", async () => {
    const wrapper = mountMarkdown({
      path: "docs/guide.md",
      source:
        "[Config](../config.json) [secret](/models/owner/demo/resolve/main/private.json)",
    });
    const link = wrapper.get('a[data-guest-path="config.json"]');
    expect(link.attributes("href")).toBe(
      "/models/owner/demo/blob/main/config.json",
    );
    await link.trigger("click");
    expect(wrapper.emitted("open-file")).toEqual([["config.json"]]);
    expect(wrapper.html()).not.toContain("/resolve/");
  });
  it("caps unique thumbnails and concurrent image requests", async () => {
    let active = 0,
      maxActive = 0;
    const releases = [];
    mocks.guestPreview.mockImplementation(() => {
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve) =>
        releases.push(() => {
          active--;
          resolve({
            data: { kind: "image", data_url: "data:image/png;base64,AA==" },
          });
        }),
      );
    });
    const wrapper = mountMarkdown({
      source: Array.from(
        { length: 20 },
        (_, index) => `![image${index}](image${index}.png)`,
      ).join("\n"),
    });
    await flushPromises();
    expect(mocks.guestPreview).toHaveBeenCalledTimes(3);
    for (let round = 0; round < 7; round++) {
      releases.splice(0).forEach((release) => release());
      await flushPromises();
    }
    expect(maxActive).toBe(3);
    expect(mocks.guestPreview).toHaveBeenCalledTimes(16);
    expect(wrapper.findAll("img")).toHaveLength(16);
  });
  it("ignores late images after changing the repository and rejects non-raster URL results", async () => {
    let complete;
    mocks.guestPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = mountMarkdown({ source: "![old](old.png)" });
    await wrapper.setProps({
      repository: { ...repo, name: "other" },
      source: "# Other",
    });
    complete({
      data: { kind: "image", data_url: "data:image/png;base64,AA==" },
    });
    await flushPromises();
    expect(wrapper.find("img").exists()).toBe(false);
    mocks.guestPreview.mockResolvedValueOnce({
      data: { kind: "image", data_url: "https://storage.invalid/raw.png" },
    });
    await wrapper.setProps({ source: "![new](new.png)" });
    await flushPromises();
    expect(wrapper.find("img").exists()).toBe(false);
  });
  it("clears thumbnails and rechecks authorization on a denied image response", async () => {
    mocks.guestPreview.mockRejectedValueOnce({ response: { status: 403 } });
    const wrapper = mountMarkdown({ source: "![private](private.png)" });
    await flushPromises();
    expect(wrapper.emitted("access-denied")).toHaveLength(1);
    expect(wrapper.find("img").exists()).toBe(false);
  });
  it("applies the ordinary selected Markdown theme and waits for its stylesheet", async () => {
    let resolveStyle;
    mocks.loadStyle.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStyle = resolve;
      }),
    );
    const wrapper = mountMarkdown();
    expect(mocks.loadStyle).toHaveBeenCalledWith("github");
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining([
        "markdown-body",
        "markdown-container",
        "mdx",
        "s-github",
        "mdx-loading",
      ]),
    );
    resolveStyle("github");
    await flushPromises();
    expect(wrapper.classes()).not.toContain("mdx-loading");
    mocks.style.resolved = "gitlab";
    await flushPromises();
    expect(mocks.loadStyle).toHaveBeenLastCalledWith("gitlab");
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(["mdx", "s-gitlab", "bar"]),
    );
    expect(wrapper.classes()).not.toContain("s-github");
  });
  it("demotes repository headings by one level and caps their depth at h6", () => {
    const wrapper = mountMarkdown({
      source: "# Model card\n## Introduction\n###### Detail",
    });
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.get("h2").text()).toBe("Model card");
    expect(wrapper.get("h3").text()).toBe("Introduction");
    expect(wrapper.get("h6").text()).toBe("Detail");
  });
});
