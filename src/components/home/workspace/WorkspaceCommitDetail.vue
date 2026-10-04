<script setup>
import { computed } from "vue";
import { buildRepositoryPath } from "@/utils/repo-paths";
const props = defineProps({
  repository: { type: Object, required: true },
  commit: { type: Object, required: true },
});
const commitPath = computed(
  () =>
    `${buildRepositoryPath(props.repository.type, props.repository.id)}/commit/${encodeURIComponent(props.commit.sha)}`,
);
</script>
<template>
  <div class="commit-detail">
    <p>{{ commit.message || "Commit" }}</p>
    <RouterLink
      :to="commitPath"
      class="commit-link"
      :aria-label="`View commit ${commit.sha}`"
      >{{ commit.sha.slice(0, 7) }}</RouterLink
    >
  </div>
</template>
<style scoped>
.commit-detail {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--ws-muted);
}
.commit-detail p {
  margin: 0;
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.commit-link {
  flex-shrink: 0;
  color: var(--ws-link);
  font-family: monospace;
  font-size: 11px;
}
</style>
