<script setup>
import { computed } from "vue";
import LinkButton from "@/components/common/LinkButton.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import RepoHistoryLink from "./RepoHistoryLink.vue";
import RepoLatestCommit from "./RepoLatestCommit.vue";
import { useErrorContext } from "@/composables/useErrorContext";
import { formatRelativeTime } from "@/utils/datetime";
const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, default: "main" },
  search: { type: String, default: "" },
  currentPath: { type: String, default: "" },
  isCompositeHeader: { type: Boolean, default: true },
  isOwner: { type: Boolean, default: false },
  isExternalRepo: { type: Boolean, default: false },
  sourceHistoryUrl: { type: String, default: null },
  repositorySize: { type: String, default: "Size unavailable" },
  fileTree: { type: Array, default: () => [] },
  filesLoading: { type: Boolean, default: false },
  treeError: { type: Object, default: null },
  fileListHasMore: { type: Boolean, default: false },
  fileListLoadingMore: { type: Boolean, default: false },
  deletingFolder: { type: Boolean, default: false },
  getEntryHref: { type: Function, required: true },
  getCommitPath: { type: Function, required: true },
  previewActions: { type: Object, default: null },
  // A source only supplies controlled commit metadata. No raw-file APIs are
  // owned by this shared presentation layer, including in its empty state.
  source: { type: Object, default: null },
});
const emit = defineEmits([
  "update:branch",
  "branch-change",
  "update:search",
  "reload",
  "load-more",
  "delete-folder",
  "preview",
  "entry-click",
]);
const errorContext = useErrorContext();
const currentBranch = computed({
  get: () => props.branch,
  set: (value) => emit("update:branch", value),
});
const fileSearchQuery = computed({
  get: () => props.search,
  set: (value) => emit("update:search", value),
});
const pathSegments = computed(() =>
  props.currentPath.split("/").filter(Boolean),
);
const getFileName = (path) => path.split("/").pop() || path;
const getEntryCommitTitle = (file) => file.lastCommit?.title || "-";
const getEntryUpdatedAt = (file) =>
  formatRelativeTime(file.lastCommit?.date || file.lastModified, "-");
function formatEntrySize(file) {
  const bytes = file.size;
  if (!bytes || bytes === 0) return "-";
  if (bytes < 1000) return bytes + " B";
  if (bytes < 1000000) return (bytes / 1000).toFixed(1) + " KB";
  if (bytes < 1000000000) return (bytes / 1000000).toFixed(1) + " MB";
  return (bytes / 1000000000).toFixed(1) + " GB";
}
function folderLink(path) {
  const suffix = path
    ? "/" + path.split("/").map(encodeURIComponent).join("/")
    : "";
  const url = sourceFolderBase() + suffix;
  return props.source ? { href: url } : { to: url };
}
function sourceFolderBase() {
  return `/${props.repoType}s/${encodeURIComponent(props.namespace)}/${encodeURIComponent(props.name)}/tree/${encodeURIComponent(props.branch)}`;
}
function followFolder(event, path) {
  if (props.source) emit("entry-click", event, { path, type: "directory" });
}
const handleBranchChange = (value) => emit("branch-change", value);
const loadFileTree = () => emit("reload");
const loadMoreFileTree = () => emit("load-more");
const confirmDeleteFolder = () => emit("delete-folder");
</script>

<template>
  <div :class="{ card: !isCompositeHeader }">
    <div
      class="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      :class="{ 'flex-wrap repository-files-toolbar': isCompositeHeader }"
    >
      <div class="flex items-center gap-2 min-w-0">
        <el-select
          aria-label="Branch"
          v-model="currentBranch"
          :size="isCompositeHeader ? 'default' : 'small'"
          class="w-full min-w-28 sm:w-37 sm:min-w-37 sm:flex-none"
          :class="{ 'repository-branch-select': isCompositeHeader }"
          @change="handleBranchChange"
        >
          <template v-if="isCompositeHeader" #prefix>
            <span class="i-carbon-branch" aria-hidden="true" />
          </template>
          <el-option label="main" value="main" />
        </el-select>
        <span
          v-if="isCompositeHeader"
          class="repository-storage-size"
          data-testid="repository-size"
          aria-label="Repository storage used"
          title="Repository storage used"
          >{{ repositorySize }}</span
        >
        <span
          v-else
          class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap"
          data-testid="file-list-count"
        >
          {{ fileTree.length }}
          {{ fileTree.length === 1 ? "file" : "files"
          }}<template v-if="fileListHasMore"> loaded </template>
        </span>
      </div>

      <div
        class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
        :class="{ 'sm:ml-auto': isCompositeHeader }"
      >
        <el-input
          v-if="isCompositeHeader"
          aria-label="Filter files by name prefix"
          v-model="fileSearchQuery"
          placeholder="Filter by name prefix..."
          class="w-full sm:w-50 repository-file-filter"
          clearable
          data-testid="file-list-name-prefix"
        >
          <template #prefix>
            <div class="i-carbon-search" />
          </template>
        </el-input>
        <RepoHistoryLink
          v-if="isCompositeHeader"
          :repo-type="repoType"
          :namespace="namespace"
          :name="name"
          :branch="currentBranch"
          :external="isExternalRepo"
          :source-url="sourceHistoryUrl"
          :source="source"
        />
        <LinkButton
          v-if="isOwner"
          :to="`/${repoType}s/${namespace}/${name}/upload/${currentBranch}`"
          :size="isCompositeHeader ? 'default' : 'small'"
          type="primary"
          class="w-full sm:w-auto"
          :class="{ 'repository-upload-button': isCompositeHeader }"
        >
          <div class="i-carbon-cloud-upload inline-block mr-1" />
          Upload Files
        </LinkButton>
        <el-input
          v-if="!isCompositeHeader"
          aria-label="Filter files by name prefix"
          v-model="fileSearchQuery"
          placeholder="Filter by name prefix..."
          size="small"
          class="w-full sm:w-50"
          clearable
          data-testid="file-list-name-prefix"
        >
          <template #prefix>
            <div class="i-carbon-search" />
          </template>
        </el-input>
      </div>
    </div>

    <!-- Breadcrumb for current path -->
    <div v-if="currentPath" class="mb-3">
      <div class="flex items-center justify-between">
        <el-breadcrumb
          separator="/"
          class="repo-file-breadcrumb text-sm text-gray-700 dark:text-gray-300"
        >
          <el-breadcrumb-item>
            <component
              :is="source ? 'a' : 'RouterLink'"
              v-bind="folderLink('')"
              @click="followFolder($event, '')"
              class="text-blue-600 dark:text-blue-400 hover:underline"
            >
              root
            </component>
          </el-breadcrumb-item>
          <el-breadcrumb-item v-for="(segment, idx) in pathSegments" :key="idx">
            <component
              :is="source ? 'a' : 'RouterLink'"
              v-bind="folderLink(pathSegments.slice(0, idx + 1).join('/'))"
              @click="
                followFolder($event, pathSegments.slice(0, idx + 1).join('/'))
              "
              class="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {{ segment }}
            </component>
          </el-breadcrumb-item>
        </el-breadcrumb>
        <el-button
          v-if="isOwner"
          @click="confirmDeleteFolder"
          type="danger"
          size="small"
          :loading="deletingFolder"
        >
          <div class="i-carbon-trash-can inline-block mr-1" />
          Delete Folder
        </el-button>
      </div>
    </div>

    <!-- File List -->
    <div
      class="divide-y divide-gray-200 dark:divide-gray-700"
      :class="{ 'repository-file-list': isCompositeHeader }"
      aria-label="Repository files"
    >
      <RepoLatestCommit
        v-if="isCompositeHeader"
        :repo-type="repoType"
        :namespace="namespace"
        :name="name"
        :branch="currentBranch"
        :external="isExternalRepo"
        :source="source"
      />
      <div v-if="filesLoading" class="py-12 text-center">
        <el-icon class="is-loading" :size="40">
          <div class="i-carbon-circle-dash" />
        </el-icon>
        <p class="mt-4 text-gray-500 dark:text-gray-400">Loading files...</p>
      </div>
      <!--
              Root-tree fetch failed (decoded by src/errors). Render the shared
              ErrorState instead of silently showing an empty file
              list — that was the preview-of-gated-repo symptom in
              the linked tracking issue.
            -->
      <ErrorState
        v-else-if="treeError"
        :error="treeError"
        :context="errorContext('file list')"
        mode="inline-panel"
        :retry="loadFileTree"
      />
      <template v-else>
        <!-- Header Row (desktop only) -->
        <div
          v-if="!isCompositeHeader"
          class="hidden md:grid md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,2fr)_120px_110px] gap-3 py-2 px-2 text-sm font-medium text-gray-600 dark:text-gray-400 border-b"
        >
          <div></div>
          <!-- Icon column -->
          <div>Name</div>
          <div>Last Commit</div>
          <div class="text-right">Updated</div>
          <div class="text-right">Size</div>
        </div>

        <!-- File Rows -->
        <!--
                Each row is anchored with a stretched <RouterLink> that
                covers the whole row (absolute inset-0). That makes the
                entry a real <a href> element, so right-click → "Open in
                New Tab", middle-click, and Cmd/Ctrl-click all work like
                they do on any other link. Interactive children (the
                preview button, the commit RouterLink) sit above the
                overlay with a higher z-index + their own @click.stop so
                they don't trigger the row navigation.
              -->
        <div
          v-for="file in fileTree"
          :key="file.path"
          class="relative py-3 grid grid-cols-[auto_1fr] md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,2fr)_120px_110px] gap-3 items-center hover:bg-gray-50 dark:hover:bg-gray-700 px-2 cursor-pointer transition-colors"
        >
          <component
            :is="source ? 'a' : 'RouterLink'"
            v-bind="
              source ? { href: getEntryHref(file) } : { to: getEntryHref(file) }
            "
            :aria-label="`Open ${getFileName(file.path)}`"
            class="absolute inset-0 z-10"
            data-testid="filelist-row-link"
            @click="source && $emit('entry-click', $event, file)"
            ><span class="sr-only">{{
              getFileName(file.path)
            }}</span></component
          >
          <div
            :class="
              file.type === 'directory'
                ? 'i-carbon-folder text-blue-500'
                : 'i-carbon-document text-gray-500 dark:text-gray-400'
            "
            class="text-xl flex-shrink-0"
          />
          <div class="min-w-0">
            <div class="font-medium truncate flex items-center gap-2">
              <span class="truncate">{{ getFileName(file.path) }}</span>
              <button
                v-if="previewActions?.canPreview(file)"
                type="button"
                class="relative z-20 flex-shrink-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                :title="previewActions.title(file)"
                :aria-label="`Preview metadata for ${getFileName(file.path)}`"
                @click.stop="$emit('preview', file)"
              >
                <div :class="previewActions.icon(file)" class="text-base" />
              </button>
            </div>
            <div
              class="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate md:hidden"
            >
              <RouterLink
                v-if="file.lastCommit"
                :to="getCommitPath(file.lastCommit.id)"
                class="relative z-20 text-gray-700 dark:text-gray-300 underline underline-offset-2 decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                :title="file.lastCommit.title"
                @click.stop
              >
                {{ getEntryCommitTitle(file) }}
              </RouterLink>
              <span v-else>{{ getEntryCommitTitle(file) }}</span>
            </div>
            <div
              class="mt-1 text-xs text-gray-400 dark:text-gray-500 md:hidden"
            >
              {{ getEntryUpdatedAt(file) }}
              <span v-if="formatEntrySize(file) !== '-'">
                · {{ formatEntrySize(file) }}
              </span>
            </div>
          </div>
          <div
            class="hidden md:block min-w-0 text-sm text-gray-500 dark:text-gray-400 truncate"
          >
            <RouterLink
              v-if="file.lastCommit"
              :to="getCommitPath(file.lastCommit.id)"
              class="relative z-20 text-gray-700 dark:text-gray-300 underline underline-offset-2 decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              :title="file.lastCommit.title"
              @click.stop
            >
              {{ getEntryCommitTitle(file) }}
            </RouterLink>
            <span v-else>{{ getEntryCommitTitle(file) }}</span>
          </div>
          <div
            class="hidden md:block text-sm text-gray-500 dark:text-gray-400 text-right"
          >
            {{ getEntryUpdatedAt(file) }}
          </div>
          <div
            class="hidden md:block text-sm text-gray-500 dark:text-gray-400 text-right"
          >
            {{ formatEntrySize(file) }}
          </div>
        </div>

        <div
          v-if="fileTree.length === 0"
          class="py-12 text-center text-gray-500 dark:text-gray-400"
        >
          <div class="i-carbon-document-blank text-6xl mb-4 inline-block" />
          <p v-if="fileSearchQuery">
            No files in this directory start with "{{ fileSearchQuery }}"
            (case-sensitive prefix)
          </p>
          <p v-else>No files found</p>
        </div>
      </template>
    </div>

    <!--
            "Load more" button — centered, plain, mirroring the
            commit-history "Load More Commits" affordance below. We
            switched away from a numbered pager because the cursor-
            only LakeFS list API gives no total page count and the
            old pager had to walk every page forward just to render
            its buttons (issue #56). The per-batch selector that
            controls the next click's `limit` lives up in the header
            next to the count, not here.

            Hidden when the listing is exhausted — at that point
            there is nothing to load.
          -->
    <div v-if="!filesLoading && fileListHasMore" class="text-center pt-4">
      <el-button
        :loading="fileListLoadingMore"
        :disabled="fileListLoadingMore"
        plain
        data-testid="file-list-load-more"
        @click="loadMoreFileTree"
      >
        Load More Files
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.repository-file-list {
  border: 1px solid var(--site-border);
  border-radius: 8px;
}
.repository-storage-size {
  color: var(--site-muted);
  font-size: 13px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.repository-branch-select {
  width: 132px;
  min-width: 132px;
  flex: none;
}
.repository-branch-select :deep(.el-select__wrapper) {
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 8px;
  background: var(--site-card);
  box-shadow: 0 0 0 1px var(--site-border) inset;
}
.repository-branch-select :deep(.el-select__wrapper:hover) {
  background: var(--site-hover);
}
.repository-branch-select :deep(.el-select__prefix),
.repository-branch-select :deep(.el-select__caret) {
  color: var(--site-muted);
}
.repository-branch-select :deep(.el-select__selected-item) {
  color: var(--site-card-text);
  font-weight: 600;
  font-size: 13px;
}
.repository-branch-select :deep(.el-select__caret) {
  font-size: 12px;
}
.repository-file-filter :deep(.el-input__wrapper) {
  min-height: 34px;
  border-radius: 8px;
}
.repository-upload-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  margin: 0;
  padding: 7px 12px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
}
</style>
