import { describe, expect, it } from "vitest";

import { repoChips } from "@/utils/repo-chips";

// Tags as the list API gives them for real repositories (taken from the public hub, trimmed)
const model = {
  pipeline_tag: "zero-shot-image-classification",
  library_name: "dghs-imgutils",
  tags: [
    "dghs-imgutils",
    "zero-shot-image-classification",
    "art",
    "anime",
    "character",
    "en",
    "ja",
    "zh",
    "dataset:deepghs/character_similarity",
    "license:openrail",
    "region:us",
  ],
};
const dataset = {
  tags: [
    "annotations_creators:no-annotation",
    "source_datasets:subsplease",
    "task_categories:text-generation",
    "task_categories:question-answering",
    "size_categories:10K<n<100K",
    "language:en",
    "language:ja",
    "license:other",
    "modality:text",
    "format:parquet",
    "library:datasets",
    "library:pandas",
    "region:us",
    "art",
    "anime",
  ],
};
const space = { sdk: "static", tags: ["static", "mcp-server", "region:us"] };

const ids = (chips) => chips.map((chip) => chip.label);

describe("repoChips: what a repository card says about a repository", () => {
  it("puts the task, the library and the license of a model first, then its free tags", () => {
    expect(ids(repoChips(model, "model"))).toEqual([
      // the name the header and the filters give a task the helper has no name for
      "Zero-Shot-Image-Classification",
      "dghs-imgutils",
      "OPENRAIL",
      "art",
      "anime",
      "character",
    ]);
  });

  it("leaves out what has no place on a card: region, languages, datasets, the task and library again as tags", () => {
    const all = repoChips(model, "model").map((chip) => chip.label);
    expect(all.join(" ")).not.toMatch(
      /region|dataset:|\ben\b|\bja\b|\bzh\b|license:/,
    );
    expect(all.filter((label) => label === "dghs-imgutils")).toHaveLength(1);
  });

  it("says where each chip leads on the discovery page, as the repository header does", () => {
    const byKind = Object.fromEntries(
      repoChips(model, "model").map((chip) => [chip.kind, chip.query]),
    );
    expect(byKind).toEqual({
      task: { task: "zero-shot-image-classification" },
      library: { library: "dghs-imgutils" },
      license: { license: "openrail" },
      tag: { tag: "character" },
    });
  });

  it("names things the way the header does", () => {
    const chips = repoChips(
      {
        pipeline_tag: "text-generation",
        library_name: "transformers",
        tags: [
          "transformers",
          "pytorch",
          "license:apache-2.0",
          "endpoints_compatible",
        ],
      },
      "model",
    );
    expect(ids(chips)).toEqual([
      "Text Generation",
      "Transformers",
      "Apache License 2.0",
      "PyTorch",
      "Inference Endpoints",
    ]);
    // a library that is only a tag filters by tag, not by library
    expect(chips.find((chip) => chip.label === "PyTorch").query).toEqual({
      tag: "pytorch",
    });
  });

  it("takes the first library from the tags when the repository names none", () => {
    expect(
      ids(
        repoChips(
          { tags: ["onnx", "art", "license:mit", "region:us"] },
          "model",
        ),
      ),
    ).toEqual(["ONNX", "MIT License", "art"]);
  });

  it("reads a dataset from its prefixed tags: task, size, license, then the rest", () => {
    const chips = repoChips(dataset, "dataset");
    expect(ids(chips)).toEqual([
      "Text Generation",
      "10K<n<100K",
      "Other License",
      "Question Answering",
      "text",
      "parquet",
      "art",
      "anime",
    ]);
    expect(chips.map((chip) => chip.query)).toEqual([
      { task: "text-generation" },
      { size: "10K<n<100K" },
      { license: "other" },
      { task: "question-answering" },
      { modality: "text" },
      { format: "parquet" },
      { tag: "art" },
      { tag: "anime" },
    ]);
  });

  it("shows the SDK of a space, not the same word again as a tag", () => {
    const chips = repoChips(space, "space");
    expect(ids(chips)).toEqual(["Static", "mcp-server"]);
    expect(chips[0].query).toEqual({ sdk: "static" });
    expect(
      ids(repoChips({ sdk: "gradio", tags: ["gradio", "region:us"] }, "space")),
    ).toEqual(["Gradio"]);
  });

  it("gives each kind the colour and icon the header gives it", () => {
    const [task, library, license, tag] = repoChips(model, "model");
    expect([task.tone, task.icon]).toEqual(["warning", "i-carbon-task"]);
    expect([library.tone, library.icon]).toEqual(["success", "i-carbon-cube"]);
    expect([license.tone, license.icon]).toEqual(["info", "i-carbon-document"]);
    expect([tag.tone, tag.icon, tag.plain]).toEqual(["", "", true]);
    const [dataTask, size] = repoChips(dataset, "dataset");
    expect([dataTask.tone, dataTask.icon]).toEqual([
      "success",
      "i-carbon-checkbox-checked",
    ]);
    expect([size.tone, size.icon]).toEqual(["danger", "i-carbon-data-volume"]);
    expect(repoChips(space, "space")[0]).toMatchObject({
      tone: "success",
      icon: "i-carbon-application",
    });
  });

  it("says nothing for a repository with nothing to say, and survives odd input", () => {
    expect(repoChips({}, "model")).toEqual([]);
    expect(repoChips({ tags: "not a list" }, "model")).toEqual([]);
    expect(repoChips({ tags: [null, 3, "", "region:us"] }, "dataset")).toEqual(
      [],
    );
    expect(repoChips(undefined, "model")).toEqual([]);
    expect(repoChips({ sdk: "custom-sdk" }, "space")).toMatchObject([
      { label: "custom-sdk" },
    ]);
    expect(
      repoChips({ tags: ["size_categories:", "task_categories:"] }, "dataset"),
    ).toEqual([]);
  });
});
