/**
 * YAML frontmatter parser for repository cards
 */

import yaml from "js-yaml";

/**
 * Parse YAML frontmatter from markdown
 * @param {string} markdown - Markdown with YAML frontmatter
 * @returns {{metadata: Object, content: string}} Parsed metadata and remaining content
 */
export function parseYAMLFrontmatter(markdown) {
  if (!markdown) return { metadata: {}, content: "" };

  const opening = /^\uFEFF?[ \t]*---[ \t]*\r?\n/.exec(markdown);
  if (!opening) {
    return { metadata: {}, content: markdown };
  }
  const rest = markdown.slice(opening[0].length);
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) return { metadata: {}, content: markdown };
  const yamlContent = rest.slice(0, closing.index);
  const content = rest.slice(closing.index + closing[0].length);

  try {
    const raw = yaml.load(yamlContent);
    const metadata =
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return { metadata, content };
  } catch (err) {
    console.error("YAML parse error:", err);
    return { metadata: {}, content: markdown };
  }
}

/**
 * Normalize metadata values (string | string[] → string[])
 * @param {Object} metadata - Raw metadata object
 * @returns {Object} Normalized metadata
 */
export function normalizeMetadata(metadata) {
  if (!metadata) return {};

  const normalized = { ...metadata };

  // Normalize to arrays
  const arrayFields = [
    "language",
    "tags",
    "datasets",
    "base_model",
    "metrics",
    "task_categories",
    "annotations_creators",
    "language_creators",
    "source_datasets",
    "size_categories",
  ];

  arrayFields.forEach((field) => {
    if (normalized[field] && !Array.isArray(normalized[field])) {
      normalized[field] = [normalized[field]];
    }
  });

  return normalized;
}

/**
 * Get fields that should be displayed in specialized cards
 * @returns {Set<string>} Set of field names
 */
export function getSpecializedFields() {
  return new Set([
    "license",
    "license_name",
    "license_link",
    "language",
    "library_name",
    "pipeline_tag",
    "base_model",
    "datasets",
    "task_categories",
    "size_categories",
    "multilinguality",
    "annotations_creators",
    "language_creators",
    "source_datasets",
    "eval_results",
    "tags", // Already displayed separately
  ]);
}

/**
 * Get metadata fields not covered by specialized cards
 * @param {Object} metadata - Full metadata object
 * @returns {Object} Remaining metadata fields
 */
export function getOtherMetadata(metadata) {
  const specialized = getSpecializedFields();
  const other = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!specialized.has(key)) {
      other[key] = value;
    }
  }

  return other;
}
