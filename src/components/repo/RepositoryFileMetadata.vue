<script setup>
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("yaml", yaml);

const props = defineProps({ source: { type: String, required: true } });
const highlightedSource = computed(
  () =>
    hljs.highlight(props.source, { language: "yaml", ignoreIllegals: true })
      .value,
);
</script>

<template>
  <section class="repository-file-metadata" aria-label="File metadata">
    <h3 class="file-metadata-heading">
      <span class="i-carbon-data-table" aria-hidden="true" /> Metadata
    </h3>
    <pre class="file-metadata-source"><code v-html="highlightedSource" /></pre>
  </section>
</template>

<style scoped>
.repository-file-metadata {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  background: var(--site-card);
  color: var(--site-card-text);
}
.file-metadata-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--site-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--site-muted);
}
.file-metadata-source {
  max-height: 256px;
  margin: 0;
  padding: 12px 16px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
}
.file-metadata-source :deep(.hljs-attr) {
  color: var(--site-primary);
}
.file-metadata-source :deep(.hljs-string) {
  color: #167239;
}
.file-metadata-source :deep(.hljs-number),
.file-metadata-source :deep(.hljs-literal) {
  color: #0550ae;
}
.file-metadata-source :deep(.hljs-comment) {
  color: var(--site-muted);
}
.dark .file-metadata-source :deep(.hljs-string) {
  color: #7ee787;
}
.dark .file-metadata-source :deep(.hljs-number),
.dark .file-metadata-source :deep(.hljs-literal) {
  color: #79c0ff;
}
</style>
