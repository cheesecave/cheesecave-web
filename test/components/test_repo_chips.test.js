import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import RepoChips from "@/components/repo/RepoChips.vue";

const model = {
  pipeline_tag: "text-generation",
  library_name: "transformers",
  tags: ["transformers", "license:mit", "art", "anime", "region:us"],
};

function mountChips(props) {
  return mount(RepoChips, {
    props: { type: "model", ...props },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
}

const inPopover = (el) => el.closest("[data-popover-content]") !== null;
// the chips on the card itself, then the ones in the popover
const shownLinks = (wrapper) =>
  wrapper.findAll("a").filter((a) => !inPopover(a.element));
const hiddenLinks = (wrapper) =>
  wrapper.findAll("a").filter((a) => inPopover(a.element));
const linkLabels = (links) => links.map((a) => a.text());
const target = (a) => JSON.parse(a.attributes("href"));
const count = (wrapper) => wrapper.get(".repo-chips-more");
const content = (wrapper) => wrapper.find("[data-popover-content]");

describe("RepoChips", () => {
  it("shows three chips and a button that counts the rest", () => {
    const wrapper = mountChips({ repo: model });
    expect(linkLabels(shownLinks(wrapper))).toEqual([
      "Text Generation",
      "Transformers",
      "MIT License",
    ]);
    expect(count(wrapper).element.tagName).toBe("BUTTON");
    expect(count(wrapper).attributes("type")).toBe("button");
    expect(count(wrapper).text()).toBe("+2");
    expect(count(wrapper).attributes("aria-label")).toBe("Show 2 more");
  });

  it("shows as many as it is told to", () => {
    const wrapper = mountChips({ repo: model, max: 2 });
    expect(linkLabels(shownLinks(wrapper))).toEqual([
      "Text Generation",
      "Transformers",
    ]);
    expect(count(wrapper).text()).toBe("+3");
  });

  it("opens a popover of the rest on a click, and keeps it out of the page until then", async () => {
    const wrapper = mountChips({ repo: model });
    const popover = wrapper.get("[data-el-popover='true']");
    expect(popover.attributes("data-trigger")).toBe("click");
    expect(popover.attributes("data-placement")).toBe("bottom-start");
    expect(popover.attributes("data-width")).toBe("300");
    expect(popover.attributes("data-popper-class")).toBe("repo-chips-popover");
    // a list page holds hundreds of cards: a closed popover is not kept in the page
    expect(popover.attributes("data-persistent")).toBe("false");
    expect(content(wrapper).exists()).toBe(false);

    await count(wrapper).trigger("click");
    expect(content(wrapper).exists()).toBe(true);
    expect(linkLabels(hiddenLinks(wrapper))).toEqual(["art", "anime"]);
    // the count is still on the card, the popover holds only the rest
    expect(linkLabels(shownLinks(wrapper))).toHaveLength(3);

    await count(wrapper).trigger("click");
    expect(content(wrapper).exists()).toBe(false);
  });

  it("makes each chip, shown or in the popover, a link to the discovery page of this kind of repository, filtered by it", async () => {
    const wrapper = mountChips({ repo: model });
    await count(wrapper).trigger("click");
    expect(wrapper.findAll("a").map((a) => [a.text(), target(a)])).toEqual([
      [
        "Text Generation",
        { path: "/models", query: { task: "text-generation" } },
      ],
      ["Transformers", { path: "/models", query: { library: "transformers" } }],
      ["MIT License", { path: "/models", query: { license: "mit" } }],
      ["art", { path: "/models", query: { tag: "art" } }],
      ["anime", { path: "/models", query: { tag: "anime" } }],
    ]);
    const dataset = mountChips({
      type: "dataset",
      repo: { tags: ["size_categories:1K<n<10K"] },
    });
    expect(target(dataset.get("a"))).toEqual({
      path: "/datasets",
      query: { size: "1K<n<10K" },
    });
    const space = mountChips({ type: "space", repo: { sdk: "gradio" } });
    expect(target(space.get("a")).path).toBe("/spaces");
  });

  it("keeps the chips above a card's own link, and the count a button that is not a link", () => {
    const wrapper = mountChips({ repo: model });
    for (const a of shownLinks(wrapper))
      expect(a.classes()).toContain("stretched-link-above");
    // a click on the count must not open the repository like a click on the rest of the card
    expect(count(wrapper).classes()).toContain("stretched-link-above");
    expect(count(wrapper).element.closest("a")).toBeNull();
  });

  it("closes on Escape with the focus on the count", async () => {
    const wrapper = mountChips({ repo: model });
    await count(wrapper).trigger("click");
    expect(content(wrapper).exists()).toBe(true);

    await count(wrapper).trigger("keydown", { key: "Escape" });
    expect(content(wrapper).exists()).toBe(false);
  });

  it("closes on Escape with the focus inside the list", async () => {
    const wrapper = mountChips({ repo: model });
    await count(wrapper).trigger("click");

    await wrapper
      .get(".repo-chips-popover-list")
      .trigger("keydown", { key: "Escape" });
    expect(content(wrapper).exists()).toBe(false);
  });

  it("leaves it open on any other key", async () => {
    const wrapper = mountChips({ repo: model });
    await count(wrapper).trigger("click");

    await count(wrapper).trigger("keydown", { key: "Enter" });
    await wrapper
      .get(".repo-chips-popover-list")
      .trigger("keydown", { key: "a" });
    expect(content(wrapper).exists()).toBe(true);
  });

  it("looks like the repository header in the popover too: the colour and icon of each kind", async () => {
    // one chip on the card, so that the task, the library and the license are all in the popover
    const wrapper = mountChips({ repo: model, max: 1 });
    await count(wrapper).trigger("click");
    const tags = hiddenLinks(wrapper).map((a) => a.get("[data-el-tag='true']"));
    expect(tags.map((tag) => tag.attributes("data-type"))).toEqual([
      "success",
      "info",
      "",
      "",
    ]);
    expect(tags[0].find(".i-carbon-cube").exists()).toBe(true);
    expect(tags[1].find(".i-carbon-document").exists()).toBe(true);
    expect(tags[2].attributes("data-effect")).toBe("plain");
    expect(tags[2].find("div").exists()).toBe(false);
  });

  it("looks like the repository header on the card: the colour and icon of each kind", () => {
    const wrapper = mountChips({ repo: model });
    const tags = shownLinks(wrapper).map((a) => a.get("[data-el-tag='true']"));
    expect(tags.map((tag) => tag.attributes("data-type"))).toEqual([
      "warning",
      "success",
      "info",
    ]);
    expect(tags[0].find(".i-carbon-task").exists()).toBe(true);
    expect(tags[1].find(".i-carbon-cube").exists()).toBe(true);
    const free = mountChips({ repo: { tags: ["art"] } }).get(
      "[data-el-tag='true']",
    );
    expect(free.attributes("data-effect")).toBe("plain");
    expect(free.find("div").exists()).toBe(false);
  });

  it("shows no count and no popover when everything fits", () => {
    const wrapper = mountChips({
      repo: { tags: ["license:mit", "art"], pipeline_tag: "text-generation" },
    });
    expect(linkLabels(shownLinks(wrapper))).toEqual([
      "Text Generation",
      "MIT License",
      "art",
    ]);
    expect(wrapper.find(".repo-chips-more").exists()).toBe(false);
    expect(wrapper.find("[data-el-popover='true']").exists()).toBe(false);
  });

  it("renders nothing for a repository with nothing to say", () => {
    const wrapper = mountChips({ repo: { tags: ["region:us"] } });
    expect(wrapper.find(".repo-chips").exists()).toBe(false);
    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
