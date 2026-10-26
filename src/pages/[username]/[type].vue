<!-- src/pages/[username]/[type].vue -->
<template>
  <div class="container-main">
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-20">
      <div
        class="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-600 mb-4"
      ></div>
      <p class="text-xl text-gray-600 dark:text-gray-400">
        Loading repositories...
      </p>
    </div>

    <!-- User Not Found -->
    <div v-else-if="userNotFound" class="text-center py-20">
      <div
        class="i-carbon-user-avatar-filled text-8xl text-gray-300 dark:text-gray-600 mb-6 inline-block"
      />
      <h1 class="text-4xl font-bold mb-4">User Not Found</h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 mb-8">
        The user "<span class="font-mono text-blue-600 dark:text-blue-400">{{
          username
        }}</span
        >" does not exist.
      </p>
      <el-button type="primary" @click="$router.push('/')">
        <div class="i-carbon-home mr-2" />
        Go to Homepage
      </el-button>
    </div>

    <div v-else class="grid grid-cols-[280px_1fr] gap-6">
      <!-- Sidebar -->
      <aside class="space-y-4">
        <div class="card">
          <div class="flex items-center gap-3 mb-4">
            <div class="i-carbon-user-avatar text-5xl text-gray-400" />
            <div>
              <h2 class="text-xl font-bold">{{ username }}</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400">User</p>
            </div>
          </div>

          <div class="space-y-2 text-sm">
            <div
              class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
            >
              <div class="i-carbon-calendar" />
              Joined {{ formatDate(userInfo?.created_at) }}
            </div>
          </div>
        </div>

        <!-- Stats Summary / Tab Navigation -->
        <div class="card">
          <h3 class="font-semibold mb-3">Repositories</h3>
          <div class="space-y-1">
            <RouterLink
              :to="`/${username}`"
              :class="[
                'flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors block',
                !currentType
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-grid text-gray-500 dark:text-gray-400" />
                <span :class="!currentType ? 'font-semibold' : ''"
                  >Overview</span
                >
              </div>
            </RouterLink>

            <RouterLink
              :to="`/${username}/models`"
              :class="[
                'flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors block',
                currentType === 'models'
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-model text-blue-500" />
                <span
                  :class="
                    currentType === 'models'
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : ''
                  "
                  >Models</span
                >
              </div>
              <span
                :class="[
                  'text-sm font-semibold',
                  currentType === 'models'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400',
                ]"
              >
                {{ getCount("model") }}
              </span>
            </RouterLink>

            <RouterLink
              :to="`/${username}/datasets`"
              :class="[
                'flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors block',
                currentType === 'datasets'
                  ? 'bg-green-50 dark:bg-green-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-data-table text-green-500" />
                <span
                  :class="
                    currentType === 'datasets'
                      ? 'font-semibold text-green-700 dark:text-green-400'
                      : ''
                  "
                  >Datasets</span
                >
              </div>
              <span
                :class="[
                  'text-sm font-semibold',
                  currentType === 'datasets'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-gray-600 dark:text-gray-400',
                ]"
              >
                {{ getCount("dataset") }}
              </span>
            </RouterLink>

            <RouterLink
              :to="`/${username}/spaces`"
              :class="[
                'flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors block',
                currentType === 'spaces'
                  ? 'bg-purple-50 dark:bg-purple-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-application text-purple-500" />
                <span
                  :class="
                    currentType === 'spaces'
                      ? 'font-semibold text-purple-600 dark:text-purple-400'
                      : ''
                  "
                  >Spaces</span
                >
              </div>
              <span
                :class="[
                  'text-sm font-semibold',
                  currentType === 'spaces'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-gray-600 dark:text-gray-400',
                ]"
              >
                {{ getCount("space") }}
              </span>
            </RouterLink>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main>
        <!-- The profile could not be looked up: say so, and keep the rest -->
        <ErrorState
          v-if="profileError"
          :error="profileError"
          :context="errorContext('user')"
          mode="inline-panel"
          :retrying="lookupRetrying"
          :retry="reloadLookup"
        />

        <!-- The repositories could not be listed: say so, not "no repositories" -->
        <ErrorState
          v-if="reposError"
          :error="reposError"
          :context="errorContext('repositories')"
          mode="inline-panel"
          :retry="loadRepos"
        />

        <!-- A source was left out: the lists are right, but not everything -->
        <IncompleteNotice v-if="!reposError" :sources="incompleteSources" />

        <!-- Models Tab -->
        <div v-if="!reposError && repoType === 'model'">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="i-carbon-model text-blue-500 text-3xl" />
              <h1 class="text-3xl font-bold">All Models</h1>
              <el-tag type="info" size="large">{{ getCount("model") }}</el-tag>
            </div>

            <div class="flex gap-3">
              <el-select
                aria-label="Sort models"
                v-model="selectedSort"
                placeholder="Sort by"
                style="width: 200px"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>

              <el-input
                aria-label="Search models"
                v-model="searchQuery"
                placeholder="Search models..."
                style="width: 300px"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <div v-if="filteredRepos.length > 0" class="grid grid-cols-2 gap-4">
            <ProfileRepoCard
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="model"
            />
          </div>

          <div
            v-else
            class="text-center py-20 text-gray-500 dark:text-gray-400"
          >
            <div class="i-carbon-search text-6xl mb-4 inline-block" />
            <p>No models found</p>
          </div>
        </div>

        <!-- Datasets Tab -->
        <div v-if="!reposError && repoType === 'dataset'">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="i-carbon-data-table text-green-500 text-3xl" />
              <h1 class="text-3xl font-bold">All Datasets</h1>
              <el-tag type="success" size="large">{{
                getCount("dataset")
              }}</el-tag>
            </div>

            <div class="flex gap-3">
              <el-select
                aria-label="Sort datasets"
                v-model="selectedSort"
                placeholder="Sort by"
                style="width: 200px"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>

              <el-input
                aria-label="Search datasets"
                v-model="searchQuery"
                placeholder="Search datasets..."
                style="width: 300px"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <div v-if="filteredRepos.length > 0" class="grid grid-cols-2 gap-4">
            <ProfileRepoCard
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="dataset"
            />
          </div>

          <div
            v-else
            class="text-center py-20 text-gray-500 dark:text-gray-400"
          >
            <div class="i-carbon-search text-6xl mb-4 inline-block" />
            <p>No datasets found</p>
          </div>
        </div>

        <!-- Spaces Tab -->
        <div v-if="!reposError && repoType === 'space'">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="i-carbon-application text-purple-500 text-3xl" />
              <h1 class="text-3xl font-bold">All Spaces</h1>
              <el-tag type="warning" size="large">{{
                getCount("space")
              }}</el-tag>
            </div>

            <div class="flex gap-3">
              <el-select
                aria-label="Sort spaces"
                v-model="selectedSort"
                placeholder="Sort by"
                style="width: 200px"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>

              <el-input
                aria-label="Search spaces"
                v-model="searchQuery"
                placeholder="Search spaces..."
                style="width: 300px"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <div v-if="filteredRepos.length > 0" class="grid grid-cols-2 gap-4">
            <ProfileRepoCard
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="space"
            />
          </div>

          <div
            v-else
            class="text-center py-20 text-gray-500 dark:text-gray-400"
          >
            <div class="i-carbon-search text-6xl mb-4 inline-block" />
            <p>No spaces found</p>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { repoAPI, orgAPI } from "@/utils/api";
import ProfileRepoCard from "@/components/profile/ProfileRepoCard.vue";
import axios from "axios";
import ErrorState from "@/components/common/ErrorState.vue";
import IncompleteNotice from "@/components/common/IncompleteNotice.vue";
import { useIncompleteSources } from "@/composables/useIncompleteSources";
import { KIND, decodeError } from "@/errors";
import { useErrorContext } from "@/composables/useErrorContext";
import { formatRelativeTime } from "@/utils/datetime";
import {
  getRepoSortPreference,
  setRepoSortPreference,
} from "@/utils/repoSortPreference";

const route = useRoute();
const router = useRouter();

const username = computed(() => route.params.username);
const currentType = computed(() => route.params.type); // 'models', 'datasets', or 'spaces'

const loading = ref(true);
// Why the profile / the repository lists could not be loaded (AppError)
const errorContext = useErrorContext();
const profileError = ref(null);
const lookupRetrying = ref(false);
const reposError = ref(null);
const { sources: incompleteSources, record: recordIncomplete } =
  useIncompleteSources();
const userNotFound = ref(false);
const userInfo = ref(null);
const repos = ref({ model: [], dataset: [], space: [] });
const searchQuery = ref("");

// Map route type to API type
const repoType = computed(() => {
  if (currentType.value === "models") return "model";
  if (currentType.value === "datasets") return "dataset";
  if (currentType.value === "spaces") return "space";
  return "model";
});

const selectedSort = ref(
  getRepoSortPreference({
    scope: "user",
    repoType: repoType.value,
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
);

const sortOptions = [
  { label: "Recently Created", value: "recent" },
  { label: "Recently Updated", value: "updated" },
  { label: "Most Downloads", value: "downloads" },
  { label: "Most Likes", value: "likes" },
];

const filteredRepos = computed(() => {
  const query = searchQuery.value.toLowerCase();
  const allRepos = repos.value[repoType.value] || [];

  if (!query) return allRepos;

  return allRepos.filter(
    (repo) =>
      repo.id.toLowerCase().includes(query) ||
      repo.author?.toLowerCase().includes(query) ||
      repo.tags?.some((tag) => tag.toLowerCase().includes(query)),
  );
});

function getCount(type) {
  return repos.value[type]?.length || 0;
}

function formatDate(date) {
  return formatRelativeTime(date, "never");
}

async function checkIfOrganization() {
  try {
    // Only check local org (no fallback)
    await axios.get(`/org/${username.value}`, {
      params: { fallback: false },
    });
    // Found local org - redirect
    router.replace(`/organizations/${username.value}/${currentType.value}`);
    return true;
  } catch (err) {
    // Not a local org - continue as user
    return false;
  }
}

async function checkUserExists() {
  try {
    // Check if user exists by calling profile endpoint (WITH fallback to check all sources)
    const { data } = await axios.get(`/api/users/${username.value}/profile`, {
      params: { fallback: true },
    });
    userInfo.value = data;
    return true;
  } catch (err) {
    if (err.response?.status === 404) {
      // User doesn't exist in local or any fallback source
      userNotFound.value = true;
      return false;
    }
    // Anything else (network, server): say what happened, but do not stop the page
    console.error("Failed to check user existence:", err);
    const decoded = decodeError(err);
    // the page is still worth showing: only this part is missing
    if (decoded.kind !== KIND.CANCELLED) profileError.value = decoded;
    return true;
  }
}

async function loadRepos() {
  reposError.value = null;
  try {
    const [models, datasets, spaces] = await Promise.all([
      repoAPI.listAllRepos("model", {
        author: username.value,
        sort:
          repoType.value === "model"
            ? selectedSort.value
            : getRepoSortPreference({
                scope: "user",
                repoType: "model",
                allowedValues: ["recent", "updated", "downloads", "likes"],
                fallback: "recent",
              }),
      }),
      repoAPI.listAllRepos("dataset", {
        author: username.value,
        sort:
          repoType.value === "dataset"
            ? selectedSort.value
            : getRepoSortPreference({
                scope: "user",
                repoType: "dataset",
                allowedValues: ["recent", "updated", "downloads", "likes"],
                fallback: "recent",
              }),
      }),
      repoAPI.listAllRepos("space", {
        author: username.value,
        sort:
          repoType.value === "space"
            ? selectedSort.value
            : getRepoSortPreference({
                scope: "user",
                repoType: "space",
                allowedValues: ["recent", "updated", "downloads", "likes"],
                fallback: "recent",
              }),
      }),
    ]);

    recordIncomplete("model", models.incomplete);
    recordIncomplete("dataset", datasets.incomplete);
    recordIncomplete("space", spaces.incomplete);
    repos.value = {
      model: models.data,
      dataset: datasets.data,
      space: spaces.data,
    };
  } catch (err) {
    console.error("Failed to load repos:", err);
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) reposError.value = decoded;
  }
}

// Reload when sort changes
watch(selectedSort, () => {
  setRepoSortPreference({
    scope: "user",
    repoType: repoType.value,
    value: selectedSort.value,
  });

  if (!loading.value && !userNotFound.value) {
    loadRepos();
  }
});

// Reset search when type changes
watch(currentType, () => {
  searchQuery.value = "";
});

watch(repoType, (type) => {
  selectedSort.value = getRepoSortPreference({
    scope: "user",
    repoType: type,
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  });
});

async function reloadLookup() {
  lookupRetrying.value = true;
  profileError.value = null;
  try {
    await checkUserExists();
  } finally {
    lookupRetrying.value = false;
  }
}

async function load() {
  try {
    loading.value = true;
    profileError.value = null;
    userNotFound.value = false;

    // Validate type parameter (must be models, datasets, or spaces)
    if (!["models", "datasets", "spaces"].includes(currentType.value)) {
      // Invalid type - redirect to user index page
      router.replace(`/${username.value}`);
      return;
    }

    // Check if this is actually a local organization
    const isOrg = await checkIfOrganization();
    if (isOrg) return; // Already redirected

    // Check if user exists (loads profile with fallback=true)
    const userExists = await checkUserExists();
    if (!userExists) {
      // userNotFound already set to true
      return;
    }

    // User exists - load repos
    await loadRepos();
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
