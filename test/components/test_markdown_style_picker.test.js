// The settings page's picker: every style with a preview in that style, "follow the site default", and what each
// choice does.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), success: vi.fn() }));
vi.mock("@/errors", async (original) => ({
  ...(await original()),
  notifyError: mocks.notify,
}));
vi.mock("element-plus", async (original) => ({
  ...(await original()),
  ElMessage: Object.assign(vi.fn(), { success: mocks.success }),
}));
vi.mock("@/stores/markdownStyle", async () => {
  const { reactive } = await import("vue");
  const store = reactive({
    userChoice: null,
    siteDefault: "vitepress",
    choose: null,
  });
  return { useMarkdownStyleStore: () => store, store };
});

import MarkdownStylePicker from "@/components/settings/MarkdownStylePicker.vue";
import { MARKDOWN_STYLES } from "@/markdown-styles/registry";
import { store } from "@/stores/markdownStyle";

let wrapper;
const mountPicker = async () => {
  wrapper = mount(MarkdownStylePicker, { global: { stubs: ElementPlusStubs } });
  // the ten stylesheets load on demand; the previews show once they have
  await vi.waitFor(() =>
    expect(wrapper.find(".mdx-loading").exists()).toBe(false),
  );
  return wrapper;
};
const option = (id) => wrapper.get(`[data-testid="style-option-${id}"]`);

beforeEach(() => {
  store.userChoice = null;
  store.siteDefault = "vitepress";
  store.choose = vi.fn().mockResolvedValue();
  mocks.notify.mockReset();
  mocks.success.mockReset();
});

describe("the picker", () => {
  it("offers following the site and every style, each previewed in its own style", async () => {
    await mountPicker();
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(
      MARKDOWN_STYLES.length + 1,
    );
    for (const style of MARKDOWN_STYLES) {
      const preview = option(style.id).get(".md-option-preview");
      expect(preview.classes()).toEqual(
        expect.arrayContaining(["mdx", `s-${style.id}`]),
      );
      expect(preview.classes()).not.toContain("mdx-loading");
      expect(preview.attributes("aria-hidden")).toBe("true");
      expect(preview.html()).toContain("A model card");
      expect(option(style.id).text()).toContain(style.name);
    }
  });

  it("says which style is the site's default, and what following it means now", async () => {
    await mountPicker();
    expect(option("vitepress").text()).toContain("Site default");
    expect(option("github").text()).not.toContain("Site default");
    expect(option("default").text()).toContain("Currently VitePress");
  });

  it("marks the reader's own choice, or following the site when there is none", async () => {
    await mountPicker();
    expect(option("default").classes()).toContain("active");
    store.userChoice = "tufte";
    await flushPromises();
    expect(option("tufte").classes()).toContain("active");
    expect(option("default").classes()).not.toContain("active");
    expect(option("tufte").get("input").element.checked).toBe(true);
  });

  it("names the site default by its id when it is a style this build does not have", async () => {
    store.siteDefault = "from-the-future";
    await mountPicker();
    expect(option("default").text()).toContain("Currently from-the-future");
  });
});

describe("choosing", () => {
  it("saves the style that was picked, and says so", async () => {
    await mountPicker();
    await option("hf").get("input").trigger("change");
    await flushPromises();
    expect(store.choose).toHaveBeenCalledWith("hf");
    expect(mocks.success).toHaveBeenCalledWith("README style saved");
  });

  it("saves null for following the site", async () => {
    store.userChoice = "hf";
    await mountPicker();
    await option("default").get("input").trigger("change");
    await flushPromises();
    expect(store.choose).toHaveBeenCalledWith(null);
  });

  it("reports a choice that could not be saved, and does not say it was", async () => {
    store.choose = vi.fn().mockRejectedValue(new Error("503"));
    await mountPicker();
    await option("mdn").get("input").trigger("change");
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Failed to save README style",
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
