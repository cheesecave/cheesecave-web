<script setup>
import RepositoryCard from "@/components/repo/RepositoryCard.vue";
import { isRepositoryType } from "@/utils/repository-types";

defineProps({
  repo: { type: Object, required: true },
  repoType: {
    type: String,
    default: "model",
    validator: isRepositoryType,
  },
});
</script>

<template>
  <RepositoryCard
    :repo="repo"
    :repo-type="repoType"
    class="repo-discovery-card"
  />
</template>
