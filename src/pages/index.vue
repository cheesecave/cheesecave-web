<!-- src/pages/index.vue -->
<template>
  <div :class="{ 'workspace-home': isAuthenticated }">
    <WorkspacePanel v-if="isAuthenticated" />
    <HomepageHero v-else :config="homepage" full-screen />
    <!-- Recent Repos - Three Columns -->
    <div
      v-if="!isAuthenticated && homepage.show_repositories"
      class="container-main discovery-section py-8"
    >
      <div class="flex flex-col gap-4 mb-6 md:mb-8 md:flex-row md:items-center">
        <h2 class="text-2xl md:text-3xl font-bold">
          {{ repoSectionTitle }}
        </h2>

        <div class="w-full md:w-80 md:ml-auto md:flex-none">
          <el-select
            v-model="selectedSort"
            placeholder="Sort repositories"
            class="w-full"
          >
            <el-option
              v-for="sort in REPOSITORY_SORTS"
              :key="sort.value"
              :label="sort.label"
              :value="sort.value"
            />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <RepositoryPreviewColumn
          v-for="category in REPOSITORY_TYPES"
          :key="category.type"
          :repo-type="category.type"
          :repositories="repositoryPreviews[category.type] || []"
          :total="stats[`${category.type}s`] || 0"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import HomepageHero from "../shared/components/HomepageHero.vue";
import WorkspacePanel from "@/components/home/WorkspacePanel.vue";
import { DEFAULT_HOMEPAGE, fetchHomepage } from "../shared/site-homepage.js";
import { repoAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import RepositoryPreviewColumn from "@/components/home/RepositoryPreviewColumn.vue";
import { REPOSITORY_TYPES } from "@/utils/repository-types";
import {
  REPOSITORY_SORTS,
  REPOSITORY_SORT_VALUES,
  getRepositorySort,
} from "@/utils/repository-sorts";
import {
  getRepoSortPreference,
  setRepoSortPreference,
} from "@/utils/repoSortPreference";
import { ElMessage } from "element-plus";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isAuthenticated, username } = storeToRefs(authStore);

const homepage = ref({ ...DEFAULT_HOMEPAGE });
const homepageController = new AbortController();
onBeforeUnmount(() => homepageController.abort());

const stats = ref({ models: 0, datasets: 0, spaces: 0 });
const repositoryPreviews = ref({});
let discoveryVersion = 0;
const homepageLoaded = ref(false);
const selectedSort = ref(
  getRepoSortPreference({
    scope: "home",
    repoType: "all",
    allowedValues: REPOSITORY_SORT_VALUES,
    fallback: "trending",
  }),
);

const repoSectionTitle = computed(
  () => getRepositorySort(selectedSort.value).homepageTitle,
);

async function loadStats() {
  const version = ++discoveryVersion;
  try {
    const results = await Promise.all(
      REPOSITORY_TYPES.map(({ type }) =>
        repoAPI.listRepos(type, {
          limit: 100,
          sort: selectedSort.value,
          fallback: false,
        }),
      ),
    );

    if (version !== discoveryVersion || homepageController.signal.aborted)
      return;
    stats.value = Object.fromEntries(
      REPOSITORY_TYPES.map(({ type }, index) => [
        `${type}s`,
        results[index].data.length,
      ]),
    );
    repositoryPreviews.value = Object.fromEntries(
      REPOSITORY_TYPES.map(({ type }, index) => [
        type,
        results[index].data.slice(0, 3),
      ]),
    );
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

watch(selectedSort, () => {
  setRepoSortPreference({
    scope: "home",
    repoType: "all",
    value: selectedSort.value,
  });
  if (!isAuthenticated.value && homepage.value.show_repositories) loadStats();
});

watch(username, () => {
  ++discoveryVersion;
  repositoryPreviews.value = {};
  stats.value = { models: 0, datasets: 0, spaces: 0 };
  if (
    homepageLoaded.value &&
    !isAuthenticated.value &&
    homepage.value.show_repositories
  )
    loadStats();
});

onMounted(async () => {
  // Check for verification error messages in query params
  if (route.query.error) {
    const errorType = route.query.error;
    const message = route.query.message || "An error occurred";

    if (errorType === "invalid_token") {
      ElMessage.error(decodeURIComponent(message));
      // Clean up URL
      router.replace("/");
    } else if (errorType === "user_not_found") {
      ElMessage.error("User account not found");
      router.replace("/");
    }
  }

  try {
    homepage.value = await fetchHomepage({ signal: homepageController.signal });
  } catch {
    // Bundled defaults keep the page usable when configuration is unavailable.
  }
  homepageLoaded.value = true;
  if (
    !homepageController.signal.aborted &&
    !isAuthenticated.value &&
    homepage.value.show_repositories
  )
    loadStats();
});
</script>

<style scoped>
.workspace-home {
  min-height: calc(100dvh - var(--site-header-height, 64px));
}
.discovery-section {
  padding-bottom: 48px;
}
.discovery-section h2 {
  font-size: 24px;
  letter-spacing: -0.025em;
}
@media (max-width: 700px) {
  .discovery-section h2 {
    font-size: 20px;
  }
}
</style>
