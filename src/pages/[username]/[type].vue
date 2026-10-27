<!-- src/pages/[username]/[type].vue -->
<template>
  <div class="container-main profile-page">
    <!-- User Not Found -->
    <div v-if="userNotFound" class="text-center py-20">
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
      <LinkButton type="primary" to="/">
        <div class="i-carbon-home mr-2" />
        Go to Homepage
      </LinkButton>
    </div>

    <div v-else class="profile-layout">
      <!-- Sidebar -->
      <aside class="min-w-0 space-y-4 lg:self-start">
        <div class="card profile-card">
          <ProfileViewToggle
            v-if="isOwnProfile"
            :visitor-view="visitorView"
            @toggle="toggleVisitorView"
          />
          <div class="profile-identity">
            <EntityAvatar
              :username="username"
              :name="userInfo?.full_name || username"
              :avatar-url="userInfo?.avatar_url"
              :version="userInfo?.avatar_updated_at"
              size="large"
              class="profile-avatar"
              :alt="`${username} avatar`"
            />
            <div class="min-w-0">
              <h2 class="text-2xl font-bold leading-tight">{{ username }}</h2>
              <p class="mt-1 text-base text-gray-600 dark:text-gray-400">
                {{ userInfo?.full_name || "User" }}
              </p>
            </div>
          </div>

          <p
            v-if="profileLoading || (profileMissing && identityLoading)"
            role="status"
            class="mt-4 text-sm text-gray-500 dark:text-gray-400"
          >
            Loading user profile...
          </p>
          <ErrorState
            v-if="
              profileError &&
              (!profileMissing || (!identityLoading && !isOrganization))
            "
            :error="profileError"
            :context="errorContext('user profile')"
            mode="inline-panel"
            :retrying="profileLoading"
            :retry="loadProfile"
          >
            <template v-if="profileMissing" #actions>
              <el-button
                data-testid="error-action-retry"
                :loading="profileLoading"
                @click="loadProfile"
                >Try again</el-button
              >
            </template>
          </ErrorState>
          <ErrorState
            v-if="identityError"
            :error="identityError"
            :context="errorContext('user identity')"
            mode="inline-panel"
            :retrying="identityLoading"
            :retry="reloadIdentity"
          />
          <ProfileOwnerActions
            v-if="localUserReady"
            :username="username"
            :visitor-view="visitorView"
          />

          <div class="space-y-3 text-sm">
            <p
              v-if="userInfo?.bio"
              class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
            >
              {{ userInfo.bio }}
            </p>
            <a
              v-if="userInfo?.website"
              :href="userInfo.website"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2 min-w-0 text-blue-600 dark:text-blue-400 hover:underline"
              title="Website"
            >
              <span class="i-carbon-link shrink-0" aria-hidden="true" />
              <span class="truncate">{{
                userInfo.website.replace(/^https?:\/\//, "")
              }}</span>
            </a>
            <div
              v-if="userInfo?.created_at"
              class="flex items-center gap-2 text-gray-600 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700"
            >
              <div class="i-carbon-calendar" />
              Joined {{ formatDate(userInfo?.created_at) }}
            </div>
          </div>
        </div>

        <!-- Stats Summary / Tab Navigation -->
        <div class="card profile-panel">
          <h3 class="font-semibold mb-3">Repositories</h3>
          <div class="space-y-1">
            <RouterLink
              :to="profileLink(`/${username}`)"
              class="profile-nav-link"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-grid text-gray-500 dark:text-gray-400" />
                <span>Overview</span>
              </div>
            </RouterLink>

            <RouterLink
              :to="profileLink(`/${username}/models`)"
              class="profile-nav-link"
              :class="{ 'profile-nav-link-active': currentType === 'models' }"
              :aria-current="currentType === 'models' ? 'page' : undefined"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-model text-blue-500" />
                <span :class="{ 'font-semibold': currentType === 'models' }"
                  >Models</span
                >
              </div>
              <span
                v-if="repoLoaded.model"
                class="text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                {{ getCount("model") }}
              </span>
            </RouterLink>

            <RouterLink
              :to="profileLink(`/${username}/datasets`)"
              class="profile-nav-link"
              :class="{ 'profile-nav-link-active': currentType === 'datasets' }"
              :aria-current="currentType === 'datasets' ? 'page' : undefined"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-data-table text-green-500" />
                <span :class="{ 'font-semibold': currentType === 'datasets' }"
                  >Datasets</span
                >
              </div>
              <span
                v-if="repoLoaded.dataset"
                class="text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                {{ getCount("dataset") }}
              </span>
            </RouterLink>

            <RouterLink
              :to="profileLink(`/${username}/spaces`)"
              class="profile-nav-link"
              :class="{ 'profile-nav-link-active': currentType === 'spaces' }"
              :aria-current="currentType === 'spaces' ? 'page' : undefined"
            >
              <div class="flex items-center gap-2 text-sm">
                <div class="i-carbon-application text-purple-500" />
                <span :class="{ 'font-semibold': currentType === 'spaces' }"
                  >Spaces</span
                >
              </div>
              <span
                v-if="repoLoaded.space"
                class="text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                {{ getCount("space") }}
              </span>
            </RouterLink>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="min-w-0 profile-repositories">
        <!-- A source was left out: the lists are right, but not everything -->
        <IncompleteNotice :sources="incompleteSources" />

        <!-- Models Tab -->
        <div v-if="repoType === 'model'">
          <div class="profile-section-header">
            <div class="profile-section-title">
              <div
                class="i-carbon-model text-blue-500 text-xl"
                aria-hidden="true"
              />
              <h1>All Models</h1>
              <span v-if="repoLoaded.model" class="profile-count">{{
                getCount("model")
              }}</span>
            </div>

            <div class="profile-list-controls">
              <el-select
                aria-label="Sort models"
                v-model="selectedSort"
                placeholder="Sort by"
                class="profile-sort"
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
                class="profile-search"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <p
            v-if="repoLoading.model"
            role="status"
            class="py-8 text-gray-500 dark:text-gray-400"
          >
            Loading models...
          </p>
          <ErrorState
            v-else-if="repoErrors.model"
            :error="repoErrors.model"
            :context="errorContext('models')"
            mode="inline-panel"
            :retrying="repoLoading.model"
            :retry="() => loadRepoType('model')"
          />
          <div
            v-else-if="filteredRepos.length > 0"
            class="profile-repository-grid"
          >
            <ProfileRepoCard
              class="profile-repo-card"
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="model"
            />
          </div>

          <div
            v-else-if="repoLoaded.model"
            class="text-center py-20 text-gray-500 dark:text-gray-400"
          >
            <div class="i-carbon-search text-6xl mb-4 inline-block" />
            <p>No models found</p>
          </div>
        </div>

        <!-- Datasets Tab -->
        <div v-if="repoType === 'dataset'">
          <div class="profile-section-header">
            <div class="profile-section-title">
              <div
                class="i-carbon-data-table text-green-500 text-xl"
                aria-hidden="true"
              />
              <h1>All Datasets</h1>
              <span v-if="repoLoaded.dataset" class="profile-count">{{
                getCount("dataset")
              }}</span>
            </div>

            <div class="profile-list-controls">
              <el-select
                aria-label="Sort datasets"
                v-model="selectedSort"
                placeholder="Sort by"
                class="profile-sort"
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
                class="profile-search"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <p
            v-if="repoLoading.dataset"
            role="status"
            class="py-8 text-gray-500 dark:text-gray-400"
          >
            Loading datasets...
          </p>
          <ErrorState
            v-else-if="repoErrors.dataset"
            :error="repoErrors.dataset"
            :context="errorContext('datasets')"
            mode="inline-panel"
            :retrying="repoLoading.dataset"
            :retry="() => loadRepoType('dataset')"
          />
          <div
            v-else-if="filteredRepos.length > 0"
            class="profile-repository-grid"
          >
            <ProfileRepoCard
              class="profile-repo-card"
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="dataset"
            />
          </div>

          <div
            v-else-if="repoLoaded.dataset"
            class="text-center py-20 text-gray-500 dark:text-gray-400"
          >
            <div class="i-carbon-search text-6xl mb-4 inline-block" />
            <p>No datasets found</p>
          </div>
        </div>

        <!-- Spaces Tab -->
        <div v-if="repoType === 'space'">
          <div class="profile-section-header">
            <div class="profile-section-title">
              <div
                class="i-carbon-application text-purple-500 text-xl"
                aria-hidden="true"
              />
              <h1>All Spaces</h1>
              <span v-if="repoLoaded.space" class="profile-count">{{
                getCount("space")
              }}</span>
            </div>

            <div class="profile-list-controls">
              <el-select
                aria-label="Sort spaces"
                v-model="selectedSort"
                placeholder="Sort by"
                class="profile-sort"
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
                class="profile-search"
                clearable
              >
                <template #prefix>
                  <div class="i-carbon-search" />
                </template>
              </el-input>
            </div>
          </div>

          <p
            v-if="repoLoading.space"
            role="status"
            class="py-8 text-gray-500 dark:text-gray-400"
          >
            Loading spaces...
          </p>
          <ErrorState
            v-else-if="repoErrors.space"
            :error="repoErrors.space"
            :context="errorContext('spaces')"
            mode="inline-panel"
            :retrying="repoLoading.space"
            :retry="() => loadRepoType('space')"
          />
          <div
            v-else-if="filteredRepos.length > 0"
            class="profile-repository-grid"
          >
            <ProfileRepoCard
              class="profile-repo-card"
              v-for="repo in filteredRepos"
              :key="repo.id"
              :repo="repo"
              type="space"
            />
          </div>

          <div
            v-else-if="repoLoaded.space"
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
import { repoAPI } from "@/utils/api";
import ProfileRepoCard from "@/components/profile/ProfileRepoCard.vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import LinkButton from "@/components/common/LinkButton.vue";
import ProfileOwnerActions from "@/components/profile/ProfileOwnerActions.vue";
import ProfileViewToggle from "@/components/profile/ProfileViewToggle.vue";
import { useProfileView } from "@/composables/useProfileView";
import { useUserProfileIdentity } from "@/composables/useUserProfileIdentity";
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

// Why the profile / the repository lists could not be loaded (AppError)
const errorContext = useErrorContext();
const profileError = ref(null);
const profileLoading = ref(true);
const profileMissing = ref(false);
let profileRequest = 0;
let pageActive = true;
const repoTypes = ["model", "dataset", "space"];
const repoLoading = reactive({ model: true, dataset: true, space: true });
const repoLoaded = reactive({ model: false, dataset: false, space: false });
const repoErrors = reactive({ model: null, dataset: null, space: null });
const repoRequests = { model: 0, dataset: 0, space: 0 };
const { sources: incompleteSources, record: recordIncomplete } =
  useIncompleteSources();
const userInfo = ref(null);
const repos = ref({ model: [], dataset: [], space: [] });
const searchQuery = ref("");
const {
  localUserReady,
  isOrganization,
  identityLoading,
  identityError,
  identityMissing,
  reloadIdentity,
} = useUserProfileIdentity(
  username,
  computed(() => `/organizations/${username.value}/${currentType.value}`),
);
const userNotFound = computed(
  () => profileMissing.value && identityMissing.value,
);
const {
  isOwnProfile,
  visitorView,
  toggleVisitorView,
  profileLink,
  visibleRepos,
} = useProfileView(username, localUserReady);

// Map route type to API type
const repoType = computed(() => {
  if (currentType.value === "models") return "model";
  if (currentType.value === "datasets") return "dataset";
  if (currentType.value === "spaces") return "space";
  return "model";
});

const selectedSorts = reactive(
  Object.fromEntries(
    repoTypes.map((type) => [
      type,
      getRepoSortPreference({
        scope: "user",
        repoType: type,
        allowedValues: ["recent", "updated", "downloads", "likes"],
        fallback: "recent",
      }),
    ]),
  ),
);
const selectedSort = computed({
  get: () => selectedSorts[repoType.value],
  set: (value) => {
    selectedSorts[repoType.value] = value;
  },
});

const sortOptions = [
  { label: "Recently Created", value: "recent" },
  { label: "Recently Updated", value: "updated" },
  { label: "Most Downloads", value: "downloads" },
  { label: "Most Likes", value: "likes" },
];

const filteredRepos = computed(() => {
  const query = searchQuery.value.toLowerCase();
  const allRepos = visibleRepos(repos.value[repoType.value]);

  if (!query) return allRepos;

  return allRepos.filter(
    (repo) =>
      repo.id.toLowerCase().includes(query) ||
      repo.author?.toLowerCase().includes(query) ||
      repo.tags?.some((tag) => tag.toLowerCase().includes(query)),
  );
});

function getCount(type) {
  return visibleRepos(repos.value[type]).length;
}

function formatDate(date) {
  return formatRelativeTime(date, "never");
}

async function loadProfile() {
  const request = ++profileRequest;
  profileLoading.value = true;
  profileError.value = null;
  profileMissing.value = false;
  try {
    // Check if user exists by calling profile endpoint (WITH fallback to check all sources)
    const { data } = await axios.get(`/api/users/${username.value}/profile`, {
      params: { fallback: true },
    });
    if (!pageActive || request !== profileRequest) return;
    userInfo.value = data;
  } catch (err) {
    if (!pageActive || request !== profileRequest) return;
    if (err.response?.status === 404) {
      // Only a matching local identity miss confirms the whole user is absent.
      profileMissing.value = true;
      profileError.value = decodeError(err);
      return;
    }
    // Anything else (network, server): say what happened, but do not stop the page
    console.error("Failed to check user existence:", err);
    const decoded = decodeError(err);
    // the page is still worth showing: only this part is missing
    if (decoded.kind !== KIND.CANCELLED) profileError.value = decoded;
  } finally {
    if (pageActive && request === profileRequest) profileLoading.value = false;
  }
}

async function loadRepoType(type) {
  const request = ++repoRequests[type];
  repoLoading[type] = true;
  repoLoaded[type] = false;
  repoErrors[type] = null;
  recordIncomplete(type, []);
  try {
    const { data, incomplete } = await repoAPI.listAllRepos(type, {
      author: username.value,
      sort: selectedSorts[type],
    });
    if (!pageActive || request !== repoRequests[type]) return;
    repos.value[type] = data;
    recordIncomplete(type, incomplete);
    repoLoaded[type] = true;
  } catch (err) {
    if (!pageActive || request !== repoRequests[type]) return;
    console.error(`Failed to load user ${type}s:`, err);
    repos.value[type] = [];
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) repoErrors[type] = decoded;
  } finally {
    if (pageActive && request === repoRequests[type]) repoLoading[type] = false;
  }
}

// Sorting one list must not restart the independent lists or their counts.
for (const type of repoTypes) {
  watch(
    () => selectedSorts[type],
    (value) => {
      setRepoSortPreference({ scope: "user", repoType: type, value });
      if (pageActive && !userNotFound.value) void loadRepoType(type);
    },
  );
}

// Reset search when type changes
watch(currentType, () => {
  searchQuery.value = "";
});

function load() {
  // Validate type parameter (must be models, datasets, or spaces).
  if (!["models", "datasets", "spaces"].includes(currentType.value)) {
    router.replace(`/${username.value}`);
    return;
  }
  void loadProfile();
  for (const type of repoTypes) void loadRepoType(type);
}

onMounted(load);
onBeforeUnmount(() => {
  pageActive = false;
});
</script>

<style scoped src="@/styles/profile.css" />

<style scoped>
.profile-repositories {
  container-type: inline-size;
}

.profile-list-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: min(100%, 536px);
  min-width: 0;
  margin-left: auto;
}

.profile-list-controls .profile-sort {
  flex: 1 1 200px;
  width: 200px;
  min-width: 0;
  margin-left: 0;
}

.profile-list-controls .profile-search {
  flex: 1 1 260px;
  width: 260px;
  min-width: 0;
  max-width: 100%;
}

.profile-repository-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@container (min-width: 600px) {
  .profile-repository-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
