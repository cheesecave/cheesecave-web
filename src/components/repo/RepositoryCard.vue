<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import RepositoryStats from "./RepositoryStats.vue";
import { facetLabel } from "@/utils/repo-discovery";
import { getRepositoryType, isRepositoryType } from "@/utils/repository-types";
import { buildRepositoryPath } from "@/utils/repo-paths";

const props = defineProps({
  repo: { type: Object, required: true },
  showStats: { type: Boolean, default: true },
  repoType: {
    type: String,
    default: "model",
    validator: isRepositoryType,
  },
});
const repositoryType = computed(() => getRepositoryType(props.repoType));
const repoPath = computed(() =>
  buildRepositoryPath(props.repoType, props.repo.id),
);
function firstText(...values) {
  for (const value of values) {
    const result = (Array.isArray(value) ? value : [value]).find(
      (item) => typeof item === "string" && item.trim(),
    );
    if (result) return result;
  }
  return "";
}
const metadata = computed(() => {
  const fields = props.repo.metadata || {};
  const facets = props.repo.facets || {};
  return [
    {
      key: "task",
      label: firstText(
        facets.task,
        facets.tasks,
        fields.task,
        fields.pipeline_tag,
        fields.task_categories,
      ),
    },
    {
      key: "library",
      label: firstText(
        facets.library,
        facets.libraries,
        fields.library,
        fields.library_name,
        fields.framework,
      ),
    },
    {
      key: "license",
      label: firstText(facets.license, facets.licenses, fields.license),
    },
    {
      key: "sdk",
      label:
        props.repoType === "space" ? firstText(facets.sdk, fields.sdk) : "",
    },
  ]
    .filter((item) => item.label)
    .map((item) => ({ ...item, label: facetLabel(item.key, item.label) }));
});
</script>

<template>
  <RouterLink :to="repoPath" class="repository-card">
    <div class="repo-card-heading">
      <span
        :class="repositoryType.icon"
        class="repo-type-icon"
        aria-hidden="true"
      />
      <h3 :title="repo.id">{{ repo.id }}</h3>
      <span v-if="repo.private" class="repo-private"
        ><span class="i-carbon-locked" aria-hidden="true" />Private</span
      >
    </div>
    <div v-if="metadata.length" class="repo-card-metadata">
      <span
        v-for="item in metadata"
        :key="item.key"
        :title="`${item.key}: ${item.label}`"
        >{{ item.label }}</span
      >
    </div>
    <RepositoryStats
      v-if="showStats"
      :repo="repo"
      show-updated
      class="repo-card-stats"
    />
  </RouterLink>
</template>

<style scoped>
.repository-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--site-border, #dedfd4);
  border-radius: var(--site-card-radius, 12px);
  box-shadow: var(--site-card-shadow, 0 1px 3px #0000000d);
  background: var(--site-card, #fffdf7);
  color: var(--site-card-text, #2c332b);
  text-decoration: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.repository-card:hover {
  color: var(--site-card-text, #2c332b);
  border-color: var(--site-primary, #c28b37);
  box-shadow: var(--site-card-hover-shadow, 0 3px 12px #00000014);
}
.repository-card:focus-visible {
  outline: 2px solid var(--site-primary, #c28b37);
  outline-offset: 3px;
}
.repo-card-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.repo-type-icon {
  color: var(--site-link, #94621f);
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}
.repo-card-heading h3 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.6;
  font-weight: 600;
}
.repo-private {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  border: 1px solid var(--site-border, #dedfd4);
  border-radius: 5px;
  padding: 1px 4px;
  color: var(--site-muted, #6b7068);
  font-size: 9px;
}
.repo-card-metadata {
  display: flex;
  gap: 7px;
  min-width: 0;
  color: var(--site-muted, #6b7068);
  font-size: 11px;
}
.repo-card-metadata span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-card-metadata span + span {
  border-left: 1px solid var(--site-border, #dedfd4);
  padding-left: 7px;
}
.repo-card-stats {
  margin-top: auto;
}
@media (max-width: 400px) {
  .repository-card {
    padding: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .repository-card {
    transition: none;
  }
}
</style>
