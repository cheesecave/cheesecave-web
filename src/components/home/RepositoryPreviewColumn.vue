<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router/auto";
import RepoDiscoveryCard from "@/components/discovery/RepoDiscoveryCard.vue";
import { getRepositoryType } from "@/utils/repository-types";

const props = defineProps({
  repoType: { type: String, required: true },
  repositories: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
});
const router = useRouter();
const category = computed(() => getRepositoryType(props.repoType));
</script>

<template>
  <section class="repository-preview-column" :aria-label="category.plural">
    <div class="discovery-column-heading">
      <div class="column-title">
        <span
          :class="[category.icon, `discovery-${repoType}-icon`]"
          aria-hidden="true"
        />
        <h3>{{ category.plural }}</h3>
      </div>
      <el-tag :type="category.tagType" size="large">{{ total }}</el-tag>
    </div>
    <div class="preview-repositories">
      <RepoDiscoveryCard
        v-for="repo in repositories"
        :key="repo.id"
        :repo="repo"
        :repo-type="repoType"
        class="discovery-repo-link"
      />
      <el-button class="w-full" @click="router.push(`/${repoType}s`)">
        View all {{ category.plural.toLowerCase() }} →
      </el-button>
    </div>
  </section>
</template>

<style scoped>
.discovery-column-heading,
.column-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.discovery-column-heading {
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--site-border, #d9d9d2);
}
.column-title > span {
  width: 24px;
  height: 24px;
}
.column-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.preview-repositories {
  display: grid;
  gap: 12px;
}
.discovery-model-icon {
  color: #54737a;
}
.discovery-dataset-icon {
  color: #66794b;
}
.discovery-space-icon {
  color: #85708c;
}
.dark .discovery-model-icon {
  color: #a0b8bb;
}
.dark .discovery-dataset-icon {
  color: #abbe8f;
}
.dark .discovery-space-icon {
  color: #c3a7ce;
}
</style>
