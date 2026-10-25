import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

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

  it("shows the first two tags and the numbers, with 0 for a missing count", () => {
    const tagged = mountCard({ tags: ["a", "b", "c"] });
    expect(tagged.findAll("[data-el-tag]").map((t) => t.text())).toEqual([
      "a",
      "b",
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
});
