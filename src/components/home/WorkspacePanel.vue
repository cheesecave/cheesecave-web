<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { repoAPI } from "@/utils/api";
import { formatRelativeTime } from "@/utils/datetime";

const authStore = useAuthStore();
const { username, organizations } = storeToRefs(authStore);
const repositories = ref([]);
const loading = ref(false);
const error = ref(false);
const filter = ref("");
const feedType = ref("all");
const personalExpanded = ref(false);
const trendingType = ref("model");
const trendingRepositories = ref([]);
const trendingLoading = ref(false);
const trendingError = ref(false);
let requestVersion = 0;
let trendingVersion = 0;
const types = [
  { type: "model", label: "Model", plural: "Models", icon: "i-carbon-model" },
  {
    type: "dataset",
    label: "Dataset",
    plural: "Datasets",
    icon: "i-carbon-data-table",
  },
  {
    type: "space",
    label: "Space",
    plural: "Spaces",
    icon: "i-carbon-application",
  },
];
const typeInfo = (type) => types.find((item) => item.type === type) || types[0];
const initials = computed(() =>
  (username.value || "").slice(0, 2).toUpperCase(),
);
const visibleRepositories = computed(() =>
  repositories.value.filter((repo) =>
    repo.id.toLowerCase().includes(filter.value.toLowerCase()),
  ),
);
const feedRepositories = computed(() =>
  repositories.value.filter(
    (repo) => feedType.value === "all" || repo.type === feedType.value,
  ),
);

async function loadRepositories() {
  const version = ++requestVersion;
  const owner = username.value;
  repositories.value = [];
  error.value = false;
  loading.value = !!owner;
  if (!owner) return;
  try {
    const { data } = await repoAPI.getUserOverview(owner, "recent", 12);
    if (version !== requestVersion || username.value !== owner) return;
    repositories.value = types
      .flatMap(({ type }) =>
        (data[`${type}s`] || []).map((repo) => ({ ...repo, type })),
      )
      .sort((a, b) =>
        (b.lastModified || "").localeCompare(a.lastModified || ""),
      );
  } catch {
    if (version === requestVersion && username.value === owner)
      error.value = true;
  } finally {
    if (version === requestVersion && username.value === owner)
      loading.value = false;
  }
}
async function loadTrending() {
  const version = ++trendingVersion;
  const owner = username.value;
  const type = trendingType.value;
  trendingRepositories.value = [];
  trendingError.value = false;
  trendingLoading.value = !!owner;
  if (!owner) return;
  try {
    const { data } = await repoAPI.listRepos(type, {
      limit: 3,
      sort: "trending",
      fallback: false,
    });
    if (
      version !== trendingVersion ||
      username.value !== owner ||
      trendingType.value !== type
    )
      return;
    trendingRepositories.value = Array.isArray(data) ? data : [];
  } catch {
    if (
      version === trendingVersion &&
      username.value === owner &&
      trendingType.value === type
    )
      trendingError.value = true;
  } finally {
    if (
      version === trendingVersion &&
      username.value === owner &&
      trendingType.value === type
    )
      trendingLoading.value = false;
  }
}
watch(
  username,
  () => {
    filter.value = "";
    feedType.value = "all";
    personalExpanded.value = false;
    loadRepositories();
    if (trendingType.value !== "model") trendingType.value = "model";
    else loadTrending();
  },
  { immediate: true },
);
watch(trendingType, loadTrending);
onBeforeUnmount(() => {
  requestVersion++;
  trendingVersion++;
});
</script>

<template>
  <section class="workspace" data-testid="workspace">
    <aside
      class="workspace-personal"
      data-testid="workspace-personal"
      aria-label="Your repositories and account"
    >
      <RouterLink :to="`/${username}`" class="account-link"
        ><span class="account-avatar" aria-hidden="true">{{ initials }}</span
        ><span
          ><strong>{{ username }}</strong
          ><small>Personal workspace</small></span
        ><span class="i-carbon-chevron-right" aria-hidden="true"
      /></RouterLink>
      <button
        type="button"
        class="personal-toggle"
        :aria-expanded="personalExpanded"
        aria-controls="personal-repositories"
        @click="personalExpanded = !personalExpanded"
      >
        <span class="i-carbon-folder" aria-hidden="true" /> Your repositories
        <span
          :class="
            personalExpanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'
          "
          aria-hidden="true"
        />
      </button>
      <div
        id="personal-repositories"
        class="personal-content"
        :class="{ expanded: personalExpanded }"
      >
        <div class="sidebar-heading">
          <h2>Your repositories</h2>
          <RouterLink
            to="/new"
            class="workspace-create"
            aria-label="Create repository"
            ><span aria-hidden="true">+</span> New</RouterLink
          >
        </div>
        <label class="repo-search"
          ><span class="i-carbon-search" aria-hidden="true" /><input
            v-model="filter"
            aria-label="Find a repository"
            placeholder="Find a repository…"
            type="search"
        /></label>
        <div v-if="loading" class="sidebar-state" role="status">
          Loading your repositories…
        </div>
        <div v-else-if="error" class="sidebar-state" role="alert">
          <p>Could not load your repositories.</p>
          <button type="button" @click="loadRepositories">Try again</button>
        </div>
        <div v-else-if="!repositories.length" class="sidebar-state">
          <h3>No repositories yet</h3>
          <RouterLink to="/new">Create your first repository →</RouterLink>
        </div>
        <p v-else-if="!visibleRepositories.length" class="sidebar-state">
          No repositories match your search.
        </p>
        <ul v-else class="workspace-repos">
          <li
            v-for="repo in visibleRepositories"
            :key="`${repo.type}:${repo.id}`"
          >
            <RouterLink :to="`/${repo.type}s/${repo.id}`" class="workspace-repo"
              ><span
                :class="typeInfo(repo.type).icon"
                aria-hidden="true" /><span class="compact-repo-name">{{
                repo.id
              }}</span
              ><span
                v-if="repo.private"
                class="i-carbon-locked"
                title="Private"
                aria-label="Private"
            /></RouterLink>
          </li>
        </ul>
        <RouterLink :to="`/${username}`" class="all-repositories"
          >View all repositories <span aria-hidden="true">→</span></RouterLink
        >
        <section class="sidebar-section">
          <div class="sidebar-heading">
            <h2>Your organizations</h2>
            <RouterLink
              to="/organizations/new"
              aria-label="Create an organization"
              >+</RouterLink
            >
          </div>
          <ul v-if="organizations.length" class="organization-list">
            <li v-for="org in organizations" :key="org.name">
              <RouterLink :to="`/organizations/${org.name}`"
                ><span class="organization-avatar" aria-hidden="true">{{
                  org.name.slice(0, 1).toUpperCase()
                }}</span
                ><span class="organization-name">{{ org.name }}</span
                ><span class="organization-role">{{
                  org.roleInOrg || org.role
                }}</span></RouterLink
              >
            </li>
          </ul>
          <p v-else class="organization-empty">
            You haven't joined any organizations yet.
          </p>
        </section>
        <nav class="quick-links" aria-label="Workspace shortcuts">
          <RouterLink :to="`/${username}`"
            ><span class="i-carbon-user-avatar" aria-hidden="true" /> Your
            profile</RouterLink
          ><RouterLink to="/settings"
            ><span class="i-carbon-settings" aria-hidden="true" /> Account
            settings</RouterLink
          ><RouterLink to="/organizations"
            ><span class="i-carbon-group" aria-hidden="true" />
            Organizations</RouterLink
          ><RouterLink to="/docs"
            ><span class="i-carbon-book" aria-hidden="true" />
            Documentation</RouterLink
          >
        </nav>
      </div>
    </aside>

    <section
      class="workspace-feed"
      data-testid="workspace-feed"
      aria-label="Recent repository updates"
    >
      <header class="feed-heading">
        <div>
          <h1>Your workspace</h1>
          <p>Recent updates from your repositories</p>
        </div>
        <RouterLink
          to="/new"
          class="mobile-create"
          aria-label="Create repository"
          ><span class="i-carbon-add" aria-hidden="true" /> New</RouterLink
        ><button
          type="button"
          class="refresh-button"
          aria-label="Refresh your repositories"
          :disabled="loading"
          @click="loadRepositories"
        >
          <span class="i-carbon-renew" aria-hidden="true" />
        </button>
      </header>
      <div class="feed-filters" role="group" aria-label="Filter recent updates">
        <button
          v-for="item in [{ type: 'all', plural: 'All' }, ...types]"
          :key="item.type"
          type="button"
          :aria-pressed="feedType === item.type"
          :class="{ active: feedType === item.type }"
          @click="feedType = item.type"
        >
          {{ item.plural }}
        </button>
      </div>
      <div v-if="loading" class="workspace-state" role="status">
        <span class="i-carbon-time" aria-hidden="true" />
        <h2>Loading your repositories…</h2>
      </div>
      <div v-else-if="error" class="workspace-state" role="alert">
        <span class="i-carbon-cloud-offline" aria-hidden="true" />
        <h2>Could not load your repositories.</h2>
        <p>Your work will appear here when the connection is restored.</p>
        <button type="button" @click="loadRepositories">Try again</button>
      </div>
      <div v-else-if="!repositories.length" class="workspace-state">
        <span class="i-carbon-folder-add" aria-hidden="true" />
        <h2>No repositories yet</h2>
        <p>Create a home for your first model, dataset, or space.</p>
        <RouterLink to="/new" class="empty-create"
          >Create your first repository →</RouterLink
        >
      </div>
      <div v-else-if="!feedRepositories.length" class="workspace-state">
        <h2>No recent {{ typeInfo(feedType).plural.toLowerCase() }}</h2>
        <p>Choose another type to see your recent repositories.</p>
      </div>
      <div v-else class="update-feed">
        <article
          v-for="repo in feedRepositories"
          :key="`${repo.type}:${repo.id}`"
          class="update-card"
        >
          <div class="update-meta">
            <span
              :class="[
                'repository-type-icon',
                repo.type,
                typeInfo(repo.type).icon,
              ]"
              aria-hidden="true"
            /><span
              >{{ typeInfo(repo.type).label
              }}<span v-if="repo.lastModified">
                · Updated
                {{ formatRelativeTime(repo.lastModified, "never") }}</span
              ></span
            ><span v-if="repo.private" class="private-tag"
              ><span class="i-carbon-locked" aria-hidden="true" /> Private</span
            >
          </div>
          <h2>
            <RouterLink :to="`/${repo.type}s/${repo.id}`">{{
              repo.id
            }}</RouterLink>
          </h2>
          <p v-if="repo.description" class="repository-description">
            {{ repo.description }}
          </p>
          <div v-if="repo.tags?.length" class="repository-tags">
            <span v-for="tag in repo.tags.slice(0, 4)" :key="tag">{{
              tag
            }}</span>
          </div>
          <div class="repository-stats">
            <span
              ><span class="i-carbon-download" aria-hidden="true" />
              {{ repo.downloads || 0 }} downloads</span
            ><span
              ><span class="i-carbon-favorite" aria-hidden="true" />
              {{ repo.likes || 0 }} likes</span
            ><RouterLink
              :to="`/${repo.type}s/${repo.id}`"
              aria-label="Open repository"
              class="open-repository"
              >View repository <span aria-hidden="true">→</span></RouterLink
            >
          </div>
        </article>
        <p class="feed-end">You're up to date with your recent repositories.</p>
      </div>
    </section>

    <aside
      class="workspace-trending"
      data-testid="workspace-trending"
      aria-label="Trending repositories"
    >
      <div class="trending-heading">
        <span class="i-carbon-chart-line" aria-hidden="true" />
        <h2>Trending</h2>
      </div>
      <p class="trending-subtitle">Discover what the community is building</p>
      <label class="trending-select"
        ><span class="sr-only">Trending repository type</span
        ><select v-model="trendingType" aria-label="Trending repository type">
          <option v-for="item in types" :key="item.type" :value="item.type">
            {{ item.plural }}
          </option>
        </select></label
      >
      <p v-if="trendingLoading" class="sidebar-state" role="status">
        Loading trending repositories…
      </p>
      <div v-else-if="trendingError" class="sidebar-state" role="alert">
        <p>Could not load trending repositories.</p>
        <button type="button" @click="loadTrending">Try again</button>
      </div>
      <p v-else-if="!trendingRepositories.length" class="sidebar-state">
        No trending repositories yet.
      </p>
      <ul v-else class="trending-list">
        <li v-for="repo in trendingRepositories" :key="repo.id">
          <RouterLink :to="`/${trendingType}s/${repo.id}`" class="trending-repo"
            ><span
              :class="[
                'repository-type-icon',
                trendingType,
                typeInfo(trendingType).icon,
              ]"
              aria-hidden="true"
            /><strong>{{ repo.id }}</strong></RouterLink
          >
          <p v-if="repo.tags?.length" class="trending-tags">
            {{ repo.tags.slice(0, 2).join(" · ") }}
          </p>
          <div class="trending-stats">
            <span
              ><span class="i-carbon-download" aria-hidden="true" />
              {{ repo.downloads || 0 }}</span
            ><span
              ><span class="i-carbon-favorite" aria-hidden="true" />
              {{ repo.likes || 0 }}</span
            >
          </div>
        </li>
      </ul>
      <RouterLink :to="`/${trendingType}s`" class="browse-trending"
        >Browse all {{ typeInfo(trendingType).plural.toLowerCase() }}
        <span aria-hidden="true">→</span></RouterLink
      >
      <div class="workspace-guide">
        <span class="i-carbon-book" aria-hidden="true" />
        <h3>Make room for your next idea</h3>
        <p>
          Publish a model, curate a dataset, or share a space with your team.
        </p>
        <RouterLink to="/docs">Explore the documentation →</RouterLink>
      </div>
      <nav class="workspace-footer" aria-label="Workspace resources">
        <RouterLink to="/docs">Documentation</RouterLink
        ><RouterLink to="/self-hosted">Self-hosting</RouterLink
        ><RouterLink to="/organizations">Organizations</RouterLink>
      </nav>
    </aside>
  </section>
</template>

<style scoped>
.workspace {
  --ws-surface: #ffffff;
  --ws-bg: #f6f8fa;
  --ws-border: #e3e7eb;
  --ws-text: #222b38;
  --ws-muted: #6b7280;
  --ws-link: #3e66a8;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 300px;
  min-height: calc(100dvh - var(--site-header-height, 64px));
  background: var(--ws-bg);
  color: var(--ws-text);
}
.workspace-personal {
  position: sticky;
  top: 0;
  align-self: start;
  min-height: calc(100dvh - var(--site-header-height, 64px));
  max-height: calc(100dvh - var(--site-header-height, 64px));
  overflow-y: auto;
  padding: 26px 20px;
  border-right: 1px solid var(--ws-border);
  background: var(--ws-surface);
}
.account-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-bottom: 28px;
  color: var(--ws-text);
}
.account-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid #cfdcdb;
  border-radius: 50%;
  background: #e6eeea;
  color: #456855;
  font-size: 12px;
  font-weight: 700;
}
.account-link > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.account-link strong {
  display: block;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.account-link small {
  display: block;
  color: var(--ws-muted);
  font-size: 11px;
  margin-top: 2px;
}
.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.sidebar-heading h2 {
  font-size: 13px;
  font-weight: 650;
  margin: 0;
}
.workspace-create {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #426750;
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}
.workspace-create:hover {
  background: #527c61;
}
.repo-search {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 8px 9px;
  color: var(--ws-muted);
}
.repo-search input {
  width: 100%;
  min-width: 0;
  font-size: 11px;
  background: transparent;
  color: var(--ws-text);
  outline: none;
}
.repo-search:focus-within {
  outline: 2px solid #7c9bc5;
  outline-offset: 2px;
}
.workspace-repos,
.organization-list,
.trending-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
}
.workspace-repo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--ws-link);
  font-size: 12px;
}
.workspace-repo > span:first-child {
  flex-shrink: 0;
  color: var(--ws-muted);
}
.compact-repo-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.all-repositories {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 11px;
  color: var(--ws-muted);
}
.sidebar-section {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--ws-border);
}
.organization-list a {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ws-text);
  font-size: 12px;
  padding: 7px 0;
}
.organization-avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: var(--ws-bg);
  border: 1px solid var(--ws-border);
  border-radius: 5px;
  color: var(--ws-muted);
  font-size: 10px;
}
.organization-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.organization-role {
  margin-left: auto;
  font-size: 10px;
  color: var(--ws-muted);
}
.organization-empty {
  color: var(--ws-muted);
  font-size: 12px;
  line-height: 1.7;
}
.quick-links {
  display: grid;
  gap: 14px;
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--ws-border);
}
.quick-links a {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ws-muted);
}
.workspace-feed {
  min-width: 0;
  padding: 32px clamp(20px, 3vw, 48px) 40px;
}
.feed-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.feed-heading h1 {
  font-size: 23px;
  font-weight: 650;
  letter-spacing: -0.025em;
  margin: 0;
}
.feed-heading p {
  font-size: 12px;
  color: var(--ws-muted);
  margin: 6px 0 0;
}
.refresh-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  background: var(--ws-surface);
  color: var(--ws-muted);
  flex-shrink: 0;
}
.refresh-button:disabled {
  opacity: 0.5;
}
.feed-filters {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--ws-border);
  margin: 28px 0 22px;
  padding-bottom: 12px;
}
.feed-filters button {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ws-muted);
  border: 1px solid transparent;
}
.feed-filters button.active {
  border-color: var(--ws-border);
  background: var(--ws-surface);
  color: var(--ws-text);
  font-weight: 600;
}
.update-feed {
  display: grid;
  gap: 16px;
}
.update-card {
  background: var(--ws-surface);
  border: 1px solid var(--ws-border);
  border-radius: 10px;
  padding: 20px;
  min-width: 0;
}
.update-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--ws-muted);
  flex-wrap: wrap;
}
.repository-type-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.repository-type-icon.model {
  color: #799ac4;
}
.repository-type-icon.dataset {
  color: #729c7a;
}
.repository-type-icon.space {
  color: #ad93c3;
}
.private-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 10px;
  border: 1px solid var(--ws-border);
  padding: 2px 6px;
  border-radius: 5px;
}
.update-card h2 {
  margin: 14px 0 12px;
  font-size: 17px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.update-card h2 a {
  color: var(--ws-link);
}
.repository-description {
  font-size: 13px;
  color: var(--ws-muted);
  line-height: 1.7;
  margin-bottom: 14px;
  overflow-wrap: anywhere;
}
.repository-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.repository-tags span {
  color: var(--ws-muted);
  background: var(--ws-bg);
  border: 1px solid var(--ws-border);
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 10px;
  overflow-wrap: anywhere;
}
.repository-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  border-top: 1px solid var(--ws-border);
  padding-top: 14px;
  font-size: 11px;
  color: var(--ws-muted);
}
.repository-stats > span,
.trending-stats > span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.open-repository {
  margin-left: auto;
  color: var(--ws-muted);
}
.feed-end {
  text-align: center;
  font-size: 11px;
  color: var(--ws-muted);
  margin: 12px 0;
}
.workspace-state {
  padding: 70px 12px;
  text-align: center;
  color: var(--ws-muted);
}
.workspace-state > span {
  display: inline-block;
  width: 36px;
  height: 36px;
  color: #94a3b8;
  margin-bottom: 14px;
}
.workspace-state h2 {
  color: var(--ws-text);
  font-size: 17px;
  font-weight: 600;
}
.workspace-state p {
  font-size: 13px;
  line-height: 1.7;
  margin: 12px 0 22px;
}
.workspace-state button,
.sidebar-state button {
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  background: var(--ws-surface);
  color: var(--ws-text);
}
.empty-create {
  display: inline-flex;
  padding: 9px 14px;
  border-radius: 6px;
  color: white;
  background: #426750;
  font-size: 12px;
}
.sidebar-state {
  color: var(--ws-muted);
  font-size: 12px;
  padding: 18px 0;
  line-height: 1.8;
}
.sidebar-state h3 {
  color: var(--ws-text);
  font-weight: 600;
}
.sidebar-state p {
  margin-bottom: 10px;
}
.workspace-trending {
  padding: 32px 24px 24px 0;
  align-self: start;
  min-width: 0;
}
.trending-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.trending-heading > span {
  color: #959788;
}
.trending-heading h2 {
  font-size: 15px;
  font-weight: 650;
  margin: 0;
}
.trending-subtitle {
  color: var(--ws-muted);
  font-size: 11px;
  line-height: 1.7;
  margin: 8px 0 14px;
}
.trending-select select {
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  background: var(--ws-surface);
  color: var(--ws-text);
}
.trending-list li {
  border-bottom: 1px solid var(--ws-border);
  padding: 17px 0;
}
.trending-repo {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--ws-link);
  font-size: 12px;
  line-height: 1.5;
}
.trending-repo strong {
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}
.trending-tags {
  margin: 7px 0 0 24px;
  color: var(--ws-muted);
  font-size: 10px;
  overflow-wrap: anywhere;
}
.trending-stats {
  display: flex;
  gap: 16px;
  color: var(--ws-muted);
  margin: 9px 0 0 24px;
  font-size: 10px;
}
.browse-trending {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--ws-link);
  margin-top: 14px;
}
.workspace-guide {
  margin-top: 32px;
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--ws-border);
  background: var(--ws-surface);
}
.workspace-guide > span {
  display: inline-block;
  color: var(--ws-muted);
}
.workspace-guide h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 10px 0;
}
.workspace-guide p {
  color: var(--ws-muted);
  font-size: 12px;
  line-height: 1.7;
}
.workspace-guide a {
  display: block;
  color: var(--ws-link);
  font-size: 11px;
  margin-top: 14px;
}
.workspace-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}
.workspace-footer a {
  color: var(--ws-muted);
  font-size: 10px;
}
.personal-toggle,
.mobile-create {
  display: none;
}
.workspace a:hover {
  text-decoration: underline;
}
.workspace a:focus-visible,
.workspace button:focus-visible,
.workspace select:focus-visible {
  outline: 2px solid #7c9bc5;
  outline-offset: 3px;
}
:global(.dark) .workspace {
  --ws-surface: #1b222c;
  --ws-bg: #151b23;
  --ws-border: #303a47;
  --ws-text: #dce4ee;
  --ws-muted: #9aa5b3;
  --ws-link: #99b8e2;
}
:global(.dark) .account-avatar {
  border-color: #46594e;
  background: #2b3c31;
  color: #aec3b2;
}
@media (max-width: 1150px) {
  .workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .workspace-personal {
    grid-row: 1 / span 2;
  }
  .workspace-trending {
    grid-column: 2;
    padding: 0 28px 32px;
  }
  .workspace-guide {
    margin-top: 22px;
  }
  .workspace-trending .trending-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .workspace-feed {
    min-height: calc(100dvh - var(--site-header-height, 64px));
    padding-inline: 28px;
  }
}
@media (max-width: 700px) {
  .workspace {
    display: flex;
    flex-direction: column;
  }
  .workspace-personal {
    position: static;
    align-self: stretch;
    min-height: 0;
    max-height: none;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid var(--ws-border);
    padding: 14px 20px;
  }
  .account-link {
    margin: 0 0 12px;
  }
  .account-link .account-avatar {
    width: 30px;
    height: 30px;
  }
  .account-link small {
    display: none;
  }
  .personal-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-size: 12px;
    color: var(--ws-muted);
  }
  .personal-toggle > span:last-child {
    margin-left: auto;
  }
  .personal-content {
    display: none;
  }
  .personal-content.expanded {
    display: block;
    padding-top: 20px;
  }
  .workspace-feed {
    padding: 24px 20px;
    min-height: calc(100dvh - var(--site-header-height, 64px) - 96px);
  }
  .feed-heading h1 {
    font-size: 21px;
  }
  .feed-heading p {
    font-size: 11px;
  }
  .refresh-button {
    display: none;
  }
  .mobile-create {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    color: var(--ws-link);
    font-size: 12px;
    white-space: nowrap;
  }
  .feed-filters {
    gap: 2px;
    margin-top: 22px;
  }
  .feed-filters button {
    padding: 6px 10px;
  }
  .update-card {
    padding: 18px;
  }
  .repository-stats {
    gap: 12px;
  }
  .open-repository {
    flex-basis: 100%;
    margin: 2px 0 0;
  }
  .workspace-trending {
    align-self: stretch;
    padding: 22px 20px 32px;
    border-top: 1px solid var(--ws-border);
  }
  .workspace-trending .trending-list {
    display: block;
  }
  .workspace-state {
    padding: 60px 4px;
  }
}
</style>
