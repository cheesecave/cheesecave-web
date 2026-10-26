<script setup>
import { computed } from "vue";
import PrivateBadge from "@/components/repo/PrivateBadge.vue";
import RepoChips from "@/components/repo/RepoChips.vue";
import { formatRelativeTime } from "@/utils/datetime";
import { externalRepoUrl } from "@/utils/external-repo";
import { buildRepositoryPath } from "@/utils/repo-paths";

// A repository card for a profile, an organization or their per-type lists. The name is the one
// link and its ::after stretches over the card (see .stretched-link in style.css), so the whole
// card opens in a new tab like any link. The button to another source stays above it.
const props = defineProps({
  repo: { type: Object, required: true },
  type: { type: String, required: true },
});

const ICONS = {
  model: "i-carbon-model text-blue-500",
  dataset: "i-carbon-data-table text-green-500",
  space: "i-carbon-application text-purple-500",
};

const path = computed(() => buildRepositoryPath(props.type, props.repo.id));
const external = computed(
  () => props.repo._source && props.repo._source !== "local",
);

function openExternal() {
  const url = externalRepoUrl(props.repo, props.type);
  if (url) window.open(url, "_blank");
}
</script>

<template>
  <div class="card relative hover:shadow-md transition-shadow">
    <div class="flex items-start gap-2 mb-2">
      <div :class="ICONS[type]" class="text-xl flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold flex items-center gap-2">
          <RouterLink
            :to="path"
            class="stretched-link block text-blue-600 dark:text-blue-400 hover:underline truncate min-w-0"
          >
            {{ repo.id }}
          </RouterLink>
          <PrivateBadge v-if="repo.private" />
        </h3>
        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
          Updated {{ formatRelativeTime(repo.lastModified, "never") }}
        </div>
      </div>
    </div>

    <RepoChips :repo="repo" :type="type" class="mb-2" />

    <div v-if="external" class="mb-2">
      <el-button
        class="stretched-link-above"
        size="small"
        type="primary"
        plain
        @click="openExternal"
      >
        <div class="i-carbon-launch inline-block mr-1" />
        View on {{ repo._source }}
      </el-button>
    </div>

    <div
      class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
    >
      <div class="flex items-center gap-1">
        <div class="i-carbon-download" />
        {{ repo.downloads || 0 }}
      </div>
      <div class="flex items-center gap-1">
        <div class="i-carbon-favorite" />
        {{ repo.likes || 0 }}
      </div>
    </div>
  </div>
</template>
