<script setup>
import { formatRelativeTime } from "@/utils/datetime";
defineProps({ repo: { type: Object, required: true }, showUpdated: Boolean });
const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
function count(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
</script>

<template>
  <div class="repository-stats">
    <span
      v-if="showUpdated && repo.lastModified"
      class="repo-updated"
      :title="String(repo.lastModified)"
    >
      Updated {{ formatRelativeTime(repo.lastModified, "never") }}
    </span>
    <span
      class="repo-stat"
      :aria-label="`${count(repo.downloads).toLocaleString('en')} downloads`"
    >
      <span class="i-carbon-download" aria-hidden="true" />{{
        compactNumber.format(count(repo.downloads))
      }}
    </span>
    <span
      class="repo-stat"
      :aria-label="`${count(repo.likes).toLocaleString('en')} likes`"
    >
      <span class="i-carbon-favorite" aria-hidden="true" />{{
        compactNumber.format(count(repo.likes))
      }}
    </span>
  </div>
</template>

<style scoped>
.repository-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: var(--site-muted, #6b7068);
  font-size: 11px;
}
.repo-updated {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.repo-stat > span {
  width: 12px;
  height: 12px;
}
@media (max-width: 400px) {
  .repository-stats {
    gap: 8px;
    font-size: 10px;
  }
}
</style>
