// What the API says about a repository that its README does not: the library and the frameworks, the
// task, the size and the architecture of a model. The names and the grouping are the Hub's: the tags
// of twelve real models, typed by huggingface.co, are the golden data of the tests.

// The libraries and frameworks the Hub gives a name (`tag_objs` of its model pages)
export const LIBRARY_LABELS = {
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
  "transformers.js": "Transformers.js",
  timm: "timm",
  "sentence-transformers": "sentence-transformers",
  fasttext: "fastText",
  spacy: "spaCy",
};

const OTHER_LABELS = {
  endpoints_compatible: "Inference Endpoints",
  "eval-results": "Eval Results",
  "model-index": "Eval Results (legacy)",
};

// Tags with a place of their own on the page (license, datasets, base model) or none (region, deploy)
const SKIPPED_PREFIXES = [
  "region:",
  "license:",
  "dataset:",
  "base_model:",
  "deploy:",
  "doi:",
];

// A new-style (2307.01952) or old-style (hep-th/9901001) arXiv id: nothing else becomes a link
const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/;

/**
 * The tags of a repository, grouped for the header: its libraries and frameworks (the library of the
 * repository first, then the others in the order of the tags), the free tags, and the arXiv papers.
 * The task, the languages and what has a place of its own are left out. Each chip says where it leads
 * on the discovery page (`query`).
 */
export function splitTags(
  tags,
  { libraryName = null, pipelineTag = null, languages = [] } = {},
) {
  const out = { libraries: [], others: [], arxiv: [] };
  const seen = new Set();
  const addLibrary = (id) =>
    out.libraries.push({
      id,
      label: LIBRARY_LABELS[id] || id,
      query: id === libraryName ? { library: id } : { tag: id },
    });

  if (typeof libraryName === "string" && libraryName) {
    addLibrary(libraryName);
    seen.add(libraryName);
  }
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== "string" || !tag || seen.has(tag)) continue;
    seen.add(tag);
    if (tag === pipelineTag || languages.includes(tag)) continue;
    if (SKIPPED_PREFIXES.some((prefix) => tag.startsWith(prefix))) continue;
    if (tag.startsWith("arxiv:") && ARXIV_ID.test(tag.slice(6))) {
      const paper = tag.slice(6);
      out.arxiv.push({
        id: tag,
        label: `arXiv:${paper}`,
        url: `https://arxiv.org/abs/${paper}`,
      });
      continue;
    }
    if (LIBRARY_LABELS[tag]) {
      addLibrary(tag);
      continue;
    }
    const label = tag.startsWith("diffusers:")
      ? tag.slice("diffusers:".length)
      : OTHER_LABELS[tag] || tag;
    out.others.push({ id: tag, label, query: { tag } });
  }
  // The pipeline class of a diffusers repository leads the free tags, as on the Hub
  out.others.sort(
    (a, b) => b.id.startsWith("diffusers:") - a.id.startsWith("diffusers:"),
  );
  return out;
}

const SMALL_UNITS = [
  ["", 1],
  ["K", 1e3],
  ["M", 1e6],
];

// Three significant digits
function scaled(count, size) {
  const value = count / size;
  return Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2));
}

/** 137022720 -> "137M", 1235814400 -> "1.24B": three significant digits; `null` for what is no count. */
export function formatParameters(count) {
  if (!Number.isInteger(count) || count <= 0) return null;
  for (const [suffix, size] of SMALL_UNITS) {
    const rounded = scaled(count, size);
    if (rounded < 1000) return `${rounded}${suffix}`; // 999999 is 1M, not 1000K
  }
  return `${scaled(count, 1e9)}B`;
}

/** 0.9831 -> "98.3%", 0.0004 -> "<0.1%"; what is not all of it is never "100%". */
export function formatShare(share) {
  const percent = share * 100;
  if (percent < 0.1) return "<0.1%";
  const rounded = Number(percent.toFixed(1));
  return rounded >= 100 && share < 1 ? "99.9%" : `${rounded}%`;
}

/** The tensor types of `safetensors` ({parameters: {dtype: count}}), the biggest first, with their share. */
export function tensorTypes(safetensors) {
  const parameters =
    safetensors && typeof safetensors === "object"
      ? safetensors.parameters
      : null;
  if (!parameters || typeof parameters !== "object") return [];
  const rows = Object.entries(parameters).filter(
    ([, count]) => Number.isInteger(count) && count > 0,
  );
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return rows
    .map(([dtype, count]) => ({ dtype, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The README metadata the page shows, with what the API knows laid over it: the library and the task
 * of a model (the API reads the files, the README only says what its author wrote), the sdk of a Space.
 * What the API does not say (an older backend, a field it has no value for) stays as the README has it.
 */
export function mergeDisplayMetadata(readme, info, repoType) {
  const merged = { ...(readme || {}) };
  const take = (key) => {
    const value = info?.[key];
    if (typeof value === "string" && value) merged[key] = value;
  };
  if (repoType === "model") {
    take("library_name");
    take("pipeline_tag");
  } else if (repoType === "space") {
    take("sdk");
  }
  return merged;
}

const names = (values) =>
  Array.isArray(values) ? values.filter((v) => typeof v === "string" && v) : [];

/** The size, tensor types and architecture of a model, or `null` when the API has none of them. */
export function modelSummary(info) {
  const config =
    info?.config && typeof info.config === "object" ? info.config : {};
  const summary = {
    parameters: formatParameters(info?.safetensors?.total),
    tensorTypes: tensorTypes(info?.safetensors),
    architectures: names(config.architectures),
    modelType:
      typeof config.model_type === "string" && config.model_type
        ? config.model_type
        : null,
  };
  const empty =
    !summary.parameters &&
    !summary.tensorTypes.length &&
    !summary.architectures.length &&
    !summary.modelType;
  return empty ? null : summary;
}
