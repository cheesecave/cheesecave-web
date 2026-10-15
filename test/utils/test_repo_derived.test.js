import { describe, expect, it } from "vitest";

import realHub from "../fixtures/real_hub_tags.json";
import {
  LIBRARY_LABELS,
  formatParameters,
  formatShare,
  mergeDisplayMetadata,
  modelSummary,
  splitTags,
  tensorTypes,
} from "@/utils/repo-derived";

const ids = (chips) => chips.map((c) => c.id);

describe("splitTags", () => {
  it("has nothing to say about no tags", () => {
    for (const tags of [undefined, null, "transformers", {}, []]) {
      expect(splitTags(tags)).toEqual({ libraries: [], others: [], arxiv: [] });
    }
  });

  it("ignores what is not a tag", () => {
    expect(
      splitTags([null, 3, {}, "", "pytorch"]).libraries.map((c) => c.id),
    ).toEqual(["pytorch"]);
  });

  it("puts the library of the repository first and the frameworks after it, as the Hub does", () => {
    const { libraries } = splitTags(
      ["pytorch", "safetensors", "transformers", "gpt2"],
      { libraryName: "transformers" },
    );

    expect(libraries).toEqual([
      {
        id: "transformers",
        label: "Transformers",
        query: { library: "transformers" },
      },
      { id: "pytorch", label: "PyTorch", query: { tag: "pytorch" } },
      {
        id: "safetensors",
        label: "Safetensors",
        query: { tag: "safetensors" },
      },
    ]);
  });

  it("names a library the Hub does not label by its own id", () => {
    const { libraries } = splitTags(["bertopic"], { libraryName: "bertopic" });

    expect(libraries).toEqual([
      { id: "bertopic", label: "bertopic", query: { library: "bertopic" } },
    ]);
  });

  it("shows the library even when the tags do not carry it", () => {
    expect(ids(splitTags([], { libraryName: "timm" }).libraries)).toEqual([
      "timm",
    ]);
  });

  it("knows the frameworks the backend derives, with the Hub's names", () => {
    expect(LIBRARY_LABELS).toMatchObject({
      transformers: "Transformers",
      diffusers: "Diffusers",
      pytorch: "PyTorch",
      tf: "TensorFlow",
      jax: "JAX",
      tflite: "LiteRT",
      rust: "Rust",
      onnx: "ONNX",
      safetensors: "Safetensors",
      gguf: "GGUF",
      openvino: "OpenVINO",
      coreml: "Core ML",
      mlx: "MLX",
    });
  });

  it("keeps a tag once", () => {
    const out = splitTags(["pytorch", "pytorch", "exbert", "exbert"]);

    expect(ids(out.libraries)).toEqual(["pytorch"]);
    expect(ids(out.others)).toEqual(["exbert"]);
  });

  it("does not repeat the task, which is a pill of its own", () => {
    expect(
      ids(
        splitTags(["text-generation", "exbert"], {
          pipelineTag: "text-generation",
        }).others,
      ),
    ).toEqual(["exbert"]);
  });

  it("does not repeat a language, license, dataset, base model, region, deploy target or doi", () => {
    const tags = [
      "en",
      "license:mit",
      "dataset:squad",
      "base_model:org/base",
      "base_model:quantized:org/base",
      "region:us",
      "deploy:azure",
      "doi:10.1/x",
      "exbert",
    ];

    expect(ids(splitTags(tags, { languages: ["en"] }).others)).toEqual([
      "exbert",
    ]);
  });

  it("links an arXiv paper and drops one it cannot link safely", () => {
    const { arxiv, others } = splitTags([
      "arxiv:2307.01952v2",
      "arxiv:hep-th/9901001",
      "arxiv:not an id",
      "arxiv:",
    ]);

    expect(arxiv).toEqual([
      {
        id: "arxiv:2307.01952v2",
        label: "arXiv:2307.01952v2",
        url: "https://arxiv.org/abs/2307.01952v2",
      },
      {
        id: "arxiv:hep-th/9901001",
        label: "arXiv:hep-th/9901001",
        url: "https://arxiv.org/abs/hep-th/9901001",
      },
    ]);
    expect(ids(others)).toEqual(["arxiv:not an id", "arxiv:"]);
  });

  it("names the pipeline class of a diffusers repository and the labels the Hub gives", () => {
    const { others } = splitTags([
      "endpoints_compatible",
      "eval-results",
      "model-index",
      "llama",
      "diffusers:FluxPipeline",
    ]);

    // the pipeline class leads, as on the Hub; the rest keeps the order of the tags
    expect(others.map((c) => [c.id, c.label])).toEqual([
      ["diffusers:FluxPipeline", "FluxPipeline"],
      ["endpoints_compatible", "Inference Endpoints"],
      ["eval-results", "Eval Results"],
      ["model-index", "Eval Results (legacy)"],
      ["llama", "llama"],
    ]);
    expect(others.every((c) => c.query.tag === c.id)).toBe(true);
  });
});

// Hugging Face's own typing of the tags of real models (`tag_objs` of the model page): what it calls
// a library is what we call one, with the same names, and what we leave out of the chips is what it types
// as something else.
describe("splitTags against what the real Hub shows", () => {
  it.each(realHub.map((m) => [m.id, m]))("%s", (_id, model) => {
    const real = (type) => model.tag_objs.filter((o) => o.type === type);
    const out = splitTags(model.tags, {
      libraryName: model.library_name,
      pipelineTag: model.pipeline_tag,
      languages: Array.isArray(model.languages)
        ? model.languages
        : model.languages
          ? [model.languages]
          : [],
    });

    expect(out.libraries.map((c) => [c.id, c.label])).toEqual(
      [...real("library")]
        .sort((a, b) =>
          a.id === model.library_name
            ? -1
            : b.id === model.library_name
              ? 1
              : 0,
        )
        .map((o) => [o.id, o.label]),
    );
    expect(out.arxiv.map((c) => c.id)).toEqual(real("arxiv").map((o) => o.id));
    // The Hub types a base model as an "other" tag and shows it as a chip; the page has a Base Model card
    // of its own for it, so it is left out of the chips on purpose
    const realOther = real("other").filter(
      (o) => !o.id.startsWith("base_model:"),
    );
    expect(out.others.map((c) => [c.id, c.label])).toEqual(
      realOther.map((o) => [o.id, o.label]),
    );
    const shown = new Set([
      ...ids(out.libraries),
      ...ids(out.others),
      ...ids(out.arxiv),
    ]);
    for (const type of [
      "license",
      "region",
      "deploy",
      "dataset",
      "doi",
      "pipeline_tag",
    ])
      for (const o of real(type)) expect(shown.has(o.id)).toBe(false);
  });
});

describe("formatParameters", () => {
  it.each([
    [137022720, "137M"],
    [1235814400, "1.24B"],
    [22713728, "22.7M"],
    [126851, "127K"],
    [8030261248, "8.03B"],
    [70553706496, "70.6B"],
    [405000000000, "405B"],
    [1000000000, "1B"],
    [999, "999"],
    [1, "1"],
    [1000, "1K"],
    [999999, "1M"],
    [999999999, "1B"],
  ])("%d params is %s", (count, text) => {
    expect(formatParameters(count)).toBe(text);
  });

  it.each([0, -5, NaN, Infinity, "12", null, undefined, 1.5])(
    "says nothing for %s",
    (value) => {
      expect(formatParameters(value)).toBeNull();
    },
  );
});

describe("tensorTypes", () => {
  it("lists the types by size, with their share", () => {
    expect(
      tensorTypes({ parameters: { F32: 25, BF16: 75 }, total: 100 }),
    ).toEqual([
      { dtype: "BF16", count: 75, share: 0.75 },
      { dtype: "F32", count: 25, share: 0.25 },
    ]);
  });

  it.each([
    undefined,
    null,
    {},
    { parameters: null },
    { parameters: {}, total: 0 },
    { parameters: { F32: 0 } },
    { parameters: { F32: "x" } },
    "x",
  ])("has no types for %j", (value) => {
    expect(tensorTypes(value)).toEqual([]);
  });
});

describe("mergeDisplayMetadata", () => {
  const readme = {
    license: "mit",
    library_name: "from-readme",
    pipeline_tag: "fill-mask",
    sdk: "static",
    tags: ["x"],
  };

  it("takes the library and the task of a model from the API, which knows the files", () => {
    const merged = mergeDisplayMetadata(
      readme,
      { library_name: "transformers", pipeline_tag: "text-generation" },
      "model",
    );

    expect(merged).toMatchObject({
      license: "mit",
      library_name: "transformers",
      pipeline_tag: "text-generation",
    });
  });

  it("keeps what the README says where the API says nothing (an older backend, or an unknown)", () => {
    for (const info of [
      null,
      undefined,
      {},
      { library_name: null, pipeline_tag: "" },
      { library_name: 3 },
    ]) {
      expect(mergeDisplayMetadata(readme, info, "model")).toMatchObject({
        library_name: "from-readme",
        pipeline_tag: "fill-mask",
      });
    }
  });

  it("gives a repository without a README the API's values", () => {
    expect(
      mergeDisplayMetadata(
        {},
        { library_name: "timm", pipeline_tag: "image-classification" },
        "model",
      ),
    ).toEqual({
      library_name: "timm",
      pipeline_tag: "image-classification",
    });
  });

  it("takes the sdk of a Space from the API", () => {
    expect(mergeDisplayMetadata({}, { sdk: "gradio" }, "space")).toEqual({
      sdk: "gradio",
    });
    expect(mergeDisplayMetadata(readme, { sdk: "docker" }, "space").sdk).toBe(
      "docker",
    );
    expect(mergeDisplayMetadata(readme, {}, "space").sdk).toBe("static");
  });

  it("leaves a dataset as the README has it, and never changes its input", () => {
    const before = JSON.stringify(readme);

    expect(
      mergeDisplayMetadata(readme, { library_name: "x", sdk: "y" }, "dataset"),
    ).toEqual(readme);
    mergeDisplayMetadata(readme, { library_name: "x" }, "model");
    expect(JSON.stringify(readme)).toBe(before);
    expect(mergeDisplayMetadata(undefined, null, "model")).toEqual({});
  });
});

describe("modelSummary", () => {
  it("tells the size, the types and the architecture of a model", () => {
    const info = {
      safetensors: { parameters: { BF16: 1235814400 }, total: 1235814400 },
      config: { architectures: ["LlamaForCausalLM"], model_type: "llama" },
    };

    expect(modelSummary(info)).toEqual({
      parameters: "1.24B",
      tensorTypes: [{ dtype: "BF16", count: 1235814400, share: 1 }],
      architectures: ["LlamaForCausalLM"],
      modelType: "llama",
    });
  });

  it("has what it has: a config without weights, weights without a config", () => {
    expect(modelSummary({ config: { model_type: "bert" } })).toEqual({
      parameters: null,
      tensorTypes: [],
      architectures: [],
      modelType: "bert",
    });
    expect(
      modelSummary({ safetensors: { parameters: { F32: 8 }, total: 8 } }),
    ).toEqual({
      parameters: "8",
      tensorTypes: [{ dtype: "F32", count: 8, share: 1 }],
      architectures: [],
      modelType: null,
    });
  });

  it("is null when there is nothing to show", () => {
    for (const info of [
      undefined,
      null,
      {},
      { config: {} },
      { config: { architectures: [3], model_type: 4 } },
      { safetensors: null },
    ]) {
      expect(modelSummary(info)).toBeNull();
    }
  });

  it("keeps only the architectures that are names", () => {
    expect(
      modelSummary({ config: { architectures: ["A", 3, "", null, "B"] } })
        .architectures,
    ).toEqual(["A", "B"]);
  });
});

describe("formatShare", () => {
  it.each([
    [1, "100%"],
    [0.75, "75%"],
    [0.9831, "98.3%"],
    [0.0123, "1.2%"],
    [0.0004, "<0.1%"],
    [0.999977, "99.9%"], // not all of it, so not "100%" next to another type
  ])("%d is %s", (share, text) => {
    expect(formatShare(share)).toBe(text);
  });
});
