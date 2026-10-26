import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import repoInfo from "../fixtures/repo-info.json";
import repoStats from "../fixtures/repo-stats.json";
import userOverview from "../fixtures/user-overview.json";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router/auto", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import ProfileRepoCard from "@/components/profile/ProfileRepoCard.vue";

const base = {
  id: "bob/lineart",
  private: false,
  lastModified: "2026-01-01T00:00:00Z",
  tags: [],
  downloads: 7,
  likes: 3,
};

function mountCard(repo = {}, type = "model") {
  return mount(ProfileRepoCard, {
    props: { repo: { ...base, ...repo }, type },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
}

describe("ProfileRepoCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["model", "/models/bob/lineart", "i-carbon-model", "text-blue-500"],
    [
      "dataset",
      "/datasets/bob/lineart",
      "i-carbon-data-table",
      "text-green-500",
    ],
    ["space", "/spaces/bob/lineart", "i-carbon-application", "text-purple-500"],
  ])(
    "is one link to the %s page, with that type's icon",
    (type, href, icon, color) => {
      const wrapper = mountCard({}, type);
      const link = wrapper.get("h3 a");
      expect(link.attributes("href")).toBe(href);
      expect(link.text()).toBe("bob/lineart");
      expect(link.classes()).toContain("stretched-link");
      expect(wrapper.classes()).toContain("relative");
      const iconEl = wrapper.get(`.${icon}`);
      expect(iconEl.classes()).toContain(color);
      expect(wrapper.findAll("a")).toHaveLength(1);
    },
  );

  it("does not navigate through a click handler: the link is the only way", async () => {
    const wrapper = mountCard();
    await wrapper.trigger("click");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.classes()).not.toContain("cursor-pointer");
  });

  it("marks only a private repository", () => {
    expect(mountCard({ private: true }).find(".repo-private").text()).toBe(
      "Private",
    );
    expect(mountCard().find(".repo-private").exists()).toBe(false);
  });

  it("shows the first three chips and the numbers, with 0 for a missing count", () => {
    const tagged = mountCard({ tags: ["a", "b", "c", "d", "e"] });
    expect(tagged.findAll("[data-el-tag]").map((t) => t.text())).toEqual([
      "a",
      "b",
      "c",
      "+2",
    ]);
    expect(tagged.text()).toContain("7");
    expect(tagged.text()).toContain("3");
    const bare = mountCard({
      tags: undefined,
      downloads: 0,
      likes: undefined,
      lastModified: null, // "never": no digits to confuse the count below
    });
    expect(bare.find("[data-el-tag]").exists()).toBe(false);
    expect(bare.text().match(/0/g)).toHaveLength(2);
  });

  it("says what the repository is, as its page does, not what its tags happen to start with", () => {
    const wrapper = mountCard({
      pipeline_tag: "text-generation",
      library_name: "transformers",
      tags: ["region:us", "transformers", "license:mit", "language:en", "art"],
    });
    expect(wrapper.findAll("[data-el-tag]").map((t) => t.text())).toEqual([
      "Text Generation",
      "Transformers",
      "MIT License",
      "+1",
    ]);
    expect(wrapper.text()).not.toContain("region");
    const links = wrapper
      .findAll("[data-el-tag]")
      .map((t) => t.element.closest("a")?.getAttribute("href"));
    expect(links.slice(0, 3).map((href) => JSON.parse(href))).toEqual([
      { path: "/models", query: { task: "text-generation" } },
      { path: "/models", query: { library: "transformers" } },
      { path: "/models", query: { license: "mit" } },
    ]);
    expect(links[3]).toBeUndefined();
  });

  it("filters by the kind of repository the card is", () => {
    const wrapper = mountCard(
      { tags: ["size_categories:1K<n<10K"] },
      "dataset",
    );
    const href = wrapper.get(".repo-chips a").attributes("href");
    expect(JSON.parse(href)).toEqual({
      path: "/datasets",
      query: { size: "1K<n<10K" },
    });
  });

  it("says when it was updated, or never", () => {
    expect(mountCard().text()).toMatch(/Updated .*ago/);
    expect(mountCard({ lastModified: null }).text()).toContain("Updated never");
  });

  it("offers a button to the source only for a repository from another source", () => {
    expect(mountCard().text()).not.toContain("View on");
    expect(mountCard({ _source: "local" }).text()).not.toContain("View on");
    const external = mountCard({
      _source: "huggingface",
      _source_url: "https://huggingface.co",
    });
    const button = external.get("button");
    expect(button.text()).toBe("View on huggingface");
    expect(button.classes()).toContain("stretched-link-above");
  });

  it("opens the source in a new window without leaving the page", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountCard(
      { _source: "partner hub", _source_url: "https://hub.example.org" },
      "dataset",
    );
    await wrapper.get("button").trigger("click");
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://hub.example.org/datasets/bob/lineart",
      "_blank",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("opens nothing when the source has no address", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountCard({ _source: "partner hub" });
    await wrapper.get("button").trigger("click");
    expect(open).not.toHaveBeenCalled();
  });

  // Shapes captured from the real backend, not hand-written ones
  it("renders a captured model repository, its name the one link over the card", async () => {
    const wrapper = mountCard(repoInfo, "model");
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
    expect(wrapper.text()).toContain(String(repoStats.downloads));
    expect(wrapper.text()).toContain(String(repoStats.likes));
    expect(wrapper.get(".card h3 a").attributes("href")).toBe(
      "/models/mai_lin/lineart-caption-base",
    );
    await wrapper.get(".card").trigger("click");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renders captured dataset and space overview entries with their own links", () => {
    const dataset = mountCard(userOverview.datasets[0], "dataset");
    expect(dataset.text()).toContain("mai_lin/street-sign-zh-en");
    expect(dataset.get("a").attributes("href")).toBe(
      "/datasets/mai_lin/street-sign-zh-en",
    );
    const space = mountCard(userOverview.spaces[0], "space");
    expect(space.get("a").attributes("href")).toBe("/spaces/mai_lin/mai_lin");
  });
});
