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
const labels = (wrapper) =>
  wrapper.findAll("[data-el-tag='true']").map((tag) => tag.text());

describe("RepoChips", () => {
  it("shows three chips and counts the rest", () => {
    const wrapper = mountChips({ repo: model });
    expect(labels(wrapper)).toEqual([
      "Text Generation",
      "Transformers",
      "MIT License",
      "+2",
    ]);
  });

  it("names the hidden ones on the count, for a hover and a screen reader", () => {
    const more = mountChips({ repo: model }).get(".repo-chips-more");
    expect(more.attributes("title")).toBe("2 more: art, anime");
  });

  it("shows no count when everything fits", () => {
    const wrapper = mountChips({
      repo: { tags: ["license:mit", "art"], pipeline_tag: "text-generation" },
    });
    expect(labels(wrapper)).toEqual(["Text Generation", "MIT License", "art"]);
    expect(wrapper.find(".repo-chips-more").exists()).toBe(false);
  });

  it("shows as many as it is told to", () => {
    expect(labels(mountChips({ repo: model, max: 2 }))).toEqual([
      "Text Generation",
      "Transformers",
      "+3",
    ]);
  });

  it("makes each chip a link to the discovery page of this kind of repository, filtered by it", () => {
    const wrapper = mountChips({ repo: model });
    const links = wrapper
      .findAll("a")
      .map((a) => [a.text(), JSON.parse(a.attributes("href"))]);
    expect(links).toEqual([
      [
        "Text Generation",
        { path: "/models", query: { task: "text-generation" } },
      ],
      ["Transformers", { path: "/models", query: { library: "transformers" } }],
      ["MIT License", { path: "/models", query: { license: "mit" } }],
    ]);
    const dataset = mountChips({
      type: "dataset",
      repo: { tags: ["size_categories:1K<n<10K"] },
    });
    expect(JSON.parse(dataset.get("a").attributes("href"))).toEqual({
      path: "/datasets",
      query: { size: "1K<n<10K" },
    });
    const space = mountChips({ type: "space", repo: { sdk: "gradio" } });
    expect(JSON.parse(space.get("a").attributes("href")).path).toBe("/spaces");
  });

  it("keeps the links above a card's own link, and the count not a link at all", () => {
    const wrapper = mountChips({ repo: model });
    for (const a of wrapper.findAll("a"))
      expect(a.classes()).toContain("stretched-link-above");
    expect(wrapper.get(".repo-chips-more").element.closest("a")).toBeNull();
  });

  it("looks like the repository header: the colour and icon of each kind", () => {
    const wrapper = mountChips({ repo: model });
    const tags = wrapper.findAll("[data-el-tag='true']");
    expect(tags.map((tag) => tag.attributes("data-type"))).toEqual([
      "warning",
      "success",
      "info",
      "",
    ]);
    expect(tags[0].find(".i-carbon-task").exists()).toBe(true);
    expect(tags[1].find(".i-carbon-cube").exists()).toBe(true);
    const free = mountChips({ repo: { tags: ["art"] } }).get(
      "[data-el-tag='true']",
    );
    expect(free.attributes("data-effect")).toBe("plain");
    expect(free.find("div").exists()).toBe(false);
  });

  it("renders nothing for a repository with nothing to say", () => {
    const wrapper = mountChips({ repo: { tags: ["region:us"] } });
    expect(wrapper.find(".repo-chips").exists()).toBe(false);
    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
