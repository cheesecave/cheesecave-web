<template>
  <RepositoryAccessLayout :repository="repository" :access="access" preview>
    <template #actions
      ><el-button @click="leave">End temporary access</el-button></template
    >
    <template #aside>
      <div class="card space-y-3">
        <h2 class="font-semibold">Preview only</h2>
        <p class="text-sm text-gray-500">No original downloads.</p>
        <details class="text-sm text-gray-500">
          <summary>Preview limits</summary>
          <p class="mt-3">
            Limited text, data rows and thumbnails. Other files, including LFS,
            show metadata only. Displayed content can be copied or saved.
          </p>
        </details>
      </div>
    </template>
    <div class="space-y-4">
      <ErrorState
        v-if="error"
        :error="error"
        mode="inline-panel"
        :retry="() => loadTree(currentPath)"
      />
      <div v-if="loading" role="status">Loading controlled preview…</div>
      <div v-if="currentPath" class="guest-directory-toolbar">
        <h2 class="font-semibold">{{ currentPath }}</h2>
        <button
          v-if="currentPath"
          type="button"
          class="guest-parent-link"
          @click="loadTree(currentPath.split('/').slice(0, -1).join('/'))"
        >
          <span class="i-carbon-arrow-up" aria-hidden="true" />Parent folder
        </button>
      </div>
      <p v-if="treeMessage" class="text-sm text-gray-500">
        {{ treeMessage }}
      </p>
      <div class="guest-file-list">
        <table aria-label="Repository files" class="guest-file-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Preview</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in entries"
              :key="entry.path"
              :class="{ 'is-selected': content && selectedPath === entry.path }"
            >
              <td>
                <span
                  :class="
                    entry.type === 'directory'
                      ? 'i-carbon-folder guest-folder-icon'
                      : 'i-carbon-document'
                  "
                  class="guest-entry-icon"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  class="guest-entry-name"
                  :aria-label="entry.path"
                  :aria-pressed="
                    entry.type === 'file'
                      ? Boolean(content && selectedPath === entry.path)
                      : undefined
                  "
                  @click="
                    entry.type === 'directory'
                      ? loadTree(entry.path)
                      : preview(entry.path)
                  "
                >
                  {{ entry.path.split("/").pop() }}
                </button>
              </td>
              <td class="guest-entry-metadata">{{ previewLabel(entry) }}</td>
              <td class="guest-entry-size">
                {{ entry.type === "directory" ? "—" : formatSize(entry.size) }}
              </td>
            </tr>
            <tr v-if="!loading && !entries.length">
              <td colspan="3" class="guest-empty">No files found</td>
            </tr>
          </tbody>
        </table>
      </div>
      <article
        v-if="content"
        class="card space-y-3"
        aria-label="Controlled file preview"
      >
        <h2 class="font-semibold">{{ selectedPath }}</h2>
        <pre
          v-if="content.kind === 'text'"
          class="whitespace-pre-wrap break-words"
          >{{ content.text }}</pre
        >
        <img
          v-else-if="content.kind === 'image' && safeImage"
          :src="safeImage"
          :alt="selectedPath"
          class="max-w-full"
        />
        <div v-else-if="content.kind === 'rows'" class="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th
                  v-for="column in content.columns"
                  :key="column"
                  class="p-2 text-left"
                >
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in content.rows" :key="index">
                <td
                  v-for="(column, j) in content.columns"
                  :key="column"
                  class="p-2"
                >
                  {{ Array.isArray(row) ? row[j] : row[column] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else>
          {{
            content.message ||
            "This file type is unavailable in temporary previews."
          }}
        </p>
        <p v-if="content.truncated" class="text-sm text-gray-500">
          This preview is limited. The complete original file is not available.
        </p>
      </article>
    </div>
  </RepositoryAccessLayout>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { repositoryAccessAPI } from "@/utils/api";
import { decodeError, notifyError } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import RepositoryAccessLayout from "./RepositoryAccessLayout.vue";
const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["changed"]);
const entries = ref([]);
const currentPath = ref("");
const treeMessage = ref("");
const selectedPath = ref("");
const content = ref(null);
const error = ref(null);
const loading = ref(false);
let sequence = 0;
function previewLabel(entry) {
  if (entry.type === "directory") return "Folder";
  return (
    { text: "Text", rows: "Data rows", image: "Thumbnail" }[
      entry.preview_kind
    ] || "Metadata only"
  );
}
function formatSize(size) {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1000) return `${size} B`;
  if (size < 1000000) return `${(size / 1000).toFixed(1)} KB`;
  if (size < 1000000000) return `${(size / 1000000).toFixed(1)} MB`;
  return `${(size / 1000000000).toFixed(1)} GB`;
}
const safeImage = computed(() =>
  /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
    content.value?.data_url || "",
  )
    ? content.value.data_url
    : "",
);
async function loadTree(path = "") {
  const request = ++sequence;
  loading.value = true;
  content.value = null;
  error.value = null;
  try {
    const { data } = await repositoryAccessAPI.guestTree(
      props.repository,
      path,
    );
    if (request === sequence) {
      entries.value = data.entries;
      currentPath.value = data.path;
      treeMessage.value =
        data.message ||
        (data.has_more
          ? "Only the first 100 entries are available in this temporary preview."
          : "");
    }
  } catch (cause) {
    if (request === sequence) error.value = decodeError(cause);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
async function preview(path) {
  const request = ++sequence;
  content.value = null;
  error.value = null;
  loading.value = true;
  try {
    const { data } = await repositoryAccessAPI.guestPreview(
      props.repository,
      path,
    );
    if (request === sequence) {
      selectedPath.value = path;
      content.value = data;
    }
  } catch (cause) {
    if (request === sequence) error.value = decodeError(cause);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
async function leave() {
  try {
    await repositoryAccessAPI.leaveGuest(props.repository);
    emit("changed");
  } catch (cause) {
    notifyError(cause, { fallback: "Could not end temporary access" });
  }
}
watch(
  () => JSON.stringify(props.repository),
  () => {
    entries.value = [];
    loadTree();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
});
</script>

<style scoped>
.guest-directory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.guest-directory-toolbar h2 {
  margin: 0;
}
.guest-parent-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--site-link);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.guest-file-list {
  border: 1px solid var(--site-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--site-card);
}
.guest-file-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.guest-file-table th {
  padding: 12px;
  background: var(--site-hover);
  color: var(--site-muted);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
}
.guest-file-table th:first-child {
  width: 60%;
}
.guest-file-table th:last-child {
  width: 100px;
  text-align: right;
}
.guest-file-table td {
  padding: 12px;
  border-top: 1px solid var(--site-border);
}
.guest-file-table tbody tr {
  position: relative;
}
.guest-file-table tbody tr:hover,
.guest-file-table tbody tr.is-selected {
  background: var(--site-hover);
}
.guest-file-table td:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.guest-entry-icon {
  display: inline-block;
  width: 20px;
  height: 20px;
  margin-right: 12px;
  vertical-align: middle;
  color: var(--site-muted);
}
.guest-folder-icon {
  color: var(--site-link);
}
.guest-entry-name {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--site-card-text);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.guest-entry-name::after {
  position: absolute;
  inset: 0;
  content: "";
}
.guest-entry-name:hover {
  color: var(--site-link);
}
.guest-entry-name:focus-visible {
  outline: none;
}
.guest-entry-name:focus-visible::after {
  outline: 2px solid var(--site-primary);
  outline-offset: -2px;
}
.guest-entry-metadata,
.guest-entry-size {
  color: var(--site-muted);
  font-size: 13px;
}
.guest-entry-size {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.guest-empty {
  color: var(--site-muted);
  text-align: center;
}
summary {
  cursor: pointer;
}
@media (max-width: 600px) {
  .guest-file-table th:nth-child(2),
  .guest-entry-metadata {
    display: none;
  }
  .guest-file-table th:last-child {
    width: 84px;
  }
}
</style>
