<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { repoAPI } from "@/utils/api";
import { formatRelativeTime } from "@/utils/datetime";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, required: true },
  external: { type: Boolean, default: false },
});
const errorContext = useErrorContext();
// This small request never controls the file list or loads history's permissions.
// useAsyncResource ignores superseded responses and stops on component disposal.
const resource = useAsyncResource(
  async () => {
    if (props.external) return null;
    const { data } = await repoAPI.listCommits(
      props.repoType,
      props.namespace,
      props.name,
      props.branch,
      { limit: 1 },
    );
    return data.commits?.[0] || null;
  },
  {
    autoRetry: false,
    watch: [
      () => props.repoType,
      () => props.namespace,
      () => props.name,
      () => props.branch,
      () => props.external,
    ],
  },
);
const commit = computed(() => resource.data.value);
const repoPath = computed(
  () => `/${props.repoType}s/${props.namespace}/${props.name}`,
);
const commitPath = computed(
  () =>
    `${repoPath.value}/commit/${commit.value?.id}${props.branch === "main" ? "" : `?branch=${encodeURIComponent(props.branch)}`}`,
);
</script>

<template>
  <section class="repository-latest-commit" aria-label="Latest commit">
    <div class="latest-commit-row">
      <div v-if="external" class="latest-commit-status">
        <span class="i-carbon-launch" aria-hidden="true" />
        Commit history is available on the source repository.
      </div>
      <div
        v-else-if="resource.loading.value"
        class="latest-commit-status"
        role="status"
      >
        <span class="i-carbon-renew animate-spin" aria-hidden="true" />
        Loading latest commit...
      </div>
      <div v-else-if="resource.failed.value" class="latest-commit-status">
        Latest commit
      </div>
      <template v-else-if="commit">
        <div class="latest-commit-summary">
          <RouterLink
            v-if="commit.author"
            :to="`/${commit.author}`"
            class="latest-commit-author"
          >
            <EntityAvatar :username="commit.author" :size="24" />
            <span>{{ commit.author }}</span>
          </RouterLink>
          <div class="latest-commit-message">
            <RouterLink
              :to="commitPath"
              class="latest-commit-title"
              :title="commit.title"
              >{{ commit.title || commit.id.slice(0, 7) }}</RouterLink
            >
            <RouterLink :to="commitPath" class="latest-commit-sha">{{
              commit.id.slice(0, 7)
            }}</RouterLink>
          </div>
        </div>
      </template>
      <div v-else class="latest-commit-status">No commits yet</div>

      <div class="latest-commit-details">
        <template v-if="!external && resource.ready.value && commit">
          <span class="latest-commit-date">
            {{ formatRelativeTime(commit.date, "Unknown date") }}
          </span>
        </template>
      </div>
    </div>
    <ErrorState
      v-if="!external && resource.failed.value"
      :error="resource.error.value"
      :context="errorContext('latest commit')"
      :retry="resource.reload"
      :retrying="resource.retrying.value"
      mode="inline-panel"
    />
  </section>
</template>

<style scoped>
.repository-latest-commit {
  padding: 12px;
  background: var(--site-hover);
  border-radius: 8px 8px 0 0;
  font-size: 13px;
}
.latest-commit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.latest-commit-summary,
.latest-commit-message,
.latest-commit-author,
.latest-commit-status,
.latest-commit-details {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.latest-commit-summary {
  flex: 1;
}
.latest-commit-author {
  max-width: 160px;
  flex-shrink: 0;
  font-weight: 600;
}
.latest-commit-author span,
.latest-commit-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latest-commit-title {
  color: var(--site-card-text);
}
.latest-commit-details {
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 12px;
  white-space: nowrap;
}
.latest-commit-date,
.latest-commit-status {
  color: var(--site-muted);
}
.latest-commit-sha {
  flex-shrink: 0;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  color: var(--site-link);
}
a:hover {
  color: var(--site-link);
  text-decoration: underline;
}
@media (max-width: 767px) {
  .latest-commit-row {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .latest-commit-summary {
    flex-wrap: wrap;
  }
  .latest-commit-message {
    flex-basis: 100%;
  }
}
</style>
