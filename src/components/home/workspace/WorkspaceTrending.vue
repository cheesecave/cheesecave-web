<script setup>
import { ElScrollbar } from "element-plus";
import SiteAttribution from "@/components/layout/SiteAttribution.vue";
import RepositoryStats from "@/components/repo/RepositoryStats.vue";
import { buildRepositoryPath } from "@/utils/repo-paths";
import {
  REPOSITORY_TYPES as types,
  getRepositoryType as typeInfo,
} from "@/utils/repository-types";
defineProps({
  trendingRepositories: { type: Array, default: () => [] },
  trendingLoading: Boolean,
  trendingError: Boolean,
});
defineEmits(["retry"]);
const trendingType = defineModel("type", { type: String, default: "model" });
</script>

<template>
  <aside
    class="workspace-trending"
    data-testid="workspace-trending"
    aria-label="Trending repositories"
  >
    <ElScrollbar
      class="workspace-trending-scrollbar"
      wrap-class="workspace-trending-wrap"
      view-class="workspace-trending-view"
      :tabindex="0"
      always
      role="region"
      aria-label="Community discovery"
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
        <button type="button" @click="$emit('retry')">Try again</button>
      </div>
      <p v-else-if="!trendingRepositories.length" class="sidebar-state">
        No trending repositories yet.
      </p>
      <ul v-else class="trending-list">
        <li v-for="repo in trendingRepositories" :key="repo.id">
          <RouterLink
            :to="buildRepositoryPath(trendingType, repo.id)"
            class="trending-repo"
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
          <RepositoryStats :repo="repo" class="trending-stats" />
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
      <SiteAttribution compact />
    </ElScrollbar>
  </aside>
</template>

<style scoped>
.trending-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
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
.sidebar-state button {
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  background: var(--ws-surface);
  color: var(--ws-text);
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
  position: sticky;
  top: 0;
  height: calc(100dvh - var(--site-header-height, 64px));
  align-self: start;
  min-width: 0;
}
.workspace-trending-scrollbar {
  height: 100%;
}
:deep(.workspace-trending-wrap) {
  overscroll-behavior: contain;
}
:deep(.workspace-trending-view) {
  padding: 32px 24px 24px 0;
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
  gap: 16px;
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
@media (max-width: 1150px) {
  .workspace-trending {
    position: static;
    height: auto;
    grid-column: 2;
  }
  .workspace-trending-scrollbar {
    height: auto;
  }
  :deep(.workspace-trending-wrap) {
    overscroll-behavior: auto;
  }
  :deep(.workspace-trending-view) {
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
}
@media (max-width: 700px) {
  .workspace-trending {
    align-self: stretch;
    border-top: 1px solid var(--ws-border);
  }
  :deep(.workspace-trending-view) {
    padding: 22px 20px 32px;
  }
  .workspace-trending .trending-list {
    display: block;
  }
}
</style>
