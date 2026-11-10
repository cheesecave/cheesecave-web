<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import { repositoryAccessAPI } from "@/utils/api";
import "@/markdown-styles/base.css";
const props = defineProps({
  repository: { type: Object, required: true },
  source: { type: String, default: "" },
  path: { type: String, default: "README.md" },
});
const emit = defineEmits(["open-file", "access-denied"]);
const thumbnails = ref({});
let generation = 0;
const markdown = new MarkdownIt({ html: true, linkify: true });
// Raw HTML is discarded before a browser can interpret resource-bearing tags.
markdown.renderer.rules.html_inline = () => "";
markdown.renderer.rules.html_block = () => "";
function relativePath(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (
    !value ||
    /^[\\/]|^[a-z][a-z0-9+.-]*:|[\\\u0000-\u001f\u007f]/i.test(value)
  )
    return null;
  value = value.split(/[?#]/)[0];
  if (!value) return null;
  const parts = props.path.split("/").slice(0, -1);
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}
function fileURL(path) {
  const repo = props.repository;
  return `/${repo.type}s/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;
}
markdown.renderer.rules.image = (tokens, index) => {
  const token = tokens[index],
    path = relativePath(token.attrGet("src")),
    image = path && thumbnails.value[path];
  const alt = markdown.utils.escapeHtml(token.content);
  return image ? `<img src="${image}" alt="${alt}" loading="lazy">` : alt;
};
markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  environment,
  renderer,
) => {
  const token = tokens[index],
    href = token.attrGet("href") || "",
    path = relativePath(href);
  if (path) {
    token.attrs = [
      ["href", fileURL(path)],
      ["data-guest-path", path],
    ];
  } else {
    let allowed = /^#[\w-]*$/.test(href);
    if (/^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href);
        allowed =
          url.origin !== window.location.origin &&
          !/\/(?:resolve|api)\//i.test(url.pathname);
      } catch {
        /* Invalid links remain plain text. */
      }
    }
    if (allowed)
      token.attrs = [
        ["href", href],
        ["rel", "noopener noreferrer"],
      ];
    else {
      token.tag = "span";
      token.attrs = [];
      let depth = 1;
      for (let offset = index + 1; offset < tokens.length; offset++) {
        depth += tokens[offset].nesting;
        if (!depth) {
          tokens[offset].tag = "span";
          break;
        }
      }
    }
  }
  return renderer.renderToken(tokens, index, options);
};
const html = computed(() => markdown.render(props.source));
function followLink(event) {
  const anchor = event.target.closest?.("a[data-guest-path]");
  if (
    !anchor ||
    event.button ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return;
  event.preventDefault();
  emit("open-file", anchor.dataset.guestPath);
}
function denied(error) {
  const status = error?.response?.status ?? error?.status,
    headers = error?.response?.headers;
  const code =
    headers?.get?.("x-error-code") ||
    headers?.["x-error-code"] ||
    headers?.["X-Error-Code"];
  return (
    status === 401 ||
    status === 403 ||
    (status === 404 && code === "RepoNotFound")
  );
}
watch(
  () => [JSON.stringify(props.repository), props.source, props.path],
  () => {
    const owner = ++generation,
      repo = { ...props.repository };
    thumbnails.value = {};
    const paths = new Set();
    function collect(tokens) {
      for (const token of tokens) {
        if (token.type === "image") {
          const path = relativePath(token.attrGet("src"));
          if (path && paths.size < 16) paths.add(path);
        }
        if (token.children) collect(token.children);
      }
    }
    collect(markdown.parse(props.source, {}));
    const queue = [...paths];
    async function worker() {
      while (queue.length && owner === generation) {
        const path = queue.shift();
        try {
          const { data } = await repositoryAccessAPI.guestPreview(repo, path);
          if (owner !== generation) return;
          if (
            data.kind === "image" &&
            typeof data.data_url === "string" &&
            data.data_url.length <= 2 * 1024 * 1024 &&
            /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
              data.data_url,
            )
          ) {
            thumbnails.value = { ...thumbnails.value, [path]: data.data_url };
          }
        } catch (error) {
          if (owner !== generation) return;
          if (denied(error)) {
            generation++;
            thumbnails.value = {};
            emit("access-denied", error);
            return;
          }
          // Unavailable image previews leave their alternative text in place.
        }
      }
    }
    const count = Math.min(3, queue.length);
    for (let index = 0; index < count; index++) worker();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
</script>
<template><div class="mdx" @click="followLink" v-html="html" /></template>
