import {
  getLanguageName,
  getLicenseName,
  getPipelineTagName,
  formatSizeCategory,
} from "./metadata-helpers";
import { REPOSITORY_SORT_VALUES } from "./repository-sorts";

export const facetKeys = [
  "task",
  "library",
  "language",
  "license",
  "tag",
  "size",
  "format",
  "modality",
  "sdk",
];
export const discoverySorts = REPOSITORY_SORT_VALUES;
export const discoveryPageSize = 24;

export function facetLabel(key, value) {
  if (key === "task" && value === "image-text-to-text")
    return "Image-Text-to-Text";
  if (key === "task") return getPipelineTagName(value);
  if (key === "language") return getLanguageName(value);
  if (key === "license") return getLicenseName(value);
  if (key === "size") return formatSizeCategory(value);
  if (key === "library" || key === "sdk") {
    return (
      {
        transformers: "Transformers",
        pytorch: "PyTorch",
        tensorflow: "TensorFlow",
        gradio: "Gradio",
        streamlit: "Streamlit",
        docker: "Docker",
        static: "Static",
      }[value] || value
    );
  }
  return value;
}

export function readDiscoveryQuery(query, fallbackSort) {
  const first = (value) => (Array.isArray(value) ? value[0] : value);
  const selected = {};
  for (const key of facetKeys) {
    const values = Array.isArray(query[key]) ? query[key] : [query[key]];
    const clean = [
      ...new Set(
        values
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => value.trim().toLowerCase()),
      ),
    ].sort();
    if (clean.length) selected[key] = clean;
  }
  const page = Number(first(query.page));
  return {
    search: String(first(query.search) || "").trim(),
    sort: discoverySorts.includes(first(query.sort))
      ? first(query.sort)
      : fallbackSort,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    selected,
  };
}

export function discoveryParams(state) {
  const params = new URLSearchParams({
    sort: state.sort,
    limit: String(discoveryPageSize),
    offset: String((state.page - 1) * discoveryPageSize),
  });
  if (state.search) params.set("search", state.search);
  for (const key of facetKeys)
    for (const value of state.selected[key] || []) params.append(key, value);
  return params;
}

export function discoveryQuery(state, previous = {}) {
  const query = { ...previous };
  for (const key of [...facetKeys, "search", "sort", "page"]) delete query[key];
  if (state.search) query.search = state.search;
  query.sort = state.sort;
  if (state.page > 1) query.page = String(state.page);
  for (const key of facetKeys)
    if (state.selected[key]?.length) query[key] = state.selected[key];
  return query;
}
