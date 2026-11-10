<script setup>
import { computed, defineComponent, ref, watch, onBeforeUnmount } from "vue";
import { repositoryAccessAPI } from "@/utils/api";
import { parseYAMLFrontmatter, normalizeMetadata } from "@/utils/yaml-parser";
import { controlledPreviewText } from "@/utils/controlled-preview-text";
import { formatRelativeTime } from "@/utils/datetime";
import { decodeError, notifyError } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import RepositoryAccessLayout from "./RepositoryAccessLayout.vue";
import RepositoryFiles from "./RepositoryFiles.vue";
import BlobFilePage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";
import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import GuestRepositorySidebar from "./GuestRepositorySidebar.vue";
import DetailedMetadataPanel from "./metadata/DetailedMetadataPanel.vue";
import "@/markdown-styles/base.css";
const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, default: () => ({}) },
  embedded: { type: Boolean, default: false },
  view: { type: String, default: "card" },
  path: { type: String, default: "" },
  filePath: { type: String, default: "" },
  branch: { type: String, default: "main" },
  commitId: { type: [String, Array], default: "" },
});
const emit = defineEmits([
  "changed",
  "navigate",
  "overview",
  "open-file",
  "open-folder",
]);
const BodyOnly = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
});
const activeView = ref(props.view),
  accessInvalid = ref(false),
  overview = ref(null),
  overviewError = ref(null),
  overviewLoading = ref(false);
const entries = ref([]),
  currentPath = ref(""),
  query = ref(""),
  treeMessage = ref(""),
  treeCursor = ref(null),
  treeHasMore = ref(false),
  treeLoaded = ref(false),
  treeError = ref(null),
  treeLoading = ref(false);
const selectedPath = ref("");
const commits = ref([]),
  commitsCursor = ref(null),
  commitsHasMore = ref(false),
  commitsLoaded = ref(false),
  commitsLoading = ref(false),
  commitsError = ref(null),
  selectedCommit = ref(null);
let generation = 0,
  overviewRequest = 0,
  treeRequest = 0,
  commitsRequest = 0;
const fileMetadataCache = new Map();
let treeContext = "",
  searchTimer;
function recheckRevokedAccess(cause) {
  const status = cause?.response?.status ?? cause?.status;
  const headers = cause?.response?.headers;
  const code =
    headers?.get?.("x-error-code") ||
    headers?.["x-error-code"] ||
    headers?.["X-Error-Code"];
  if (
    ![401, 403].includes(status) &&
    !(status === 404 && code === "RepoNotFound")
  )
    return false;
  if (accessInvalid.value) return true;
  accessInvalid.value = true;
  generation++;
  fileMetadataCache.clear();
  clearTimeout(searchTimer);
  overview.value = null;
  entries.value = [];
  commits.value = [];
  selectedPath.value = "";
  selectedCommit.value = null;
  overviewLoading.value = false;
  treeLoading.value = false;
  commitsLoading.value = false;
  treeHasMore.value = false;
  commitsHasMore.value = false;
  emit("changed");
  return true;
}
// Metadata presenters create relationship/license links. They never receive
// resource URLs, dangerous object keys or cyclic card-frontmatter structures.
function safeMetadata(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return null;
  if (typeof value === "string")
    return value
      .replace(
        /https?:\/\/\S+|\/(?:models|datasets|spaces)\/\S*\/resolve\/\S*/gi,
        "[link omitted]",
      )
      .slice(0, 4096);
  if (value == null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => safeMetadata(item, depth + 1, seen));
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (
      /^(?:__proto__|prototype|constructor|token|secret|api_key|href|src)$|(?:url|link|address)$/i.test(
        key,
      )
    )
      continue;
    result[key] = safeMetadata(item, depth + 1, seen);
  }
  return result;
}
const parsedCard = computed(() =>
  parseYAMLFrontmatter(overview.value?.readme?.text || ""),
);
const metadata = computed(() => {
  const clean = normalizeMetadata(
    safeMetadata({ ...parsedCard.value.metadata, ...overview.value?.metadata }),
  );
  for (const key of ["base_model", "datasets"])
    if (clean[key])
      clean[key] = []
        .concat(clean[key])
        .filter(
          (id) => typeof id === "string" && /^[\w.-]+\/[\w.-]+$/.test(id),
        );
  return clean;
});
const branch = computed(() => overview.value?.default_branch || "main");
const sortedEntries = computed(() =>
  [...entries.value].sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.path.localeCompare(b.path, undefined, { numeric: true }),
  ),
);
const directoryEntries = computed(() =>
  sortedEntries.value.map((entry) => ({
    ...entry,
    lastCommit: entry.last_commit
      ? { ...entry.last_commit, date: entry.last_commit.timestamp }
      : null,
  })),
);
const directorySource = computed(() => {
  const latest = commits.value[0];
  const error = commitsError.value;
  const count =
    commitsLoaded.value && !commitsHasMore.value ? commits.value.length : null;
  return {
    latestCommit: async () => {
      if (error) throw error;
      return latest
        ? {
            ...latest,
            title: latest.message.split("\n")[0],
            date: latest.timestamp,
          }
        : null;
    },
    commitCount: async () => {
      if (error) throw error;
      return count;
    },
    reload: () => loadCommits(),
    onAccessDenied: recheckRevokedAccess,
  };
});
const repositorySize = computed(() => {
  const size = overview.value?.used_storage;
  return Number.isFinite(size) && size >= 0
    ? formatSize(size)
    : "Size unavailable";
});
function directoryCommitPath(id) {
  const repo = props.repository;
  return `/${repo.type}s/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}/commits/main?commit=${encodeURIComponent(id)}`;
}
function formatSize(size) {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1000) return `${size} B`;
  if (size < 1000000) return `${(size / 1000).toFixed(1)} KB`;
  if (size < 1000000000) return `${(size / 1000000).toFixed(1)} MB`;
  return `${(size / 1000000000).toFixed(1)} GB`;
}
function canonicalReadmePreview(data, path) {
  const readme = overview.value?.readme;
  // Keep the root README file page identical to the already authorized card.
  // All other files retain the ordinary controlled excerpt limit.
  if (
    data?.kind === "text" &&
    /^readme\.md$/i.test(path) &&
    readme?.path === path &&
    typeof readme.text === "string"
  )
    return { ...data, text: readme.text, truncated: Boolean(readme.truncated) };
  return data;
}
let pendingOverview = Promise.resolve();
function loadOverview() {
  pendingOverview = fetchOverview();
  return pendingOverview;
}
async function fetchOverview() {
  if (accessInvalid.value) return;
  const owner = generation,
    request = ++overviewRequest,
    target = { ...props.repository };
  overviewLoading.value = true;
  overviewError.value = null;
  try {
    const { data } = await repositoryAccessAPI.guestOverview(target);
    if (owner !== generation || request !== overviewRequest) return;
    overview.value = data;
    emit("overview", { ...data, card_metadata: metadata.value });
  } catch (cause) {
    if (
      owner === generation &&
      request === overviewRequest &&
      recheckRevokedAccess(cause)
    )
      return;
    if (owner === generation && request === overviewRequest)
      overviewError.value = decodeError(cause);
  } finally {
    if (owner === generation && request === overviewRequest)
      overviewLoading.value = false;
  }
}
async function loadTree(path = "", append = false) {
  if (accessInvalid.value) return;
  if (props.branch !== "main") {
    entries.value = [];
    treeError.value = decodeError(
      Object.assign(
        new Error("Only the default branch is available in guest preview"),
        { status: 400 },
      ),
    );
    return;
  }
  const context = `${path}\0${query.value}`;
  if (append && context !== treeContext) append = false;
  const owner = generation,
    request = ++treeRequest,
    target = { ...props.repository },
    search = query.value;
  const options = {
    ...(append && treeCursor.value ? { cursor: treeCursor.value } : {}),
    search,
  };
  currentPath.value = path;
  treeLoading.value = true;
  treeError.value = null;
  if (!append) {
    entries.value = [];
    treeCursor.value = null;
    treeHasMore.value = false;
  }
  try {
    const { data } = await repositoryAccessAPI.guestTree(target, path, options);
    if (owner !== generation || request !== treeRequest) return;
    const next = append ? [...entries.value, ...data.entries] : data.entries;
    entries.value = [
      ...new Map(next.map((entry) => [entry.path, entry])).values(),
    ];
    currentPath.value = data.path;
    treeMessage.value = data.message || "";
    treeHasMore.value = Boolean(data.has_more && data.next_cursor);
    treeCursor.value = data.next_cursor || null;
    treeLoaded.value = true;
    treeContext = context;
  } catch (cause) {
    if (
      owner === generation &&
      request === treeRequest &&
      recheckRevokedAccess(cause)
    )
      return;
    if (owner === generation && request === treeRequest)
      treeError.value = decodeError(cause);
  } finally {
    if (owner === generation && request === treeRequest)
      treeLoading.value = false;
  }
}
function queueSearch() {
  clearTimeout(searchTimer);
  const owner = generation;
  searchTimer = setTimeout(() => {
    if (owner === generation) loadTree(currentPath.value);
  }, 300);
}
async function preview(path, size = null, updateRoute = true) {
  if (accessInvalid.value) return;
  selectedPath.value = path;
  currentPath.value = path.split("/").slice(0, -1).join("/");
  if (treeContext !== `${currentPath.value}\0${query.value}`)
    treeLoaded.value = false;
  activeView.value = "files";
  if (updateRoute) emit("open-file", path);
}
const filePreviewSource = {
  restricted: true,
  async loadFile(path) {
    const target = { ...props.repository };
    const infoPromise = filePreviewSource.fileInfo(path).catch((error) => {
      if (recheckRevokedAccess(error)) throw error;
      return null;
    });
    const [{ data }, info] = await Promise.all([
      repositoryAccessAPI.guestPreview(target, path),
      infoPromise,
    ]);
    if (/^readme\.md$/i.test(path)) await pendingOverview;
    const content =
      JSON.stringify(target) === JSON.stringify(props.repository)
        ? canonicalReadmePreview(data, path)
        : data;
    if (["video", "audio"].includes(content?.kind)) {
      if (!/^[a-f0-9]{64}$/.test(content.snapshot || ""))
        throw new Error("Invalid media snapshot");
      return {
        content: {
          ...content,
          playlist_url: repositoryAccessAPI.guestMediaPlaylistURL(
            target,
            path,
            content.snapshot,
          ),
        },
        info,
      };
    }
    return { content: controlledPreviewText(content, path), info };
  },
  async fileInfo(path) {
    const target = { ...props.repository },
      key = JSON.stringify([target, generation, path]);
    if (!fileMetadataCache.has(key)) {
      const pending = repositoryAccessAPI
        .guestFileInfo(target, path)
        .then((result) => result.data)
        .catch((error) => {
          fileMetadataCache.delete(key);
          throw error;
        });
      fileMetadataCache.set(key, pending);
    }
    return fileMetadataCache.get(key);
  },
  async listTree(path, options = {}) {
    const { data } = await repositoryAccessAPI.guestTree(
      { ...props.repository },
      path,
      options,
    );
    return {
      entries: data.entries,
      nextCursor: data.next_cursor,
      hasMore: data.has_more,
    };
  },
  async loadThumbnail(path) {
    return (
      await repositoryAccessAPI.guestPreview({ ...props.repository }, path)
    ).data;
  },
  async loadPdfPage(path, page, snapshot) {
    return (
      await repositoryAccessAPI.guestPdfPage(
        { ...props.repository },
        path,
        page,
        snapshot,
      )
    ).data;
  },
  onAccessDenied: recheckRevokedAccess,
  openFile: preview,
};
const fileIdentity = computed(() => ({
  ...props.repository,
  branch: props.branch,
  path: selectedPath.value,
}));
function entryURL(entry) {
  const repo = props.repository;
  const base = `/${repo.type}s/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.name)}`;
  const view = entry.type === "directory" ? "tree" : "blob";
  return `${base}/${view}/main/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
}
function followEntry(event, entry) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  if (entry.type === "directory") openFolder(entry.path);
  else preview(entry.path, entry.size);
}
function openFolder(path) {
  clearTimeout(searchTimer);
  query.value = "";
  selectedPath.value = "";
  activeView.value = "files";
  emit("open-folder", path);
  loadTree(path);
}
function backToFiles() {
  selectedPath.value = "";
  emit("open-folder", currentPath.value);
  if (!treeLoaded.value) loadTree(currentPath.value);
}
async function loadCommits(append = false) {
  if (accessInvalid.value) return;
  if (props.branch !== "main") {
    commits.value = [];
    commitsError.value = decodeError(
      Object.assign(
        new Error("Only the default branch is available in guest preview"),
        { status: 400 },
      ),
    );
    return;
  }
  const owner = generation,
    request = ++commitsRequest,
    target = { ...props.repository },
    options =
      append && commitsCursor.value ? { cursor: commitsCursor.value } : {};
  commitsLoading.value = true;
  commitsError.value = null;
  try {
    const { data } = await repositoryAccessAPI.guestCommits(target, options);
    if (owner !== generation || request !== commitsRequest) return;
    commits.value = append ? [...commits.value, ...data.commits] : data.commits;
    commitsHasMore.value = Boolean(data.has_more && data.next_cursor);
    commitsCursor.value = data.next_cursor || null;
    commitsLoaded.value = true;
  } catch (cause) {
    if (
      owner === generation &&
      request === commitsRequest &&
      recheckRevokedAccess(cause)
    )
      return;
    if (owner === generation && request === commitsRequest)
      commitsError.value = decodeError(cause);
  } finally {
    if (owner === generation && request === commitsRequest)
      commitsLoading.value = false;
  }
}
function ensureView() {
  if (activeView.value === "files") {
    if (props.filePath && selectedPath.value !== props.filePath) {
      preview(props.filePath, null, false);
    } else if (!selectedPath.value && !treeLoaded.value)
      loadTree(currentPath.value);
  }
  if (
    ["files", "commits"].includes(activeView.value) &&
    !commitsLoaded.value &&
    !commitsLoading.value
  )
    loadCommits();
}
function navigate(view) {
  activeView.value = view;
  selectedCommit.value = null;
  if (view !== "files") {
    selectedPath.value = "";
  }
  emit("navigate", view);
  ensureView();
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
  () => JSON.stringify([props.repository, props.branch]),
  () => {
    generation++;
    fileMetadataCache.clear();
    accessInvalid.value = false;
    clearTimeout(searchTimer);
    overview.value = null;
    entries.value = [];
    commits.value = [];
    treeLoaded.value = false;
    commitsLoaded.value = false;
    treeContext = "";
    query.value = "";
    currentPath.value = props.filePath
      ? props.filePath.split("/").slice(0, -1).join("/")
      : props.path;
    selectedPath.value = "";
    selectedCommit.value = null;
    activeView.value = props.view;
    treeError.value = null;
    commitsError.value = null;
    loadOverview();
    ensureView();
  },
  { immediate: true },
);
watch(
  () => [props.view, props.path, props.filePath],
  ([view, path, filePath]) => {
    if (activeView.value !== view) selectedCommit.value = null;
    activeView.value = view;
    if (view !== "files") {
      selectedPath.value = "";
      ensureView();
      return;
    }
    if (filePath) {
      if (selectedPath.value !== filePath) {
        preview(filePath, null, false);
      }
    } else if (selectedPath.value || currentPath.value !== path) {
      selectedPath.value = "";
      currentPath.value = path;
      loadTree(path);
    } else ensureView();
  },
);
// A URL may select only metadata already returned by the authorized history
// request. Unknown or malformed IDs never trigger ordinary commit/diff APIs.
watch(
  [() => props.commitId, activeView, commits],
  ([id, view, history]) => {
    selectedCommit.value =
      view === "commits" &&
      typeof id === "string" &&
      /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(id)
        ? history.find((commit) => commit.id === id) || null
        : null;
  },
  { immediate: true },
);
watch(selectedPath, () => fileMetadataCache.clear(), { flush: "sync" });
onBeforeUnmount(() => {
  fileMetadataCache.clear();
  generation++;
  clearTimeout(searchTimer);
});
defineExpose({ leave, navigate });
</script>
<template>
  <component
    :is="embedded ? BodyOnly : RepositoryAccessLayout"
    :repository="repository"
    :access="access"
    preview
    :view="activeView"
    @navigate="navigate"
  >
    <template v-if="!embedded" #actions
      ><el-button @click="leave">End temporary access</el-button></template
    >
    <div v-if="accessInvalid" role="status">Checking repository access…</div>
    <BlobFilePage
      v-else-if="activeView === 'files' && selectedPath"
      embedded
      :file-identity="fileIdentity"
      :preview-source="filePreviewSource"
    />
    <div v-else class="guest-repository-body" :class="{ embedded }">
      <main class="min-w-0">
        <ErrorState
          v-if="overviewError"
          :error="overviewError"
          mode="inline-panel"
          :retry="loadOverview"
        />
        <template v-if="activeView === 'card'"
          ><div v-if="overviewLoading && !overview" role="status">
            Loading repository card…
          </div>
          <article
            v-else-if="overview?.readme"
            class="card"
            aria-label="Repository card"
          >
            <MarkdownViewer
              :repo-type="repository.type"
              :namespace="repository.namespace"
              :name="repository.name"
              branch="main"
              :content="parsedCard.content"
              :file-path="overview.readme.path"
              :controlled-source="filePreviewSource"
              :strip-frontmatter="false"
              :heading-offset="1"
              @open-file="preview"
              @access-denied="recheckRevokedAccess"
            />
            <p v-if="overview.readme.truncated" class="guest-note">
              This card preview is limited.
            </p>
          </article>
          <div v-else-if="!overviewError" class="card">
            No README.md found
          </div></template
        >
        <template v-else-if="activeView === 'files'">
          <RepositoryFiles
            :repo-type="repository.type"
            :namespace="repository.namespace"
            :name="repository.name"
            :branch="branch"
            v-model:search="query"
            :current-path="currentPath"
            :repository-size="repositorySize"
            :file-tree="directoryEntries"
            :files-loading="treeLoading && !entries.length"
            :tree-error="treeError"
            :file-list-has-more="treeHasMore"
            :file-list-loading-more="treeLoading"
            :get-entry-href="entryURL"
            :get-commit-path="directoryCommitPath"
            :source="directorySource"
            @update:search="queueSearch"
            @reload="loadTree(currentPath)"
            @load-more="loadTree(currentPath, true)"
            @entry-click="followEntry"
          />
          <p v-if="treeMessage" class="guest-note">{{ treeMessage }}</p>
          <article
            v-if="!currentPath && !query && overview?.readme"
            class="card mt-6"
            aria-label="Directory README"
          >
            <MarkdownViewer
              :repo-type="repository.type"
              :namespace="repository.namespace"
              :name="repository.name"
              branch="main"
              :content="parsedCard.content"
              :file-path="overview.readme.path"
              :controlled-source="filePreviewSource"
              :strip-frontmatter="false"
              :heading-offset="1"
              @open-file="preview"
              @access-denied="recheckRevokedAccess"
            />
          </article>
        </template>
        <section
          v-else-if="activeView === 'commits'"
          aria-label="Commit history"
        >
          <div class="guest-directory-toolbar mb-4">
            <button
              type="button"
              class="guest-text-action"
              @click="navigate('files')"
            >
              Back to Files</button
            ><span class="guest-branch"
              ><span class="i-carbon-branch" aria-hidden="true" />{{
                branch
              }}</span
            >
          </div>
          <ErrorState
            v-if="commitsError"
            :error="commitsError"
            mode="inline-panel"
            :retry="() => loadCommits()"
          />
          <div v-if="commitsLoading && !commits.length" role="status">
            Loading commits…
          </div>
          <article v-if="selectedCommit" class="card">
            <button
              type="button"
              class="guest-text-action mb-4"
              @click="selectedCommit = null"
            >
              Back to commit history
            </button>
            <h2 class="font-semibold">
              {{ selectedCommit.message.split("\n")[0] }}
            </h2>
            <p class="guest-note">
              {{ selectedCommit.author }} ·
              {{ formatRelativeTime(selectedCommit.timestamp, "—") }}
            </p>
            <p class="font-mono break-all">{{ selectedCommit.id }}</p>
            <pre class="whitespace-pre-wrap mt-4">{{
              selectedCommit.message
            }}</pre>
          </article>
          <div v-else class="card">
            <h2 class="text-xl font-semibold mb-4">Commit History</h2>
            <div
              v-for="commit in commits"
              :key="commit.id"
              class="guest-commit-row"
            >
              <span class="i-carbon-commit" aria-hidden="true" />
              <div class="min-w-0">
                <button
                  type="button"
                  class="guest-commit-title"
                  @click="selectedCommit = commit"
                >
                  {{ commit.message.split("\n")[0] }}
                </button>
                <p class="guest-note">
                  {{ commit.author }} ·
                  {{ formatRelativeTime(commit.timestamp, "—") }} ·
                  <span class="font-mono">{{ commit.id.slice(0, 7) }}</span>
                </p>
              </div>
            </div>
            <p v-if="!commitsLoading && !commits.length">No commits found</p>
            <div v-if="commitsHasMore" class="text-center pt-4">
              <el-button :loading="commitsLoading" @click="loadCommits(true)"
                >Load More Commits</el-button
              >
            </div>
          </div>
        </section>
        <section
          v-else-if="activeView === 'metadata'"
          aria-label="Repository metadata"
        >
          <DetailedMetadataPanel
            :metadata="metadata"
            :repo-type="repository.type"
          />
        </section>
      </main>
      <GuestRepositorySidebar
        :repository="repository"
        :overview="overview"
        :metadata="metadata"
      />
    </div>
  </component>
</template>
<style scoped>
.guest-repository-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
.guest-repository-body.embedded {
  padding: 24px;
}
@media (max-width: 767px) {
  .guest-repository-body.embedded {
    padding: 20px 16px;
  }
}
.guest-directory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.guest-branch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--site-muted);
  font-size: 14px;
}
.guest-directory-toolbar h2 {
  margin: 0;
  overflow-wrap: anywhere;
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
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.guest-text-action:hover,
.guest-commit-title:hover {
  text-decoration: underline;
}
.guest-text-action:focus-visible,
.guest-commit-title:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
.guest-commit-row {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  margin-bottom: 12px;
}
.guest-commit-row > span {
  flex-shrink: 0;
  color: var(--site-link);
  margin-top: 3px;
}
.guest-commit-title {
  display: block;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--site-card-text);
  text-align: left;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.guest-note {
  margin: 8px 0 0;
}
@media (max-width: 1023px) {
  .guest-repository-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
