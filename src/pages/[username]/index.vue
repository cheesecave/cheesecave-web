<!-- src/pages/[username]/index.vue -->
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

    <div v-else-if="!isOrganization">
      <div class="profile-layout">
        <!-- Sidebar -->
        <aside class="min-w-0 space-y-4 lg:self-start">
          <div
            class="card profile-card"
            :aria-busy="loading || identityLoading"
          >
            <ProfileViewToggle
              v-if="isOwnProfile"
              :visitor-view="visitorView"
              @toggle="toggleVisitorView"
            />
            <div class="profile-identity">
              <EntityAvatar
                :username="username"
                :name="username"
                size="large"
                class="profile-avatar"
                :alt="`${username} avatar`"
              />

              <div class="min-w-0">
                <h1 class="text-2xl font-bold leading-tight">{{ username }}</h1>
                <p
                  v-if="loading"
                  role="status"
                  class="mt-1 text-sm text-gray-500"
                >
                  Loading user profile...
                </p>
                <p
                  v-else
                  class="mt-1 text-base text-gray-600 dark:text-gray-400"
                >
                  {{ profileInfo?.full_name || "User" }}
                </p>
                <!-- External Source Badge -->
                <el-tag
                  v-if="isExternalUser"
                  size="small"
                  type="info"
                  class="mt-1"
                >
                  <div class="i-carbon-cloud inline-block mr-1" />
                  {{ externalSourceName }}
                </el-tag>
              </div>
            </div>

            <ErrorState
              v-if="
                profileError &&
                (!profileMissing || (!identityLoading && !isOrganization))
              "
              :error="profileError"
              :context="errorContext('user profile')"
              mode="inline-panel"
              :retrying="loading"
              :retry="reloadLookup"
            >
              <template v-if="profileMissing" #actions>
                <el-button
                  data-testid="error-action-retry"
                  :disabled="loading"
                  @click="reloadLookup"
                >
                  Try again
                </el-button>
              </template>
            </ErrorState>
            <ErrorState
              v-if="identityError"
              :error="identityError"
              :context="errorContext('account')"
              mode="inline-panel"
              :retrying="identityLoading"
              :retry="reloadIdentity"
            />
            <ProfileOwnerActions
              v-if="localUserReady"
              :username="username"
              :visitor-view="visitorView"
            />
            <FollowControls
              v-if="localUserReady"
              :username="username"
              :visitor-view="visitorView"
            />
            <div v-if="profileInfo" class="space-y-3 text-sm">
              <!-- Bio -->
              <p
                v-if="profileInfo.bio"
                class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
              >
                {{ profileInfo.bio }}
              </p>

              <!-- Links Section (Website + Social Media) -->
              <div
                v-if="profileInfo.website || profileInfo.social_media"
                class="flex gap-3"
              >
                <!-- Icons Column (10% width) -->
                <div class="flex flex-col gap-2 w-10% min-w-8">
                  <!-- Website Icon -->
                  <div
                    v-if="profileInfo.website"
                    class="flex items-center justify-center h-6"
                  >
                    <div
                      class="i-carbon-link w-4 h-4 text-gray-600 dark:text-gray-400"
                    />
                  </div>

                  <!-- Social Media Icons -->
                  <div
                    v-if="profileInfo.social_media?.twitter_x"
                    class="flex items-center justify-center h-6"
                  >
                    <div
                      class="i-carbon-logo-x w-4 h-4 text-gray-600 dark:text-gray-400"
                    />
                  </div>
                  <div
                    v-if="profileInfo.social_media?.threads"
                    class="flex items-center justify-center h-6"
                  >
                    <div
                      class="i-carbon-logo-instagram w-4 h-4 text-gray-600 dark:text-gray-400"
                    />
                  </div>
                  <div
                    v-if="profileInfo.social_media?.github"
                    class="flex items-center justify-center h-6"
                  >
                    <div
                      class="i-carbon-logo-github w-4 h-4 text-gray-600 dark:text-gray-400"
                    />
                  </div>
                  <div
                    v-if="profileInfo.social_media?.huggingface"
                    class="flex items-center justify-center h-6"
                  >
                    <span class="text-base">🤗</span>
                  </div>
                </div>

                <!-- Links Column (90% width) -->
                <div class="flex flex-col gap-2 flex-1 min-w-0">
                  <!-- Website Link -->
                  <a
                    v-if="profileInfo.website"
                    :href="profileInfo.website"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center h-6 text-sm text-blue-600 dark:text-blue-400 hover:underline transition-colors truncate"
                    title="Website"
                  >
                    {{ profileInfo.website.replace(/^https?:\/\//, "") }}
                  </a>

                  <!-- Social Media Links -->
                  <a
                    v-if="profileInfo.social_media?.twitter_x"
                    :href="`https://twitter.com/${profileInfo.social_media.twitter_x}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center h-6 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                    title="Twitter/X"
                  >
                    @{{ profileInfo.social_media.twitter_x }}
                  </a>

                  <a
                    v-if="profileInfo.social_media?.threads"
                    :href="`https://www.threads.net/@${profileInfo.social_media.threads}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center h-6 text-sm text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors truncate"
                    title="Threads"
                  >
                    @{{ profileInfo.social_media.threads }}
                  </a>

                  <a
                    v-if="profileInfo.social_media?.github"
                    :href="`https://github.com/${profileInfo.social_media.github}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center h-6 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors truncate"
                    title="GitHub"
                  >
                    {{ profileInfo.social_media.github }}
                  </a>

                  <a
                    v-if="profileInfo.social_media?.huggingface"
                    :href="`https://huggingface.co/${profileInfo.social_media.huggingface}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center h-6 text-sm text-gray-700 dark:text-gray-300 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors truncate"
                    title="HuggingFace"
                  >
                    {{ profileInfo.social_media.huggingface }}
                  </a>
                </div>
              </div>

              <!-- Joined Date -->
              <div
                class="flex items-center gap-2 text-gray-600 dark:text-gray-400 pt-2 border-t"
              >
                <div class="i-carbon-calendar" />
                Joined {{ formatDate(profileInfo.created_at) }}
              </div>

              <!-- Partial Profile Indicator -->
              <div
                v-if="hasPartialProfile"
                class="text-xs text-gray-500 dark:text-gray-400 italic pt-2 border-t"
              >
                <div class="i-carbon-information inline-block mr-1" />
                Limited profile from external source
              </div>
            </div>
          </div>

          <!-- Storage Quota Card -->
          <div
            v-if="quotaLoading || quotaError || quotaInfo"
            class="card profile-panel"
            :aria-busy="quotaLoading"
            role="region"
            aria-label="Storage usage"
          >
            <h3 class="font-semibold mb-3 flex items-center gap-2">
              <div class="i-carbon-data-base text-gray-500" />
              Storage Usage
            </h3>

            <p v-if="quotaLoading" role="status" class="text-sm text-gray-500">
              Loading storage usage...
            </p>
            <ErrorState
              v-else-if="quotaError"
              :error="quotaError"
              :context="errorContext('storage usage')"
              mode="inline-panel"
              :retrying="quotaLoading"
              :retry="loadQuotaInfo"
            />
            <template v-else-if="quotaInfo">
              <!-- Public Storage -->
              <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm text-gray-600 dark:text-gray-400"
                    >Public</span
                  >
                  <span class="text-sm font-mono">
                    {{ formatBytes(quotaInfo.public_used_bytes) }}
                    <span
                      v-if="quotaInfo.public_quota_bytes !== null"
                      class="text-gray-400"
                    >
                      / {{ formatBytes(quotaInfo.public_quota_bytes) }}
                    </span>
                    <span v-else class="text-gray-400">/ <Unlimited /></span>
                  </span>
                </div>
                <el-progress
                  v-if="quotaInfo.public_quota_bytes !== null"
                  :percentage="
                    Math.min(100, quotaInfo.public_percentage_used || 0)
                  "
                  :status="getQuotaStatus(quotaInfo.public_percentage_used)"
                  :show-text="false"
                />
                <UnlimitedMeter v-else />
              </div>

              <!-- Private Storage (only if user has permission) -->
              <div v-if="quotaInfo.can_see_private && !publicOnly" class="mb-2">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm text-gray-600 dark:text-gray-400"
                    >Private</span
                  >
                  <span class="text-sm font-mono">
                    {{ formatBytes(quotaInfo.private_used_bytes) }}
                    <span
                      v-if="quotaInfo.private_quota_bytes !== null"
                      class="text-gray-400"
                    >
                      / {{ formatBytes(quotaInfo.private_quota_bytes) }}
                    </span>
                    <span v-else class="text-gray-400">/ <Unlimited /></span>
                  </span>
                </div>
                <el-progress
                  v-if="quotaInfo.private_quota_bytes !== null"
                  :percentage="
                    Math.min(100, quotaInfo.private_percentage_used || 0)
                  "
                  :status="getQuotaStatus(quotaInfo.private_percentage_used)"
                  :show-text="false"
                />
                <UnlimitedMeter v-else />
              </div>

              <!-- Total -->
              <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div class="flex justify-between items-center">
                  <span class="text-sm font-semibold">Total</span>
                  <span class="text-sm font-mono font-semibold">
                    {{
                      formatBytes(
                        publicOnly
                          ? quotaInfo.public_used_bytes
                          : quotaInfo.total_used_bytes,
                      )
                    }}
                  </span>
                </div>
              </div>

              <!-- View Details Button (only for users with write permission) -->
              <div v-if="quotaInfo.can_see_private && !publicOnly" class="mt-4">
                <LinkButton :to="`/${username}/storage`" class="w-full">
                  <div class="i-carbon-chart-bar inline-block mr-1" />
                  View Details
                </LinkButton>
              </div>
            </template>
          </div>

          <!-- Stats Summary / Tab Navigation -->
          <div class="card profile-panel">
            <h3 class="font-semibold mb-3">Repositories</h3>
            <div class="space-y-1">
              <RouterLink
                :to="profileLink(`/${username}`)"
                class="profile-nav-link profile-nav-link-active"
                aria-current="page"
              >
                <div class="flex items-center gap-2 text-sm">
                  <div class="i-carbon-grid text-gray-500 dark:text-gray-400" />
                  <span class="font-semibold">Overview</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="profileLink(`/${username}/models`)"
                class="profile-nav-link"
              >
                <div class="flex items-center gap-2 text-sm">
                  <div class="i-carbon-model text-blue-500" />
                  <span>Models</span>
                </div>
                <span
                  v-if="!repoLoading.model && !repoErrors.model"
                  class="text-sm font-semibold text-gray-600 dark:text-gray-400"
                >
                  {{ getCount("model") }}
                </span>
              </RouterLink>

              <RouterLink
                :to="profileLink(`/${username}/datasets`)"
                class="profile-nav-link"
              >
                <div class="flex items-center gap-2 text-sm">
                  <div class="i-carbon-data-table text-green-500" />
                  <span>Datasets</span>
                </div>
                <span
                  v-if="!repoLoading.dataset && !repoErrors.dataset"
                  class="text-sm font-semibold text-gray-600 dark:text-gray-400"
                >
                  {{ getCount("dataset") }}
                </span>
              </RouterLink>

              <RouterLink
                :to="profileLink(`/${username}/spaces`)"
                class="profile-nav-link"
              >
                <div class="flex items-center gap-2 text-sm">
                  <div class="i-carbon-application text-purple-500" />
                  <span>Spaces</span>
                </div>
                <span
                  v-if="!repoLoading.space && !repoErrors.space"
                  class="text-sm font-semibold text-gray-600 dark:text-gray-400"
                >
                  {{ getCount("space") }}
                </span>
              </RouterLink>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="min-w-0 space-y-8">
          <!-- User Card (from Username/Username space repo if exists) -->
          <section
            v-if="
              userCardLoading ||
              userCardError ||
              visibleUserCard ||
              (publicOnly &&
                userCard &&
                (profileSpaceVisibilityLoading || profileSpaceError))
            "
            class="card profile-panel"
            :aria-busy="
              userCardLoading || (publicOnly && profileSpaceVisibilityLoading)
            "
            aria-label="Profile README"
          >
            <p
              v-if="
                userCardLoading || (publicOnly && profileSpaceVisibilityLoading)
              "
              role="status"
              class="text-sm text-gray-500"
            >
              Loading profile README...
            </p>
            <ErrorState
              v-else-if="userCardError"
              :error="userCardError"
              :context="errorContext('profile README')"
              mode="inline-panel"
              :retrying="userCardLoading"
              :retry="loadUserCard"
            />
            <ErrorState
              v-else-if="publicOnly && profileSpaceError"
              :error="profileSpaceError"
              :context="errorContext('profile README visibility')"
              mode="inline-panel"
              :retrying="profileSpaceVisibilityLoading"
              :retry="loadProfileSpaceVisibility"
            />
            <div v-else class="markdown-body">
              <MarkdownViewer :content="visibleUserCard" />
            </div>
          </section>

          <!-- A source was left out: the lists are right, but not everything -->
          <IncompleteNotice :sources="incompleteSources" />

          <!-- Models Section -->
          <section class="mb-8" :aria-busy="repoLoading.model">
            <div class="profile-section-header">
              <div class="profile-section-title">
                <div
                  class="i-carbon-model text-blue-500 text-xl"
                  aria-hidden="true"
                />
                <h2>Models</h2>
                <span
                  v-if="!repoLoading.model && !repoErrors.model"
                  class="profile-count"
                  >{{ getCount("model") }}</span
                >
              </div>
              <el-select
                aria-label="Sort models"
                v-model="selectedSorts.model"
                placeholder="Sort repositories"
                class="profile-sort"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>

            <p
              v-if="repoLoading.model"
              role="status"
              class="py-12 text-center text-gray-500 dark:text-gray-400"
            >
              Loading models...
            </p>
            <ErrorState
              v-else-if="repoErrors.model"
              :error="repoErrors.model"
              :context="errorContext('models')"
              mode="inline-panel"
              :retry="() => loadRepoType('model')"
            />
            <div v-else-if="getCount('model') > 0" class="space-y-4">
              <!-- Grid of repos (2 per row, max 3 rows = 6 repos) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ProfileRepoCard
                  class="profile-repo-card"
                  v-for="repo in displayedRepos('model')"
                  :key="repo.id"
                  :repo="repo"
                  type="model"
                />
              </div>

              <!-- Show More button -->
              <LinkButton
                v-if="hasMoreRepos('model')"
                :to="profileLink(`/${username}/models`)"
                class="w-full mt-4"
              >
                Show all {{ getCount("model") }} models
                <span class="i-carbon-arrow-right ml-2" aria-hidden="true" />
              </LinkButton>
            </div>

            <div
              v-else
              class="text-center py-12 text-gray-500 dark:text-gray-400"
            >
              <div class="i-carbon-document-blank text-6xl mb-4 inline-block" />
              <p>No models yet</p>
            </div>
          </section>

          <!-- Datasets Section -->
          <section class="mb-8" :aria-busy="repoLoading.dataset">
            <div class="profile-section-header">
              <div class="profile-section-title">
                <div
                  class="i-carbon-data-table text-green-500 text-xl"
                  aria-hidden="true"
                />
                <h2>Datasets</h2>
                <span
                  v-if="!repoLoading.dataset && !repoErrors.dataset"
                  class="profile-count"
                  >{{ getCount("dataset") }}</span
                >
              </div>
              <el-select
                aria-label="Sort datasets"
                v-model="selectedSorts.dataset"
                placeholder="Sort repositories"
                class="profile-sort"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>

            <p
              v-if="repoLoading.dataset"
              role="status"
              class="py-12 text-center text-gray-500 dark:text-gray-400"
            >
              Loading datasets...
            </p>
            <ErrorState
              v-else-if="repoErrors.dataset"
              :error="repoErrors.dataset"
              :context="errorContext('datasets')"
              mode="inline-panel"
              :retry="() => loadRepoType('dataset')"
            />
            <div v-else-if="getCount('dataset') > 0" class="space-y-4">
              <!-- Grid of repos (2 per row, max 3 rows = 6 repos) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ProfileRepoCard
                  class="profile-repo-card"
                  v-for="repo in displayedRepos('dataset')"
                  :key="repo.id"
                  :repo="repo"
                  type="dataset"
                />
              </div>

              <!-- Show More button -->
              <LinkButton
                v-if="hasMoreRepos('dataset')"
                :to="profileLink(`/${username}/datasets`)"
                class="w-full mt-4"
              >
                Show all {{ getCount("dataset") }} datasets
                <span class="i-carbon-arrow-right ml-2" aria-hidden="true" />
              </LinkButton>
            </div>

            <div
              v-else
              class="text-center py-12 text-gray-500 dark:text-gray-400"
            >
              <div class="i-carbon-document-blank text-6xl mb-4 inline-block" />
              <p>No datasets yet</p>
            </div>
          </section>

          <!-- Spaces Section -->
          <section :aria-busy="repoLoading.space">
            <div class="profile-section-header">
              <div class="profile-section-title">
                <div
                  class="i-carbon-application text-purple-500 text-xl"
                  aria-hidden="true"
                />
                <h2>Spaces</h2>
                <span
                  v-if="!repoLoading.space && !repoErrors.space"
                  class="profile-count"
                  >{{ getCount("space") }}</span
                >
              </div>
              <el-select
                aria-label="Sort spaces"
                v-model="selectedSorts.space"
                placeholder="Sort repositories"
                class="profile-sort"
              >
                <el-option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>

            <p
              v-if="repoLoading.space"
              role="status"
              class="py-12 text-center text-gray-500 dark:text-gray-400"
            >
              Loading spaces...
            </p>
            <ErrorState
              v-else-if="repoErrors.space"
              :error="repoErrors.space"
              :context="errorContext('spaces')"
              mode="inline-panel"
              :retry="() => loadRepoType('space')"
            />
            <div v-else-if="getCount('space') > 0" class="space-y-4">
              <!-- Grid of repos (2 per row, max 3 rows = 6 repos) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ProfileRepoCard
                  class="profile-repo-card"
                  v-for="repo in displayedRepos('space')"
                  :key="repo.id"
                  :repo="repo"
                  type="space"
                />
              </div>

              <!-- Show More button -->
              <LinkButton
                v-if="hasMoreRepos('space')"
                :to="profileLink(`/${username}/spaces`)"
                class="w-full mt-4"
              >
                Show all {{ getCount("space") }} spaces
                <span class="i-carbon-arrow-right ml-2" aria-hidden="true" />
              </LinkButton>
            </div>

            <div
              v-else
              class="text-center py-12 text-gray-500 dark:text-gray-400"
            >
              <div class="i-carbon-document-blank text-6xl mb-4 inline-block" />
              <p>No spaces yet</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { unlimitedText } from "@/utils/unlimited";
import { repoAPI, orgAPI, settingsAPI } from "@/utils/api";
import LinkButton from "@/components/common/LinkButton.vue";
import ProfileRepoCard from "@/components/profile/ProfileRepoCard.vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import SocialLinks from "@/components/profile/SocialLinks.vue";
import FollowControls from "@/components/profile/FollowControls.vue";
import ProfileOwnerActions from "@/components/profile/ProfileOwnerActions.vue";
import ProfileViewToggle from "@/components/profile/ProfileViewToggle.vue";
import { useProfileView } from "@/composables/useProfileView";
import { useUserProfileIdentity } from "@/composables/useUserProfileIdentity";
import { formatRelativeTime } from "@/utils/datetime";
import {
  getRepoSortPreference,
  setRepoSortPreference,
} from "@/utils/repoSortPreference";
import axios from "axios";
import ErrorState from "@/components/common/ErrorState.vue";
import IncompleteNotice from "@/components/common/IncompleteNotice.vue";
import { useIncompleteSources } from "@/composables/useIncompleteSources";
import { KIND, decodeError } from "@/errors";
import { useErrorContext } from "@/composables/useErrorContext";

const route = useRoute();
const router = useRouter();
const username = computed(() => route.params.username);

const loading = ref(true);
const profileInfo = ref(null);
const repos = ref({ models: [], datasets: [], spaces: [] });
const userCard = ref("");
const profileSpacePublic = ref(null);
const profileSpaceVisibilityLoading = ref(false);
const profileSpaceError = ref(null);
const userCardLoading = ref(true);
const userCardError = ref(null);
let userCardRequest = 0;
let profileRequest = 0;
let quotaRequest = 0;
const profileMissing = ref(false);
// Why the profile / the repository lists could not be loaded (AppError)
const errorContext = useErrorContext();
const profileError = ref(null);
const repoTypes = ["model", "dataset", "space"];
const repoLoading = reactive({ model: true, dataset: true, space: true });
const repoErrors = reactive({ model: null, dataset: null, space: null });
const repoRequests = { model: 0, dataset: 0, space: 0 };
let pageActive = true;
const { sources: incompleteSources, record: recordIncomplete } =
  useIncompleteSources();
const quotaInfo = ref(null);
const quotaLoading = ref(false);
const quotaError = ref(null);
const selectedSorts = reactive({
  model: getRepoSortPreference({
    scope: "user",
    repoType: "model",
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
  dataset: getRepoSortPreference({
    scope: "user",
    repoType: "dataset",
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
  space: getRepoSortPreference({
    scope: "user",
    repoType: "space",
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
});

const MAX_DISPLAYED = 6; // 2 per row × 3 rows
const sortOptions = [
  { label: "Recently Created", value: "recent" },
  { label: "Recently Updated", value: "updated" },
  { label: "Most Downloads", value: "downloads" },
  { label: "Most Likes", value: "likes" },
];

// External user detection (check both profile and repos)
const isExternalUser = computed(() => {
  if (localUserReady.value) return false;
  // Check profile first
  if (profileInfo.value?._source && profileInfo.value._source !== "local") {
    return true;
  }
  // Check repos if profile doesn't have _source
  // If any repo has _source (and it's not local), user is external
  for (const repoType of ["models", "datasets", "spaces"]) {
    const repoList = repos.value[repoType] || [];
    for (const repo of repoList) {
      if (repo._source && repo._source !== "local") {
        return true;
      }
    }
  }
  return false;
});

const {
  localUserReady,
  isOrganization,
  identityLoading,
  identityError,
  identityMissing,
  reloadIdentity,
} = useUserProfileIdentity(username, () => `/organizations/${username.value}`);
const userNotFound = computed(
  () => profileMissing.value && identityMissing.value,
);
const {
  isOwnProfile,
  visitorView,
  publicOnly,
  toggleVisitorView,
  profileLink,
  visibleRepos,
} = useProfileView(username, localUserReady);
const visibleUserCard = computed(() => {
  if (!publicOnly.value) return userCard.value;
  return profileSpacePublic.value === true ? userCard.value : "";
});
watch(
  publicOnly,
  (preview) => {
    if (preview) void loadProfileSpaceVisibility();
  },
  { immediate: true },
);

const externalSourceName = computed(() => {
  // Try profile first
  if (profileInfo.value?._source) {
    return profileInfo.value._source;
  }
  // Try first repo with _source
  for (const repoType of ["models", "datasets", "spaces"]) {
    const repoList = repos.value[repoType] || [];
    for (const repo of repoList) {
      if (repo._source && repo._source !== "local") {
        return repo._source;
      }
    }
  }
  return "external source";
});

const externalSourceUrl = computed(() => {
  // Try profile first
  if (profileInfo.value?._source_url) {
    return profileInfo.value._source_url;
  }
  // Try first repo with _source_url
  for (const repoType of ["models", "datasets", "spaces"]) {
    const repoList = repos.value[repoType] || [];
    for (const repo of repoList) {
      if (repo._source_url) {
        return repo._source_url;
      }
    }
  }
  return "";
});

const hasPartialProfile = computed(() => {
  return profileInfo.value?._partial === true;
});

const externalAvatarUrl = computed(() => {
  return profileInfo.value?._avatar_url;
});

// Helper to convert singular type to plural key
function getPluralKey(type) {
  return type + "s";
}

function getCount(type) {
  return visibleRepos(repos.value[getPluralKey(type)]).length;
}

function displayedRepos(type) {
  return visibleRepos(repos.value[getPluralKey(type)]).slice(0, MAX_DISPLAYED);
}

function hasMoreRepos(type) {
  return getCount(type) > MAX_DISPLAYED;
}

function formatDate(date) {
  return formatRelativeTime(date, "never");
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return unlimitedText("value");
  if (bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getQuotaStatus(percentage) {
  if (percentage === null || percentage === undefined) return "";
  if (percentage >= 90) return "exception";
  if (percentage >= 75) return "warning";
  return "success";
}

async function checkUserExists() {
  const request = ++profileRequest;
  loading.value = true;
  profileError.value = null;
  profileMissing.value = false;
  try {
    const { data } = await axios.get(`/api/users/${username.value}/profile`, {
      params: { fallback: true },
    });
    if (pageActive && request === profileRequest) profileInfo.value = data;
  } catch (err) {
    if (!pageActive || request !== profileRequest) return;
    if (err.response?.status === 404) profileMissing.value = true;
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) profileError.value = decoded;
  } finally {
    if (pageActive && request === profileRequest) loading.value = false;
  }
}

async function loadRepoType(type) {
  const request = ++repoRequests[type];
  repoLoading[type] = true;
  repoErrors[type] = null;
  recordIncomplete(type, []);
  try {
    const { data, incomplete } = await repoAPI.listAllRepos(type, {
      author: username.value,
      sort: selectedSorts[type],
    });
    if (!pageActive || request !== repoRequests[type]) return;
    repos.value[getPluralKey(type)] = data;
    recordIncomplete(type, incomplete);
  } catch (err) {
    if (!pageActive || request !== repoRequests[type]) return;
    console.error(`Failed to load user ${getPluralKey(type)}:`, err);
    repos.value[getPluralKey(type)] = [];
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) repoErrors[type] = decoded;
  } finally {
    if (pageActive && request === repoRequests[type]) {
      repoLoading[type] = false;
    }
  }
}

for (const type of repoTypes) {
  watch(
    () => selectedSorts[type],
    () => {
      setRepoSortPreference({
        scope: "user",
        repoType: type,
        value: selectedSorts[type],
      });
      if (pageActive && !userNotFound.value) void loadRepoType(type);
    },
  );
}

async function loadProfileSpaceVisibility() {
  if (profileSpaceVisibilityLoading.value || profileSpacePublic.value !== null)
    return;
  const namespace = username.value;
  profileSpaceVisibilityLoading.value = true;
  profileSpaceError.value = null;
  try {
    const { data } = await repoAPI.getInfo("space", namespace, namespace, [
      "private",
    ]);
    if (pageActive && username.value === namespace)
      profileSpacePublic.value = data.private === false;
  } catch (err) {
    if (!pageActive || username.value !== namespace) return;
    if ([403, 404].includes(err.response?.status))
      profileSpacePublic.value = false;
    else {
      const decoded = decodeError(err);
      if (decoded.kind !== KIND.CANCELLED) profileSpaceError.value = decoded;
    }
  } finally {
    if (pageActive && username.value === namespace)
      profileSpaceVisibilityLoading.value = false;
  }
}

async function loadUserCard() {
  const request = ++userCardRequest;
  userCardLoading.value = true;
  userCardError.value = null;
  try {
    const url = `/spaces/${username.value}/${username.value}/resolve/main/README.md`;
    const response = await axios.get(url);
    if (pageActive && request === userCardRequest)
      userCard.value = response.data;
  } catch (err) {
    if (!pageActive || request !== userCardRequest) return;
    userCard.value = "";
    if (![401, 403, 404].includes(err.response?.status)) {
      const decoded = decodeError(err);
      if (decoded.kind !== KIND.CANCELLED) userCardError.value = decoded;
    }
  } finally {
    if (pageActive && request === userCardRequest)
      userCardLoading.value = false;
  }
}

async function loadQuotaInfo() {
  const request = ++quotaRequest;
  quotaLoading.value = true;
  quotaError.value = null;
  try {
    const response = await axios.get(`/api/quota/${username.value}/public`, {
      withCredentials: true,
    });
    if (pageActive && request === quotaRequest) quotaInfo.value = response.data;
  } catch (err) {
    if (!pageActive || request !== quotaRequest) return;
    if (err.response?.status === 404) {
      quotaInfo.value = null;
      return;
    }
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) quotaError.value = decoded;
  } finally {
    if (pageActive && request === quotaRequest) quotaLoading.value = false;
  }
}

function reloadLookup() {
  return checkUserExists();
}

function load() {
  // Every content region starts independently of profile and namespace lookup.
  void checkUserExists();
  for (const type of repoTypes) void loadRepoType(type);
  void loadUserCard();
  void loadQuotaInfo();
}

onMounted(load);
onBeforeUnmount(() => {
  pageActive = false;
});
</script>

<style scoped src="@/styles/profile.css" />
