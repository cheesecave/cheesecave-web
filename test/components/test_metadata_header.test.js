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

  it("shows the first free tags and says how many more there are", async () => {
    const tags = Array.from({ length: 9 }, (_, n) => `tag${n}`);
    const wrapper = mountHeader({
      repoType: "model",
      metadata: {},
      ...splitTags(tags),
    });

    expect(chips(wrapper).filter((t) => t.startsWith("tag"))).toHaveLength(6);
    const more = wrapper
      .findAll("[data-el-tag='true']")
      .find((t) => t.text() === "+3 more");
    expect(more.exists()).toBe(true);
    await more.trigger("click");
    expect(wrapper.emitted("navigate-to-metadata")).toHaveLength(1);
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
