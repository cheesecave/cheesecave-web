<script setup>
import { computed, ref, watch } from "vue";
import CodeViewer from "@/components/common/CodeViewer.vue";
import RepositoryFileMetadata from "./RepositoryFileMetadata.vue";
import { extractYAMLFrontmatter } from "@/utils/yaml-parser";
import GuestMarkdownPreview from "./GuestMarkdownPreview.vue";
import { formatRelativeTime } from "@/utils/datetime";
import { copyToClipboard } from "@/utils/clipboard";
import { ElMessage } from "element-plus";
import "@/markdown-styles/base.css";
const props = defineProps({
  repository: { type: Object, required: true },
  path: { type: String, required: true },
  fileInfo: { type: Object, default: null },
  content: { type: Object, default: null },
  size: { type: String, default: "—" },
});
defineEmits(["back", "open-file", "access-denied"]);
const mode = ref("preview");
watch(
  () => props.path,
  () => {
    mode.value = "preview";
  },
);
const isMarkdown = computed(() => /\.(md|markdown)$/i.test(props.path));
const language = computed(
  () => props.path.split(".").pop()?.toLowerCase() || "text",
);
const frontmatter = computed(() =>
  isMarkdown.value ? extractYAMLFrontmatter(props.content?.text || "") : null,
);
const safeImage = computed(() =>
  /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
    props.content?.data_url || "",
  )
    ? props.content.data_url
    : "",
);
async function copyPath() {
  if (await copyToClipboard(props.path)) ElMessage.success("File path copied");
  else ElMessage.error("Could not copy file path");
}
</script>
<template>
  <div>
    <div class="guest-file-navigation">
      <button type="button" class="guest-text-action" @click="$emit('back')">
        <span class="i-carbon-arrow-left" aria-hidden="true" />Back to Files</button
      ><span>{{ path.split("/").slice(0, -1).join("/") || "/" }}</span>
    </div>
    <article class="guest-file-preview" aria-label="Controlled file preview">
      <header class="guest-file-heading" aria-label="File header">
        <div class="min-w-0">
          <h2 class="font-semibold break-words">{{ path.split("/").pop() }}</h2>
          <p class="guest-file-info">
            {{ size
            }}<span v-if="content?.kind === 'text'">
              · {{ content.text.split("\n").length }} lines</span
            >
          </p>
        </div>
        <button type="button" class="guest-text-action" @click="copyPath">
          <span class="i-carbon-copy" aria-hidden="true" />Copy path
        </button>
      </header>
      <div
        v-if="fileInfo?.last_commit"
        class="guest-file-commit"
        aria-label="File last commit"
      >
        <span class="i-carbon-user-avatar" aria-hidden="true" /><span>{{
          fileInfo.last_commit.author
        }}</span>
        <span class="guest-file-commit-title">{{
          fileInfo.last_commit.title
        }}</span>
        <span class="font-mono">{{ fileInfo.last_commit.id.slice(0, 7) }}</span>
        <span>{{
          formatRelativeTime(fileInfo.last_commit.timestamp, "—")
        }}</span>
      </div>
      <div
        v-if="content?.kind === 'text' && isMarkdown"
        class="guest-file-modes"
        role="tablist"
        aria-label="File presentation"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'preview'"
          @click="mode = 'preview'"
        >
          Preview</button
        ><button
          type="button"
          role="tab"
          :aria-selected="mode === 'code'"
          @click="mode = 'code'"
        >
          Code
        </button>
      </div>
      <div v-if="content" class="guest-file-body">
        <template
          v-if="content.kind === 'text' && isMarkdown && mode === 'preview'"
        >
          <RepositoryFileMetadata
            v-if="frontmatter"
            :source="frontmatter.source"
            class="mb-6"
          />
          <GuestMarkdownPreview
            :repository="repository"
            :path="path"
            :source="frontmatter?.content ?? content.text"
            @open-file="$emit('open-file', $event)"
            @access-denied="$emit('access-denied', $event)"
          />
        </template>
        <CodeViewer
          v-else-if="content.kind === 'text'"
          :code="content.text"
          :language="language"
          bare
        />
        <img
          v-else-if="content.kind === 'image' && safeImage"
          :src="safeImage"
          :alt="path"
          class="max-w-full h-auto mx-auto"
          style="max-height: 800px"
        />
        <div v-else-if="content.kind === 'rows'" class="overflow-x-auto">
          <table class="guest-data-table">
            <thead>
              <tr>
                <th v-for="column in content.columns" :key="column">
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in content.rows" :key="index">
                <td v-for="(column, j) in content.columns" :key="column">
                  {{ Array.isArray(row) ? row[j] : row[column] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else>
          {{ content.message || "This file is available as metadata only." }}
        </p>
        <p v-if="content.truncated" class="guest-preview-limit">
          This preview is limited. The complete original file is not available.
        </p>
      </div>
    </article>
  </div>
</template>
<style scoped>
.guest-file-navigation,
.guest-file-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.guest-file-navigation {
  margin-bottom: 16px;
  color: var(--site-muted);
  font-size: 14px;
}
.guest-file-preview {
  border: 1px solid var(--site-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--site-card);
}
.guest-file-heading {
  padding: 16px 20px;
  border-bottom: 1px solid var(--site-border);
}
.guest-file-heading h2,
.guest-file-info {
  margin: 0;
}
.guest-file-info {
  margin-top: 6px;
  color: var(--site-muted);
  font-size: 13px;
}
.guest-file-commit {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--site-border);
  color: var(--site-muted);
  font-size: 13px;
}
.guest-file-commit-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--site-card-text);
}
.guest-file-body {
  padding: 24px;
}
.guest-text-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--site-link);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.guest-text-action:hover {
  text-decoration: underline;
}
.guest-text-action:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
.guest-file-modes {
  display: flex;
  gap: 4px;
  padding: 0 16px;
  border-bottom: 1px solid var(--site-border);
}
.guest-file-modes button {
  padding: 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--site-muted);
  cursor: pointer;
}
.guest-file-modes button[aria-selected="true"] {
  border-bottom-color: var(--site-primary);
  color: var(--site-card-text);
}
.guest-preview-limit {
  margin: 16px 0 0;
  color: var(--site-muted);
  font-size: 13px;
}
.guest-data-table {
  width: 100%;
  border-collapse: collapse;
}
.guest-data-table th,
.guest-data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--site-border);
  text-align: left;
}
.guest-data-table th {
  color: var(--site-muted);
}
@media (max-width: 600px) {
  .guest-file-heading {
    padding: 16px;
  }
  .guest-file-body {
    padding: 16px;
  }
}
</style>
