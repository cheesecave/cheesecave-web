<script setup>
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getAuthIdentity } from "@/utils/auth-identity";
import WorkspaceSidebar from "./workspace/WorkspaceSidebar.vue";
import WorkspaceFeed from "./workspace/WorkspaceFeed.vue";
import WorkspaceTrending from "./workspace/WorkspaceTrending.vue";
import { useWorkspaceActivity } from "./workspace/useWorkspaceActivity";
import { useWorkspaceData } from "./workspace/useWorkspaceData";

const {
  username,
  organizations,
  repositories,
  loading,
  error,
  filter,
  personalExpanded,
  trendingType,
  trendingRepositories,
  trendingLoading,
  trendingError,
  loadRepositories,
  loadTrending,
} = useWorkspaceData();
const activity = useWorkspaceActivity(organizations);
const workspaceView = ref("self");
const selectedOrganization = computed(() =>
  organizations.value.find((org) => `org:${org.name}` === workspaceView.value),
);
watch(
  workspaceView,
  (view) => {
    activity.setFilters(view === "self" ? "all" : view, "all");
  },
  { flush: "sync" },
);
const authStore = useAuthStore();
watch(
  () => getAuthIdentity(authStore),
  () => {
    workspaceView.value = "self";
  },
  { flush: "sync" },
);
watch(
  organizations,
  (value) => {
    if (
      workspaceView.value !== "self" &&
      !value.some((org) => `org:${org.name}` === workspaceView.value)
    ) {
      workspaceView.value = "self";
    }
  },
  { flush: "sync" },
);
</script>

<template>
  <section class="workspace" data-testid="workspace">
    <WorkspaceSidebar
      v-model:view="workspaceView"
      v-model:filter="filter"
      v-model:expanded="personalExpanded"
      :username="username"
      :organizations="organizations"
      :repositories="repositories"
      :loading="loading"
      :error="error"
      @retry="loadRepositories"
    />
    <WorkspaceFeed
      v-model:type="activity.type.value"
      v-model:scope="activity.scope.value"
      :username="username"
      :organizations="organizations"
      :organization="selectedOrganization?.name || null"
      :items="activity.items.value"
      :loading="activity.loading.value"
      :error="activity.error.value"
      :has-more="activity.hasMore.value"
      @retry="activity.retry"
      @load-more="activity.loadMore"
    />
    <WorkspaceTrending
      v-if="!selectedOrganization"
      v-model:type="trendingType"
      :trending-repositories="trendingRepositories"
      :trending-loading="trendingLoading"
      :trending-error="trendingError"
      @retry="loadTrending"
    />
    <aside v-else class="workspace-empty-rail" aria-hidden="true" />
  </section>
</template>

<style scoped>
.workspace {
  --ws-surface: var(--site-card, #fffdf7);
  --ws-bg: var(--site-bg, #f7f4eb);
  --ws-border: var(--site-border, #d9d9d2);
  --ws-text: var(--site-card-text, #2c332b);
  --ws-muted: var(--site-muted, #6b7068);
  --ws-link: var(--site-link, #94621f);
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 300px;
  min-height: calc(100dvh - var(--site-header-height, 64px));
  background: var(--ws-bg);
  color: var(--ws-text);
}
.workspace :deep(a:hover) {
  text-decoration: underline;
}
.workspace :deep(a:focus-visible),
.workspace :deep(button:focus-visible),
.workspace :deep(select:focus-visible) {
  outline: 2px solid var(--site-primary, #94621f);
  outline-offset: 3px;
}
.dark .workspace {
  --ws-surface: var(--site-card, #282e27);
  --ws-bg: var(--site-bg, #1c211d);
  --ws-border: var(--site-border, #4c514a);
  --ws-text: var(--site-card-text, #eef0e7);
  --ws-muted: var(--site-muted, #b3b6ad);
  --ws-link: var(--site-link, #e6b85c);
}
@media (max-width: 1150px) {
  .workspace-empty-rail {
    display: none;
  }
  .workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }
}
@media (max-width: 700px) {
  .workspace {
    display: flex;
    flex-direction: column;
  }
}
</style>
