<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { describeError } from "@/errors";
import { repoAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { getAuthIdentity } from "@/utils/auth-identity";

const query = ref("");
const root = ref(null);
const input = ref(null);
const opened = ref(false);
const debouncing = ref(false);
let debounceTimer;
let restoringFocus = false;
const panelId = `header-search-${useId()}`;
const errorContext = useErrorContext();
const auth = useAuthStore();
const groups = [
  { type: "model", label: "Models", icon: "i-carbon-model" },
  { type: "dataset", label: "Datasets", icon: "i-carbon-data-table" },
  { type: "space", label: "Spaces", icon: "i-carbon-application" },
].map((group) => ({
  ...group,
  resource: useAsyncResource(
    async ({ signal }) => {
      const { data } = await repoAPI.listRepos(
        group.type,
        {
          fallback: false,
          sort: "trending",
          limit: 3,
          search: query.value.trim(),
        },
        { signal },
      );
      if (!Array.isArray(data))
        throw new Error("Invalid repository list response");
      return data.slice(0, 3);
    },
    { immediate: false, autoRetry: false },
  ),
}));

function open() {
  if (opened.value || restoringFocus) return;
  opened.value = true;
  loadGroups();
}
function close(restoreFocus = false) {
  opened.value = false;
  clearTimeout(debounceTimer);
  debouncing.value = false;
  for (const group of groups) group.resource.stop();
  if (restoreFocus) {
    restoringFocus = true;
    input.value?.focus();
    restoringFocus = false;
  }
}
function onOutsidePointer(event) {
  if (!root.value?.contains(event.target)) close();
}
function onFocusOut(event) {
  if (!root.value?.contains(event.relatedTarget)) close();
}
function onResultClick(event) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  close();
}
async function onKeydown(event) {
  if (event.isComposing) return;
  if (event.key === "Escape" && opened.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "Enter" && event.target === input.value && opened.value) {
    const first = root.value?.querySelector("a.header-search-result");
    if (first) {
      event.preventDefault();
      first.click();
    }
    return;
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  open();
  await nextTick();
  const links = Array.from(
    root.value?.querySelectorAll("a.header-search-result") || [],
  );
  if (!links.length) return;
  const current = links.indexOf(event.target.closest("a.header-search-result"));
  const next =
    event.key === "ArrowDown"
      ? current + 1
      : current === -1
        ? links.length - 1
        : current - 1;
  (links[next] || input.value)?.focus();
}
function loadGroups() {
  clearTimeout(debounceTimer);
  debouncing.value = false;
  for (const group of groups) group.resource.reload();
}
watch(query, () => {
  if (!opened.value) return;
  clearTimeout(debounceTimer);
  for (const group of groups) group.resource.stop();
  debouncing.value = true;
  debounceTimer = setTimeout(loadGroups, 300);
});
watch(
  () => getAuthIdentity(auth),
  () => close(),
);
onMounted(() =>
  document.addEventListener("pointerdown", onOutsidePointer, true),
);
onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  document.removeEventListener("pointerdown", onOutsidePointer, true);
});
function repositoryPath(group, repo) {
  return `/${group.type}s/${repo.id.split("/").map(encodeURIComponent).join("/")}`;
}
function errorTitle(group) {
  return describeError(
    group.resource.error.value,
    errorContext(group.label.toLowerCase()),
  ).title;
}
</script>

<template>
  <div
    ref="root"
    class="header-search"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <div class="header-search-field">
      <span class="i-carbon-search" aria-hidden="true" />
      <input
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        aria-label="Search repositories"
        placeholder="Search repositories..."
        autocomplete="off"
        aria-autocomplete="list"
        aria-haspopup="dialog"
        :aria-expanded="opened"
        :aria-controls="panelId"
        @focus="open"
        @click="open"
      />
    </div>
    <div
      v-if="opened"
      :id="panelId"
      class="header-search-panel"
      role="dialog"
      aria-label="Search suggestions"
    >
      <p class="header-search-caption">
        {{ query.trim() ? "Search results" : "Trending repositories" }}
      </p>
      <section
        v-for="group in groups"
        :key="group.type"
        :aria-label="group.label"
        class="header-search-group"
      >
        <h2>
          <span :class="group.icon" aria-hidden="true" />{{ group.label }}
        </h2>
        <p
          v-if="debouncing || group.resource.loading.value"
          class="header-search-status"
          role="status"
        >
          Loading {{ group.label.toLowerCase() }}...
        </p>
        <div
          v-else-if="group.resource.failed.value"
          class="header-search-error"
          role="alert"
        >
          <span>{{ errorTitle(group) }}</span>
          <button
            type="button"
            :aria-label="`Retry ${group.label.toLowerCase()} search`"
            @click="group.resource.reload"
          >
            Retry
          </button>
        </div>
        <p v-else-if="group.resource.empty.value" class="header-search-status">
          No {{ group.label.toLowerCase() }} found
        </p>
        <ul v-else-if="group.resource.ready.value">
          <li v-for="repo in group.resource.data.value" :key="repo.id">
            <RouterLink
              :to="repositoryPath(group, repo)"
              class="header-search-result"
              @click="onResultClick"
            >
              <span :class="group.icon" aria-hidden="true" />
              <span class="header-search-repository">{{ repo.id }}</span>
              <span
                v-if="repo.private"
                class="i-carbon-locked"
                aria-label="Private repository"
              />
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.header-search {
  position: relative;
  width: 100%;
  min-width: 0;
}
.header-search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
  color: var(--site-muted);
}
.header-search-field:focus-within {
  border-color: var(--site-link);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--site-link) 12%, transparent);
}
.header-search-field input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--site-card-text);
  font-size: 13px;
}
.header-search-field input::placeholder {
  color: var(--site-muted);
}
.header-search-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 1100;
  width: 520px;
  max-width: calc(100vw - 32px);
  max-height: min(70vh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
  border: 1px solid var(--site-border);
  border-radius: 12px;
  background: var(--site-card);
  color: var(--site-card-text);
  box-shadow: 0 14px 38px rgb(0 0 0 / 14%);
}
.header-search-caption {
  margin: 0;
  padding: 5px 8px 8px;
  color: var(--site-muted);
  font-size: 11px;
}
.header-search-group + .header-search-group {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--site-border);
}
.header-search-group h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 5px 8px;
  color: var(--site-muted);
  font-size: 11px;
  font-weight: 600;
}
.header-search-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.header-search-result {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--site-card-text);
  font-size: 13px;
  text-decoration: none;
}
.header-search-result:hover,
.header-search-result:focus-visible {
  background: var(--site-hover);
  outline: 2px solid var(--site-link);
  outline-offset: -2px;
}
.header-search-result > [class^="i-carbon"] {
  flex-shrink: 0;
  color: var(--site-muted);
}
.header-search-repository {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-search-status,
.header-search-error {
  margin: 0;
  padding: 7px 8px;
  font-size: 12px;
  color: var(--site-muted);
}
.header-search-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.header-search-error button {
  flex-shrink: 0;
  padding: 3px 7px;
  border: 1px solid var(--site-border);
  border-radius: 5px;
  color: var(--site-link);
  background: var(--site-card);
  cursor: pointer;
}
@media (max-width: 1023px) {
  .header-search-panel {
    width: 100%;
  }
}
</style>
