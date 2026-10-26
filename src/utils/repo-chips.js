// What a repository card says about a repository, in the words and colours of the repository header
// (MetadataHeader): the task, the library or SDK, the license, the size of a dataset, then the free
// tags. Each chip says where it leads on the discovery page. The list API gives `pipeline_tag`,
// `library_name` and `sdk` as fields and everything else as tags, some of them prefixed
// (`license:mit`, `task_categories:…`) and some of no use on a card (`region:us`, languages).
import { LIBRARY_LABELS, splitTags } from "./repo-derived";
import { getLicenseName, getPipelineTagName } from "./metadata-helpers";
import { SPACE_SDKS } from "./repository-types";

const text = (value) => (typeof value === "string" && value ? value : null);
const withPrefix = (tags, prefix) =>
  tags
    .filter((tag) => tag.startsWith(prefix) && tag.length > prefix.length)
    .map((tag) => tag.slice(prefix.length));
// Two-letter language codes are tags of their own on models (`en`); datasets say `language:en`
const LANGUAGE_TAG = /^[a-z]{2}$/;

const chip = (kind, id, label, query, look = {}) => ({
  kind,
  id: `${kind}:${id}`,
  label,
  query,
  tone: "",
  icon: "",
  plain: false,
  ...look,
});
const TASK = { tone: "warning", icon: "i-carbon-task" };
const DATASET_TASK = { tone: "success", icon: "i-carbon-checkbox-checked" };
const LIBRARY = { tone: "success", icon: "i-carbon-cube" };
const SDK = { tone: "success", icon: "i-carbon-application" };
const LICENSE = { tone: "info", icon: "i-carbon-document" };
const SIZE = { tone: "danger", icon: "i-carbon-data-volume" };
const PLAIN = { plain: true };

/**
 * The chips of a repository, most telling first. The card shows the first few and counts the rest.
 * `type` is "model", "dataset" or "space".
 */
export function repoChips(repo, type) {
  const fields = repo || {};
  const tags = (Array.isArray(fields.tags) ? fields.tags : []).filter(
    (tag) => typeof tag === "string" && tag,
  );
  const licenseId = withPrefix(tags, "license:")[0];
  const license = licenseId
    ? chip(
        "license",
        licenseId,
        getLicenseName(licenseId),
        { license: licenseId },
        LICENSE,
      )
    : null;
  // A prefixed tag is either read above or of no use on a card; `diffusers:` is read by `splitTags`
  const free = tags.filter(
    (tag) => !tag.includes(":") || tag.startsWith("diffusers:"),
  );
  const { libraries, others } = splitTags(free, {
    libraryName: type === "model" ? text(fields.library_name) : null,
    pipelineTag: text(fields.pipeline_tag),
    languages: free.filter((tag) => LANGUAGE_TAG.test(tag)),
  });
  const sdk = type === "space" ? text(fields.sdk) : null;
  const tagChips = others
    .filter((tag) => tag.id !== sdk)
    .map((tag) => chip("tag", tag.id, tag.label, tag.query, PLAIN));

  if (type === "dataset") {
    const tasks = withPrefix(tags, "task_categories:").map((id) =>
      chip("task", id, getPipelineTagName(id), { task: id }, DATASET_TASK),
    );
    const size = withPrefix(tags, "size_categories:")[0];
    return [
      ...tasks.slice(0, 1),
      ...(size ? [chip("size", size, size, { size }, SIZE)] : []),
      ...(license ? [license] : []),
      ...tasks.slice(1),
      ...withPrefix(tags, "modality:").map((id) =>
        chip("modality", id, id, { modality: id }, PLAIN),
      ),
      ...withPrefix(tags, "format:").map((id) =>
        chip("format", id, id, { format: id }, PLAIN),
      ),
      ...tagChips,
    ];
  }

  const pipeline = type === "model" ? text(fields.pipeline_tag) : null;
  const libraryChips = (type === "model" ? libraries : []).map((item) =>
    chip(
      "library",
      item.id,
      LIBRARY_LABELS[item.id] || item.label,
      item.query,
      LIBRARY,
    ),
  );
  const sdkChip = sdk
    ? chip(
        "sdk",
        sdk,
        SPACE_SDKS.find((item) => item.value === sdk)?.label || sdk,
        { sdk },
        SDK,
      )
    : null;
  return [
    ...(pipeline
      ? [
          chip(
            "task",
            pipeline,
            getPipelineTagName(pipeline),
            { task: pipeline },
            TASK,
          ),
        ]
      : []),
    ...libraryChips.slice(0, 1),
    ...(sdkChip ? [sdkChip] : []),
    ...(license ? [license] : []),
    ...libraryChips.slice(1),
    ...tagChips,
  ];
}
