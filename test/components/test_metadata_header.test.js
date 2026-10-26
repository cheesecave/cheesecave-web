import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import MetadataHeader from "@/components/repo/metadata/MetadataHeader.vue";
import { splitTags } from "@/utils/repo-derived";

function mountHeader(props) {
  return mount(MetadataHeader, {
    props,
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
}

const chips = (wrapper) =>
  wrapper.findAll("[data-el-tag='true']").map((tag) => tag.text());
const links = (wrapper) =>
  wrapper
    .findAll("[data-router-link='true']")
    .map((a) => [a.text(), JSON.parse(a.attributes("href"))]);
const link = (wrapper, text) =>
  links(wrapper).find(([label]) => label === text)?.[1];
// the count of a group ("+3 more", then "Show less") is a button
const more = (wrapper, text) =>
  wrapper.findAll("button").find((button) => button.text() === text);
const metadataLink = (wrapper) =>
  wrapper.findAll("button").find((b) => b.text().startsWith("All metadata"));

const groups = splitTags(
  [
    "transformers",
    "pytorch",
    "safetensors",
    "llama",
    "text-generation",
    "en",
    "exbert",
    "arxiv:2204.05149",
    "region:us",
  ],
  {
    libraryName: "transformers",
    pipelineTag: "text-generation",
    languages: ["en"],
  },
);

describe("the header of a model", () => {
  const props = {
    repoType: "model",
    metadata: {
      pipeline_tag: "text-generation",
      library_name: "transformers",
      license: "mit",
      language: ["en"],
    },
    ...groups,
  };

  it("shows the task, the libraries and frameworks, the license, the language and the free tags", () => {
    const wrapper = mountHeader(props);

    expect(chips(wrapper)).toEqual([
      "Text Generation",
      "Transformers",
      "PyTorch",
      "Safetensors",
      expect.stringMatching(/MIT/i),
      "English",
      "llama",
      "exbert",
      "arXiv:2204.05149",
    ]);
  });

  it("leads each chip to the discovery page filtered by it", () => {
    const wrapper = mountHeader(props);

    expect(link(wrapper, "Text Generation")).toEqual({
      path: "/models",
      query: { task: "text-generation" },
    });
    expect(link(wrapper, "Transformers")).toEqual({
      path: "/models",
      query: { library: "transformers" },
    });
    expect(link(wrapper, "PyTorch")).toEqual({
      path: "/models",
      query: { tag: "pytorch" },
    });
    expect(link(wrapper, "English")).toEqual({
      path: "/models",
      query: { language: "en" },
    });
    expect(link(wrapper, "exbert")).toEqual({
      path: "/models",
      query: { tag: "exbert" },
    });
    expect(links(wrapper).find(([, to]) => to.query?.license)?.[1]).toEqual({
      path: "/models",
      query: { license: "mit" },
    });
  });

  it("links a paper to arXiv, away from the site, and safely", () => {
    const wrapper = mountHeader(props);
    const paper = wrapper.find("a[href='https://arxiv.org/abs/2204.05149']");

    expect(paper.exists()).toBe(true);
    expect(paper.attributes("target")).toBe("_blank");
    expect(paper.attributes("rel")).toBe("noopener noreferrer");
    expect(paper.text()).toBe("arXiv:2204.05149");
  });

  it("keeps the library the README names when the API gave no groups (an older backend)", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: { library_name: "timm", pipeline_tag: "image-classification" },
    });

    expect(chips(wrapper)).toEqual(["Image Classification", "timm"]);
    expect(link(wrapper, "timm")).toEqual({
      path: "/models",
      query: { library: "timm" },
    });
  });

  it("shows a repository with no README but a library and frameworks", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(["pytorch", "bert"], { libraryName: "transformers" }),
    });

    expect(chips(wrapper)).toEqual(["Transformers", "PyTorch", "bert"]);
  });

  it("shows the first free tags and says how many more there are", () => {
    const tags = Array.from({ length: 9 }, (_, n) => `tag${n}`);
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(tags),
    });

    expect(chips(wrapper).filter((t) => t.startsWith("tag"))).toHaveLength(6);
    expect(more(wrapper, "+3 more").exists()).toBe(true);
  });

  it("says nothing of more tags when they all fit", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(["a", "b"]),
    });

    expect(chips(wrapper).some((t) => t.includes("more"))).toBe(false);
  });

  it("leads a license, however the card wrote it, to the lower-case id the facets use", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: { license: ["Apache-2.0"] },
    });

    expect(links(wrapper)[0][1]).toEqual({
      path: "/models",
      query: { license: "apache-2.0" },
    });
  });
});

describe("the header of a Space", () => {
  it("shows the SDK, which leads to the Spaces of that SDK", () => {
    const wrapper = mountHeader({
      repoType: "space",
      metadata: { sdk: "gradio" },
    });

    expect(chips(wrapper)).toEqual(["Gradio"]);
    expect(link(wrapper, "Gradio")).toEqual({
      path: "/spaces",
      query: { sdk: "gradio" },
    });
  });

  it("names an SDK it does not know by its id, and shows none for a model", () => {
    expect(
      chips(mountHeader({ repoType: "space", metadata: { sdk: "flask" } })),
    ).toEqual(["flask"]);
    expect(
      chips(mountHeader({ repoType: "model", metadata: { sdk: "gradio" } })),
    ).toEqual([]);
  });
});

describe("a card that writes its values as one string", () => {
  it("shows a language, a task and a size given alone as it does a list", () => {
    const wrapper = mountHeader({
      repoType: "dataset",
      metadata: {
        language: "fr",
        task_categories: "translation",
        size_categories: "n<1K",
      },
    });

    const shown = chips(wrapper);
    expect(shown).toEqual(expect.arrayContaining(["French", "translation"]));
    expect(shown.some((t) => /n<1K|1K/.test(t))).toBe(true);
    expect(shown.some((t) => t.includes("more"))).toBe(false);
  });

  it("shows no language, task or size where the card has none", () => {
    expect(
      chips(
        mountHeader({
          repoType: "dataset",
          metadata: {
            language: null,
            task_categories: "",
            size_categories: [],
          },
        }),
      ),
    ).toEqual([]);
  });

  it("shows the first three languages of a model and how many more", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: { language: ["en", "fr", "de", "it", "es"] },
    });

    expect(chips(wrapper)).toEqual(["English", "French", "German", "+2 more"]);
  });
});

describe("the header of a dataset", () => {
  it("is what it was: the size and the tasks of the card", () => {
    const wrapper = mountHeader({
      repoType: "dataset",
      metadata: {
        size_categories: ["10K<n<100K"],
        task_categories: ["translation", "summarization", "fill-mask"],
        license: "cc-by-4.0",
        language: ["en", "fr", "de", "it"],
      },
    });

    const shown = chips(wrapper);
    expect(shown).toEqual(
      expect.arrayContaining([
        "translation",
        "summarization",
        "+1 more",
        "+1 more",
      ]),
    );
    expect(shown.some((t) => /10K/.test(t))).toBe(true);
    expect(wrapper.find("a[href^='https://arxiv.org']").exists()).toBe(false);
  });
});

describe("unfolding what a count stands for", () => {
  const manyTags = Array.from({ length: 9 }, (_, n) => `tag${n}`);
  const papers = Array.from({ length: 4 }, (_, n) => `arxiv:2401.0000${n + 1}`);
  const modelProps = {
    repoType: "model",
    metadata: { language: ["en", "fr", "de", "it", "es"] },
    ...splitTags([...manyTags, ...papers]),
  };

  it("unfolds the languages after their count, which turns into Show less, and folds them back", async () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: { language: ["en", "fr", "de", "it", "es"] },
    });
    expect(chips(wrapper)).toEqual(["English", "French", "German", "+2 more"]);
    expect(more(wrapper, "+2 more").attributes("type")).toBe("button");
    expect(more(wrapper, "+2 more").attributes("aria-expanded")).toBe("false");

    await more(wrapper, "+2 more").trigger("click");
    // the button stays where the count was and the rest follows it
    expect(chips(wrapper)).toEqual([
      "English",
      "French",
      "German",
      "Show less",
      "Italian",
      "Spanish",
    ]);
    expect(more(wrapper, "Show less").attributes("aria-expanded")).toBe("true");
    expect(link(wrapper, "Italian")).toEqual({
      path: "/models",
      query: { language: "it" },
    });

    await more(wrapper, "Show less").trigger("click");
    expect(chips(wrapper)).toEqual(["English", "French", "German", "+2 more"]);
  });

  it("does not leave for the Metadata tab on a click on a count any more", async () => {
    const wrapper = mountHeader(modelProps);
    await more(wrapper, "+2 more").trigger("click");
    expect(wrapper.emitted("navigate-to-metadata")).toBeUndefined();
  });

  it("unfolds the free tags after their count and leads the rest to the discovery page too", async () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(manyTags),
    });
    await more(wrapper, "+3 more").trigger("click");

    expect(chips(wrapper)).toEqual([
      "tag0",
      "tag1",
      "tag2",
      "tag3",
      "tag4",
      "tag5",
      "Show less",
      "tag6",
      "tag7",
      "tag8",
    ]);
    expect(link(wrapper, "tag8")).toEqual({
      path: "/models",
      query: { tag: "tag8" },
    });
    await more(wrapper, "Show less").trigger("click");
    expect(chips(wrapper)).toHaveLength(7);
  });

  it("unfolds the tasks of a dataset after their count", async () => {
    const wrapper = mountHeader({
      repoType: "dataset",
      metadata: {
        task_categories: ["a", "b", "c", "d", "e"],
      },
    });
    expect(chips(wrapper)).toEqual(["a", "b", "+3 more"]);

    await more(wrapper, "+3 more").trigger("click");
    expect(chips(wrapper)).toEqual(["a", "b", "Show less", "c", "d", "e"]);
    const rest = wrapper
      .findAll("[data-el-tag='true']")
      .filter((tag) => ["c", "d", "e"].includes(tag.text()));
    for (const tag of rest) {
      expect(tag.attributes("data-type")).toBe("success");
      expect(tag.find(".i-carbon-checkbox-checked").exists()).toBe(true);
    }

    await more(wrapper, "Show less").trigger("click");
    expect(chips(wrapper)).toEqual(["a", "b", "+3 more"]);
  });

  it("counts the papers after the second and unfolds the rest, away from the site and safely", async () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(papers),
    });
    expect(chips(wrapper)).toEqual([
      "arXiv:2401.00001",
      "arXiv:2401.00002",
      "+2 more",
    ]);

    await more(wrapper, "+2 more").trigger("click");
    expect(chips(wrapper)).toEqual([
      "arXiv:2401.00001",
      "arXiv:2401.00002",
      "Show less",
      "arXiv:2401.00003",
      "arXiv:2401.00004",
    ]);
    const rest = wrapper.find("a[href='https://arxiv.org/abs/2401.00004']");
    expect(rest.exists()).toBe(true);
    expect(rest.attributes("target")).toBe("_blank");
    expect(rest.attributes("rel")).toBe("noopener noreferrer");

    await more(wrapper, "Show less").trigger("click");
    expect(chips(wrapper)).toHaveLength(3);
  });

  it("has no count for two papers or fewer", () => {
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(papers.slice(0, 2)),
    });
    expect(chips(wrapper)).toEqual(["arXiv:2401.00001", "arXiv:2401.00002"]);
  });

  it("unfolds each group on its own", async () => {
    const wrapper = mountHeader(modelProps);
    await more(wrapper, "+2 more").trigger("click"); // the languages

    expect(chips(wrapper)).toEqual(expect.arrayContaining(["Italian"]));
    expect(chips(wrapper)).not.toContain("tag6");
    expect(chips(wrapper)).not.toContain("arXiv:2401.00003");
    // the tags and the papers still have their own counts
    expect(more(wrapper, "+3 more")).toBeDefined();
    expect(more(wrapper, "+2 more")).toBeDefined();

    await more(wrapper, "+3 more").trigger("click"); // the tags
    expect(chips(wrapper)).toContain("tag6");
    expect(chips(wrapper)).toContain("Italian");
  });

  it("holds an open header to a scrolling box, and only an open one", async () => {
    const wrapper = mountHeader(modelProps);
    const box = () => wrapper.get(".metadata-header > div");
    expect(box().classes()).not.toContain("metadata-header-open");

    await more(wrapper, "+2 more").trigger("click");
    expect(box().classes()).toContain("metadata-header-open");

    await more(wrapper, "Show less").trigger("click");
    expect(box().classes()).not.toContain("metadata-header-open");
  });

  it("offers the way to the Metadata tab while anything is open, and only then", async () => {
    const wrapper = mountHeader(modelProps);
    expect(metadataLink(wrapper)).toBeUndefined();

    await more(wrapper, "+2 more").trigger("click");
    await more(wrapper, "+3 more").trigger("click");
    expect(metadataLink(wrapper).attributes("type")).toBe("button");

    // one group folded, one still open: the link stays
    await more(wrapper, "Show less").trigger("click");
    expect(metadataLink(wrapper)).toBeDefined();

    await more(wrapper, "Show less").trigger("click");
    expect(metadataLink(wrapper)).toBeUndefined();
  });

  it("takes the way to the Metadata tab that a count used to take", async () => {
    const wrapper = mountHeader(modelProps);
    await more(wrapper, "+2 more").trigger("click");

    await metadataLink(wrapper).trigger("click");
    expect(wrapper.emitted("navigate-to-metadata")).toHaveLength(1);
  });

  it("counts tasks for a dataset only: a model or a Space has none to show", () => {
    const metadata = { task_categories: ["a", "b", "c"] };
    for (const repoType of ["model", "space"]) {
      const shown = chips(mountHeader({ repoType, metadata }));
      expect(shown.some((text) => text.includes("more"))).toBe(false);
    }
  });

  it("shows the free tags of a model only", () => {
    const wrapper = mountHeader({
      repoType: "dataset",
      metadata: {},
      ...splitTags(manyTags),
    });
    expect(chips(wrapper)).toEqual([]);
  });
});
