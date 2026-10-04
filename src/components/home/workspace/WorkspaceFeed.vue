<script setup>
import { REPOSITORY_TYPES as types } from "@/utils/repository-types";
import WorkspaceActivityCard from "./WorkspaceActivityCard.vue";
import WorkspaceCommitDetail from "./WorkspaceCommitDetail.vue";
import WorkspaceScopeFilter from "./WorkspaceScopeFilter.vue";
import RepositoryCard from "@/components/repo/RepositoryCard.vue";
defineProps({
  username: { type: String, default: null },
  organization: { type: String, default: null },
  organizations: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  loading: Boolean,
  error: Boolean,
  hasMore: Boolean,
});
defineEmits(["retry", "load-more"]);
const feedType = defineModel("type", { type: String, default: "all" });
const scope = defineModel("scope", { type: String, default: "all" });
</script>
<template>
  <section
    class="workspace-feed"
    data-testid="workspace-feed"
    :aria-label="
      organization ? `${organization} activity` : 'Repository activity'
    "
    :aria-busy="loading"
  >
    <div v-if="!organization" class="feed-scopes">
      <WorkspaceScopeFilter
        v-model="scope"
        :username="username"
        :organizations="organizations"
      />
    </div>
    <div
      v-if="!organization"
      class="feed-filters feed-types"
      role="group"
      aria-label="Activity category"
    >
      <button
        v-for="item in [
          { type: 'all', plural: 'All' },
          ...types,
          { type: 'likes', plural: 'Likes' },
        ]"
        :key="item.type"
        type="button"
        :aria-pressed="feedType === item.type"
        :class="{ active: feedType === item.type }"
        @click="feedType = item.type"
      >
        {{ item.plural }}
      </button>
    </div>
    <p v-if="loading && items.length" class="loading-message" role="status">
      Updating activity…
    </p>
    <div
      v-if="loading && !items.length"
      class="update-feed workspace-loading"
      role="status"
    >
      <p class="loading-message">Loading activity…</p>
      <article
        v-for="item in 2"
        :key="item"
        class="update-card workspace-skeleton"
        aria-hidden="true"
      >
        <span class="skeleton-line skeleton-meta" /><span
          class="skeleton-line skeleton-title"
        /><span class="skeleton-line" />
      </article>
    </div>
    <div v-if="error" class="workspace-state activity-error" role="alert">
      <h2>Could not load activity.</h2>
      <p>Your feed will update when the connection is restored.</p>
      <button type="button" @click="$emit('retry')">Try again</button>
    </div>
    <div v-if="items.length" class="update-feed">
      <WorkspaceActivityCard v-for="item in items" :key="item.id" :item="item">
        <template #repository="{ repository }">
          <RepositoryCard :repo="repository" :repo-type="repository.type" />
        </template>
        <template v-if="item.kind === 'commit' && item.commit" #details>
          <WorkspaceCommitDetail
            :repository="item.repository"
            :commit="item.commit"
          />
        </template>
      </WorkspaceActivityCard>
      <button
        v-if="hasMore && !error"
        type="button"
        class="load-more"
        :disabled="loading"
        @click="$emit('load-more')"
      >
        {{ loading ? "Loading…" : "Load more" }}
      </button>
      <p v-else-if="!hasMore && !error" class="feed-end">You're up to date.</p>
    </div>
    <div v-else-if="!loading && !error" class="workspace-state">
      <span class="i-carbon-events" aria-hidden="true" />
      <h2>No activity yet</h2>
      <p>
        {{
          organization
            ? "Commits, new repositories, and likes in this organization will appear here."
            : scope === "following"
              ? "Follow people and organizations to see their activity here."
              : feedType === "likes"
                ? "Likes will appear here."
                : feedType !== "all"
                  ? "New repositories and updates will appear here."
                  : "Commits, new repositories, and likes will appear here."
        }}
      </p>
      <RouterLink v-if="!organization" to="/new" class="empty-create"
        >Create a repository →</RouterLink
      >
    </div>
  </section>
</template>
<style scoped>
.workspace-feed {
  min-width: 0;
  padding: 32px clamp(20px, 3vw, 48px) 40px;
}
.feed-filters {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--ws-border);
  margin: 28px 0 22px;
  padding-bottom: 12px;
}
.feed-scopes {
  margin: 0 0 12px;
}
.feed-filters button {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ws-muted);
  border: 1px solid transparent;
}
.feed-filters button.active {
  border-color: var(--site-primary, var(--ws-border));
  background: var(--site-hover, var(--ws-surface));
  color: var(--ws-link);
  font-weight: 600;
}
.update-feed {
  display: grid;
  gap: 28px;
}
.workspace-skeleton {
  background: var(--ws-surface);
  border: 1px solid var(--ws-border);
  border-radius: var(--site-card-radius, 12px);
  box-shadow: var(--site-card-shadow);
  padding: 20px;
  min-width: 0;
}
.loading-message {
  margin: 0;
  font-size: 12px;
  color: var(--ws-muted);
}
.workspace-skeleton {
  display: grid;
  gap: 18px;
}
.skeleton-line {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: var(--ws-border);
  opacity: 0.45;
}
.skeleton-meta {
  width: 35%;
}
.skeleton-title {
  width: 65%;
  height: 18px;
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
.workspace-state button {
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
  color: var(--site-primary-text, #eef0e7);
  background: var(--site-primary, #94621f);
  font-size: 12px;
}
.feed-types {
  margin-top: 0;
}
.feed-filters {
  flex-wrap: wrap;
}
.load-more {
  justify-self: center;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 8px 16px;
  color: var(--ws-link);
  background: var(--ws-surface);
  font-size: 12px;
}
.load-more:disabled {
  opacity: 0.6;
}
.activity-error {
  padding: 24px 12px;
}
@media (max-width: 1150px) {
  .workspace-feed {
    min-height: calc(100dvh - var(--site-header-height, 64px));
    padding-inline: 28px;
  }
}
@media (max-width: 700px) {
  .workspace-feed {
    padding: 24px 20px;
    min-height: calc(100dvh - var(--site-header-height, 64px) - 96px);
  }

  .feed-filters {
    gap: 2px;
    margin-top: 22px;
  }
  .feed-filters button {
    padding: 6px 10px;
  }
  .workspace-state {
    padding: 60px 4px;
  }
}
</style>
