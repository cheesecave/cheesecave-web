<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { repoAPI } from "@/utils/api";
import { formatRelativeTime } from "@/utils/datetime";
import { buildRepositoryPath } from "@/utils/repo-paths";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, required: true },
  path: { type: String, required: true },
});
const errorContext = useErrorContext();
const resource = useAsyncResource(
  async () => {
    const path = props.path;
    const { data } = await repoAPI.getPathsInfo(
      props.repoType,
      props.namespace,
      props.name,
      encodeURIComponent(props.branch),
      [path],
      true,
    );
    const entry = data?.find(
      (item) => item.type === "file" && item.path === path,
    );
    const lastCommit = entry?.lastCommit;
    return typeof lastCommit?.id === "string" && lastCommit.id
      ? lastCommit
      : null;
  },
  {
    autoRetry: false,
    watch: [
      () => props.repoType,
      () => props.namespace,
      () => props.name,
      () => props.branch,
      () => props.path,
    ],
  },
);
const commit = computed(() => resource.data.value);
// HF paths-info omits the author. Enrich the exact file commit independently
// so a slow detail request never hides the title, SHA, or date already loaded.
const authorResource = useAsyncResource(
  async ({ signal }) => {
    if (!resource.ready.value || !commit.value || commit.value.author)
      return null;
    const id = commit.value.id;
    const { data } = await repoAPI.getCommitDetail(
      props.repoType,
      props.namespace,
      props.name,
      id,
      { signal },
    );
    return { id, author: typeof data?.author === "string" ? data.author : "" };
  },
  {
    autoRetry: false,
    watch: [
      () => props.repoType,
      () => props.namespace,
      () => props.name,
      () => props.branch,
      () => props.path,
      () => resource.status.value,
      () => commit.value?.id,
    ],
  },
);
const author = computed(() => {
  if (!resource.ready.value) return "";
  if (typeof commit.value?.author === "string") return commit.value.author;
  return authorResource.ready.value &&
    authorResource.data.value?.id === commit.value?.id
    ? authorResource.data.value.author
    : "";
});
const repoPath = computed(() =>
  buildRepositoryPath(props.repoType, `${props.namespace}/${props.name}`),
);
const commitPath = computed(
  () =>
    `${repoPath.value}/commit/${encodeURIComponent(commit.value?.id || "")}${props.branch === "main" ? "" : `?branch=${encodeURIComponent(props.branch)}`}`,
);
const historyPath = computed(
  () => `${repoPath.value}/commits/${encodeURIComponent(props.branch)}`,
);
</script>

<template>
  <section class="repository-file-commit" aria-label="Latest file commit">
    <div class="file-commit-row">
      <div
        v-if="resource.loading.value"
        class="file-commit-status"
        role="status"
      >
        <span class="i-carbon-renew animate-spin" aria-hidden="true" />
        Loading file commit...
      </div>
      <div v-else-if="resource.failed.value" class="file-commit-status">
        File commit unavailable
      </div>
      <div v-else-if="commit" class="file-commit-summary">
        <RouterLink
          v-if="author"
          :to="`/${encodeURIComponent(author)}`"
          class="file-commit-author"
        >
          <EntityAvatar :username="author" :size="24" />
          <span>{{ author }}</span>
        </RouterLink>
        <RouterLink
          :to="commitPath"
          class="file-commit-title"
          :title="commit.title"
        >
          {{ commit.title || commit.id.slice(0, 7) }}
        </RouterLink>
      </div>
      <div v-else class="file-commit-status">No commit information</div>

      <div class="file-commit-details">
        <template v-if="resource.ready.value && commit">
          <RouterLink :to="commitPath" class="file-commit-sha">{{
            commit.id.slice(0, 7)
          }}</RouterLink>
          <span class="file-commit-date">{{
            formatRelativeTime(commit.date, "Unknown date")
          }}</span>
        </template>
        <RouterLink
          :to="historyPath"
          class="file-commit-history"
          title="Repository commit history"
        >
          <span class="i-carbon-time" aria-hidden="true" />
          History
        </RouterLink>
      </div>
    </div>
    <ErrorState
      v-if="resource.failed.value"
      :error="resource.error.value"
      :context="errorContext('file commit')"
      :retry="resource.reload"
      :retrying="resource.retrying.value"
      mode="inline-panel"
    />
    <ErrorState
      v-else-if="resource.ready.value && authorResource.failed.value"
      :error="authorResource.error.value"
      :context="errorContext('commit author')"
      :retry="authorResource.reload"
      :retrying="authorResource.retrying.value"
      mode="inline-panel"
    />
  </section>
</template>

<style scoped>
.repository-file-commit {
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  background: var(--site-card);
  color: var(--site-card-text);
  font-size: 13px;
}
.file-commit-row,
.file-commit-summary,
.file-commit-author,
.file-commit-status,
.file-commit-details,
.file-commit-history {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.file-commit-row {
  min-height: 28px;
  justify-content: space-between;
  gap: 16px;
}
.file-commit-summary {
  flex: 1;
}
.file-commit-author {
  flex-shrink: 0;
  max-width: 180px;
  color: var(--site-card-text);
  font-weight: 600;
}
.file-commit-author span,
.file-commit-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-commit-title,
.file-commit-sha {
  color: var(--site-muted);
}
.file-commit-details {
  flex-shrink: 0;
  white-space: nowrap;
}
.file-commit-sha {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.file-commit-date,
.file-commit-status {
  color: var(--site-muted);
}
.file-commit-history {
  margin-left: 8px;
  color: var(--site-card-text);
}
a:hover {
  color: var(--site-link);
  text-decoration: underline;
}
@media (max-width: 767px) {
  .file-commit-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .file-commit-summary {
    flex-basis: 100%;
  }
  .file-commit-details {
    margin-left: auto;
  }
}
</style>
