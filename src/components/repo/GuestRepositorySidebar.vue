<script setup>
import { computed } from "vue";
import SidebarRelationshipsCard from "./metadata/SidebarRelationshipsCard.vue";
import { getRepositoryType } from "@/utils/repository-types";
import { formatRelativeTime } from "@/utils/datetime";
const props = defineProps({
  repository: { type: Object, required: true },
  overview: { type: Object, default: null },
  metadata: { type: Object, default: () => ({}) },
});
const typeLabel = computed(
  () => getRepositoryType(props.repository.type).plural,
);
const namespaceLink = computed(
  () => `/${encodeURIComponent(props.repository.namespace)}`,
);
const createdBy = computed(() => {
  const username = props.overview?.created_by;
  return typeof username === "string" && /^[\w-][\w.-]{0,127}$/.test(username)
    ? { username }
    : null;
});
const formatSize = (size) => {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1000) return `${size} B`;
  if (size < 1000000) return `${(size / 1000).toFixed(1)} KB`;
  if (size < 1000000000) return `${(size / 1000000).toFixed(1)} MB`;
  return `${(size / 1000000000).toFixed(1)} GB`;
};
</script>
<template>
  <aside class="guest-repository-sidebar" aria-label="Repository information">
    <SidebarRelationshipsCard
      :namespace="repository.namespace"
      :namespace-link="namespaceLink"
      :repo-type="repository.type"
      :metadata="metadata"
      :created-by="createdBy"
    />
    <div class="card" aria-label="Repository info">
      <h3 class="font-semibold mb-3">Info</h3>
      <dl class="guest-info-list">
        <dt>Type:</dt>
        <dd>{{ typeLabel }}</dd>
        <dt>Downloads:</dt>
        <dd>{{ overview?.downloads ?? "—" }}</dd>
        <dt>Created:</dt>
        <dd>{{ formatRelativeTime(overview?.created_at, "—") }}</dd>
        <dt>Updated:</dt>
        <dd>{{ formatRelativeTime(overview?.last_modified, "—") }}</dd>
        <dt>Commit:</dt>
        <dd class="font-mono">{{ overview?.head?.slice(0, 7) || "—" }}</dd>
        <template v-if="overview?.file_count != null"
          ><dt>Files:</dt>
          <dd>{{ overview.file_count }}</dd></template
        >
      </dl>
    </div>
    <div class="card">
      <h3 class="font-semibold mb-3">Storage</h3>
      <dl class="guest-info-list">
        <dt>Usage:</dt>
        <dd>{{ formatSize(overview?.used_storage) }}</dd>
      </dl>
    </div>
  </aside>
</template>
<style scoped>
.guest-repository-sidebar {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
}
.guest-info-list {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 14px;
}
.guest-info-list dt {
  color: var(--site-muted);
}
.guest-info-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
