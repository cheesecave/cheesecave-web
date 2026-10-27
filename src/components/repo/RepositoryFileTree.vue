<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import ErrorState from "@/components/common/ErrorState.vue";
import { useErrorContext } from "@/composables/useErrorContext";
import { decodeError, KIND } from "@/errors";
import { repoAPI } from "@/utils/api";
import {
  buildRepositoryPath,
  normalizeCatchAllParam,
  resolveRepoTreeEntryPath,
} from "@/utils/repo-paths";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, required: true },
  currentPath: { type: String, default: "" },
});
defineEmits(["collapse"]);
const router = useRouter();
const errorContext = useErrorContext();
const folders = reactive(new Map());
const expanded = ref(new Set());
const filter = ref("");
const branches = ref([]);
const refsLoading = ref(false);
const refsError = ref(null);
let generation = 0;
let refsRequest = 0;

const repositoryPath = computed(() =>
  buildRepositoryPath(props.repoType, `${props.namespace}/${props.name}`),
);
const rootPath = computed(
  () => `${repositoryPath.value}/tree/${encodeURIComponent(props.branch)}`,
);
const currentPath = computed(() => normalizeCatchAllParam(props.currentPath));
const branchOptions = computed(() => [
  ...new Set([props.branch, ...branches.value]),
]);
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
const fileHref = (path, branch = props.branch) =>
  `${repositoryPath.value}/blob/${encodeURIComponent(branch)}/${encodePath(path)}`;
const basename = (path) => path.split("/").pop();
function stateFor(path) {
  if (!folders.has(path)) {
    folders.set(path, {
      entries: [],
      loaded: false,
      loading: false,
      error: null,
      nextCursor: null,
      hasMore: false,
      failedAppend: false,
    });
  }
  return folders.get(path);
}
function mergeEntries(state, entries, path) {
  const merged = new Map(state.entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    if (!["file", "directory"].includes(entry.type) || !entry.path) continue;
    const resolved = resolveRepoTreeEntryPath(path, entry.path);
    if (resolved === path) continue;
    merged.set(resolved, { ...entry, path: resolved });
  }
  state.entries = [...merged.values()].sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      basename(a.path).localeCompare(basename(b.path), undefined, {
        numeric: true,
      }),
  );
}
async function loadFolder(path, append = false) {
  const state = stateFor(path);
  if (state.loading) return state.pending;
  if (state.loaded && !state.error && !append) return;
  const context = generation;
  const identity = [
    props.repoType,
    props.namespace,
    props.name,
    encodeURIComponent(props.branch),
  ];
  state.loading = true;
  state.error = null;
  state.failedAppend = append;
  const pending = (async () => {
    try {
      const page = await repoAPI.listTreePage(
        ...identity,
        path ? `/${encodePath(path)}` : "",
        {
          limit: 50,
          recursive: false,
          expand: false,
          ...(append && state.nextCursor ? { cursor: state.nextCursor } : {}),
        },
      );
      if (context !== generation) return;
      if (!append) state.entries = [];
      mergeEntries(state, page.entries || [], path);
      state.nextCursor = page.nextCursor || null;
      state.hasMore = Boolean(page.hasMore);
      state.loaded = true;
    } catch (error) {
      if (context !== generation) return;
      const decoded = decodeError(error);
      if (decoded.kind !== KIND.CANCELLED) state.error = decoded;
    } finally {
      if (context === generation) state.loading = false;
    }
  })();
  state.pending = pending;
  return pending;
}
async function loadRefs() {
  const context = generation;
  const request = ++refsRequest;
  refsLoading.value = true;
  refsError.value = null;
  try {
    const { data } = await repoAPI.listRefs(
      props.repoType,
      props.namespace,
      props.name,
    );
    if (context !== generation || request !== refsRequest) return;
    branches.value = (data.branches || [])
      .map((entry) => entry.name)
      .filter((name) => typeof name === "string" && name);
  } catch (error) {
    if (context === generation && request === refsRequest)
      refsError.value = decodeError(error);
  } finally {
    if (context === generation && request === refsRequest)
      refsLoading.value = false;
  }
}
async function revealCurrentPath() {
  const context = generation;
  const path = currentPath.value;
  const segments = path.split("/").filter(Boolean);
  const ancestors = segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"));
  expanded.value = new Set([...expanded.value, ...ancestors]);
  await Promise.all(["", ...ancestors].map((folder) => loadFolder(folder)));
  if (context !== generation || path !== currentPath.value || !path) return;
  // A current entry can be beyond the first page. Locate only this file and
  // its ancestors, without walking every page of a large repository.
  const needed = [...ancestors, path].filter((entry) => {
    const parent = entry.split("/").slice(0, -1).join("/");
    return !stateFor(parent).entries.some((item) => item.path === entry);
  });
  if (!needed.length) return;
  try {
    const { data } = await repoAPI.getPathsInfo(
      props.repoType,
      props.namespace,
      props.name,
      encodeURIComponent(props.branch),
      needed,
      false,
    );
    if (context !== generation || path !== currentPath.value) return;
    for (const entry of data || []) {
      if (!needed.includes(entry.path)) continue;
      const parent = entry.path.split("/").slice(0, -1).join("/");
      mergeEntries(stateFor(parent), [entry], parent);
    }
  } catch {
    // The paginated listing remains usable; its own errors have a Retry action.
  }
}
function toggleFolder(path) {
  const next = new Set(expanded.value);
  if (next.has(path)) next.delete(path);
  else {
    next.add(path);
    void loadFolder(path);
  }
  expanded.value = next;
}
function changeBranch(branch) {
  if (!branch || branch === props.branch) return;
  router.push(
    currentPath.value
      ? fileHref(currentPath.value, branch)
      : `${repositoryPath.value}/tree/${encodeURIComponent(branch)}`,
  );
}
const rows = computed(() => {
  const result = [];
  function visit(path, depth) {
    const state = folders.get(path);
    if (!state) return;
    for (const entry of state.entries) {
      result.push({ kind: "entry", ...entry, depth });
      if (entry.type === "directory" && expanded.value.has(entry.path))
        visit(entry.path, depth + 1);
    }
    if (state.error) result.push({ kind: "error", path, depth, state });
    else if (state.loading) result.push({ kind: "loading", path, depth });
    else if (state.hasMore) result.push({ kind: "more", path, depth });
  }
  visit("", 0);
  const query = filter.value.trim().toLowerCase();
  if (!query) return result;
  const matches = result.filter(
    (row) => row.kind === "entry" && row.path.toLowerCase().includes(query),
  );
  return result.filter(
    (row) =>
      row.kind !== "entry" ||
      matches.some(
        (match) =>
          match.path === row.path || match.path.startsWith(`${row.path}/`),
      ),
  );
});
const hasRows = computed(() => rows.value.some((row) => row.kind === "entry"));

watch(
  () => [props.repoType, props.namespace, props.name, props.branch],
  () => {
    generation += 1;
    folders.clear();
    expanded.value = new Set();
    filter.value = "";
    branches.value = [];
    void loadRefs();
    void revealCurrentPath();
  },
  { immediate: true },
);
watch(currentPath, () => {
  void revealCurrentPath();
});
onBeforeUnmount(() => {
  generation += 1;
});
</script>

<template>
  <section class="repository-file-tree" aria-label="File explorer">
    <div class="file-tree-controls">
      <div class="file-tree-heading">
        <button
          type="button"
          class="file-tree-icon-button"
          aria-label="Hide file tree"
          title="Hide file tree"
          @click="$emit('collapse')"
        >
          <span class="i-carbon-side-panel-close" aria-hidden="true" />
        </button>
        <RouterLink :to="rootPath">Files</RouterLink>
      </div>
      <div class="file-tree-branch-row">
        <el-select
          :model-value="branch"
          aria-label="Branch"
          placeholder="Branch"
          class="file-tree-branch"
          :loading="refsLoading"
          @change="changeBranch"
        >
          <template #prefix
            ><span class="i-carbon-branch" aria-hidden="true"
          /></template>
          <el-option
            v-for="item in branchOptions"
            :key="item"
            :value="item"
            :label="item"
          />
        </el-select>
        <button
          v-if="refsError"
          type="button"
          class="file-tree-icon-button"
          aria-label="Retry branches"
          title="Retry branches"
          @click="loadRefs"
        >
          <span class="i-carbon-renew" aria-hidden="true" />
        </button>
      </div>
      <el-input
        v-model="filter"
        aria-label="Filter files"
        placeholder="Filter files"
        title="Filter files in loaded folders"
        class="file-tree-filter"
        clearable
      >
        <template #prefix
          ><span class="i-carbon-search" aria-hidden="true"
        /></template>
      </el-input>
    </div>
    <nav class="file-tree-scroll" aria-label="Repository files">
      <template v-for="row in rows" :key="`${row.kind}:${row.path}`">
        <button
          v-if="row.kind === 'entry' && row.type === 'directory'"
          type="button"
          class="file-tree-entry file-tree-directory"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          :aria-expanded="expanded.has(row.path)"
          :aria-label="`${expanded.has(row.path) ? 'Collapse' : 'Expand'} ${row.path}`"
          :title="row.path"
          @click="toggleFolder(row.path)"
        >
          <span
            :class="
              expanded.has(row.path)
                ? 'i-carbon-chevron-down'
                : 'i-carbon-chevron-right'
            "
            class="file-tree-chevron"
            aria-hidden="true"
          />
          <span class="i-carbon-folder" aria-hidden="true" />
          <span class="file-tree-name">{{ basename(row.path) }}</span>
        </button>
        <RouterLink
          v-else-if="row.kind === 'entry'"
          :to="fileHref(row.path)"
          class="file-tree-entry"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          :aria-label="`Open ${row.path}`"
          :aria-current="row.path === currentPath ? 'page' : undefined"
          :title="row.path"
        >
          <span class="file-tree-chevron" aria-hidden="true" />
          <span class="i-carbon-document" aria-hidden="true" />
          <span class="file-tree-name">{{ basename(row.path) }}</span>
        </RouterLink>
        <div v-else-if="row.kind === 'error'" class="file-tree-error">
          <ErrorState
            :error="row.state.error"
            :context="errorContext('file tree')"
            mode="inline-panel"
            :retry="() => loadFolder(row.path, row.state.failedAppend)"
          />
        </div>
        <div
          v-else-if="row.kind === 'loading'"
          class="file-tree-status"
          role="status"
          :style="{ paddingLeft: `${16 + row.depth * 16}px` }"
        >
          <span class="i-carbon-renew animate-spin" aria-hidden="true" />
          Loading files...
        </div>
        <button
          v-else
          type="button"
          class="file-tree-more"
          :aria-label="`Load more files in ${row.path || 'root'}`"
          :style="{ paddingLeft: `${16 + row.depth * 16}px` }"
          @click="loadFolder(row.path, true)"
        >
          Load more
        </button>
      </template>
      <p
        v-if="
          !hasRows &&
          !rows.some((row) => row.kind === 'error' || row.kind === 'loading')
        "
        class="file-tree-empty"
      >
        {{ filter ? "No matching loaded files" : "No files found" }}
      </p>
    </nav>
  </section>
</template>

<style scoped>
.repository-file-tree {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  color: var(--site-card-text);
  background: var(--site-card);
  font-size: 13px;
}
.file-tree-controls {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 12px 12px;
  border-bottom: 1px solid var(--site-border);
}
.file-tree-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
}
.file-tree-heading a {
  color: inherit;
}
.file-tree-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  color: var(--site-muted);
  background: var(--site-card);
  cursor: pointer;
}
.file-tree-icon-button:hover {
  background: var(--site-hover);
}
.file-tree-branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-tree-branch {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.file-tree-branch :deep(.el-select__wrapper),
.file-tree-filter :deep(.el-input__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  background: var(--site-card);
  box-shadow: 0 0 0 1px var(--site-border) inset;
}
.file-tree-branch :deep(.el-select__wrapper:hover) {
  background: var(--site-hover);
}
.file-tree-branch :deep(.el-select__selected-item) {
  color: var(--site-card-text);
  font-size: 13px;
  font-weight: 600;
}
.file-tree-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 8px;
  scrollbar-width: thin;
}
.file-tree-entry {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  color: var(--site-card-text);
  background: transparent;
  text-align: left;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}
.file-tree-entry:hover,
.file-tree-entry[aria-current="page"] {
  background: var(--site-hover);
}
.file-tree-entry[aria-current="page"]::before {
  position: absolute;
  left: -5px;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 2px;
  background: var(--site-link);
  content: "";
}
.file-tree-entry > [class*="i-carbon-"] {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--site-muted);
}
.file-tree-chevron {
  flex: 0 0 12px;
  width: 12px !important;
  height: 12px !important;
}
.file-tree-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.file-tree-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  color: var(--site-muted);
}
.file-tree-more {
  width: 100%;
  border: 0;
  padding: 8px;
  background: transparent;
  color: var(--site-link);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.file-tree-more:hover {
  text-decoration: underline;
}
.file-tree-empty {
  padding: 16px 8px;
  color: var(--site-muted);
  text-align: center;
}
.file-tree-error {
  padding: 0 8px;
}
.file-tree-entry:focus-visible,
.file-tree-icon-button:focus-visible,
.file-tree-more:focus-visible {
  outline: 2px solid var(--site-link);
  outline-offset: 1px;
}
</style>
