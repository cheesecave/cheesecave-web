<script setup>
import { computed } from "vue";
import LinkButton from "@/components/common/LinkButton.vue";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { describeError } from "@/errors";
import { repoAPI } from "@/utils/api";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, required: true },
  external: { type: Boolean, default: false },
  sourceUrl: { type: String, default: null },
});

const errorContext = useErrorContext();
const resource = useAsyncResource(
  async ({ signal }) => {
    if (props.external) return null;
    const { data } = await repoAPI.getCommitCount(
      props.repoType,
      props.namespace,
      props.name,
      props.branch,
      { signal },
    );
    if (!Number.isSafeInteger(data?.count) || data.count < 0) {
      throw new Error("Invalid commit count response");
    }
    return data.count;
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
const historyPath = computed(
  () =>
    `/${props.repoType}s/${props.namespace}/${props.name}/commits/${encodeURIComponent(props.branch)}`,
);
const label = computed(() =>
  !props.external && resource.ready.value
    ? `History: ${resource.data.value} ${resource.data.value === 1 ? "commit" : "commits"}`
    : "History",
);
const errorTitle = computed(() =>
  resource.error.value
    ? describeError(resource.error.value, errorContext("commit count"))?.title
    : undefined,
);
</script>

<template>
  <div class="repository-files-history">
    <LinkButton
      v-if="!external"
      :to="historyPath"
      class="repository-history-link"
    >
      <span class="i-carbon-time" aria-hidden="true" /> {{ label }}
    </LinkButton>
    <a
      v-else-if="sourceUrl"
      :href="sourceUrl"
      class="repository-history-link el-button"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="i-carbon-time" aria-hidden="true" /> History
      <span class="i-carbon-launch" aria-hidden="true" />
    </a>
    <span v-else class="repository-history-link" aria-disabled="true">
      <span class="i-carbon-time" aria-hidden="true" /> History
    </span>
    <button
      v-if="!external && resource.failed.value"
      type="button"
      class="repository-history-retry"
      aria-label="Retry commit count"
      :title="errorTitle"
      @click="resource.reload"
    >
      <span class="i-carbon-renew" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.repository-files-history {
  display: flex;
  align-items: center;
  gap: 6px;
}
.repository-history-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 0 auto;
  gap: 6px;
  height: 34px;
  margin: 0;
  padding: 7px 12px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
  color: var(--site-card-text);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
}
.repository-history-link :deep(> span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.repository-history-link:hover {
  background: var(--site-hover);
}
.repository-history-link[aria-disabled="true"] {
  color: var(--site-muted);
}
.repository-history-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
  color: var(--site-muted);
  cursor: pointer;
}
.repository-history-retry:hover {
  background: var(--site-hover);
}
</style>
