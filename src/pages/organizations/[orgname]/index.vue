<!-- src/pages/organizations/[orgname]/index.vue -->
<template>
  <div class="container-main profile-page">
    <!-- Organization Not Found -->
    <div v-if="orgNotFound" class="text-center py-20">
      <div
        class="i-carbon-group text-8xl text-gray-300 dark:text-gray-600 mb-6 inline-block"
      />
      <h1 class="text-4xl font-bold mb-4">Organization Not Found</h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 mb-8">
        The organization "<span
          class="font-mono text-blue-600 dark:text-blue-400"
          >{{ orgname }}</span
        >" does not exist.
      </p>
      <LinkButton type="primary" to="/">
        <div class="i-carbon-home mr-2" />
        Go to Homepage
      </LinkButton>
    </div>

    <div v-else>
      <div class="profile-layout">
        <!-- Sidebar -->
        <aside class="min-w-0 space-y-4 lg:self-start">
          <div
            class="card profile-card"
            :aria-busy="loading || identityLoading"
          >
            <ProfileViewToggle
              v-if="isMember"
              :visitor-view="visitorView"
              @toggle="toggleVisitorView"
            />
            <div class="profile-identity">
              <EntityAvatar
                :username="orgname"
                :name="orgname"
                is-org
                size="large"
                class="profile-avatar"
                :alt="`${orgname} avatar`"
              />

              <div class="min-w-0">
                <h1 class="text-2xl font-bold leading-tight">{{ orgname }}</h1>
                <p
                  v-if="loading"
                  role="status"
                  class="mt-1 text-sm text-gray-500"
                >
                  Loading organization...
                </p>
                <p
                  v-else
                  class="mt-1 text-base text-gray-600 dark:text-gray-400"
                >
                  Organization
                </p>
                <!-- External Source Badge -->
                <el-tag
                  v-if="isExternalOrg"
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
              v-if="profileError && (!profileMissing || !identityLoading)"
              :error="profileError"
              :context="errorContext('organization')"
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
              :context="errorContext('organization identity')"
              mode="inline-panel"
              :retrying="identityLoading"
              :retry="reloadIdentity"
            />
            <p
              v-if="detailsLoading"
              role="status"
              class="mt-3 text-sm text-gray-500"
            >
              Loading organization profile...
            </p>
            <ErrorState
              v-if="detailsError"
              :error="detailsError"
              :context="errorContext('organization profile')"
              mode="inline-panel"
              :retry="loadProfileDetails"
              :retrying="detailsLoading"
            />
            <ErrorState
              v-if="roleError"
              :error="roleError"
              :context="errorContext('organization access')"
              mode="inline-panel"
              :retry="reloadRole"
              :retrying="roleLoading"
            />
            <div v-if="canManage && !publicOnly" class="my-4">
              <LinkButton
                :to="`/organizations/${orgname}/settings`"
                class="w-full"
                >Organization Settings</LinkButton
              >
            </div>
            <FollowControls v-if="localOrgReady" :username="orgname" />
            <div v-if="profileInfo" class="space-y-3 text-sm">
              <p
                v-if="profileInfo.description"
                class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
              >
                {{ profileInfo.description }}
              </p>
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
                Created {{ formatDate(profileInfo.created_at) }}
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

          <!-- Members List -->
          <section
            class="card profile-panel"
            aria-label="Organization members"
            :aria-busy="membersLoading"
          >
            <h3 class="font-semibold mb-3 flex items-center gap-2">
              <div class="i-carbon-user-multiple" />
              Members
              <span
                v-if="!membersLoading && !membersError"
                class="text-sm text-gray-500"
                >({{ members.length || 0 }})</span
              >
            </h3>
            <p
              v-if="membersLoading"
              role="status"
              class="text-sm text-gray-500"
            >
              Loading members...
            </p>
            <ErrorState
              v-else-if="membersError"
              :error="membersError"
              :context="errorContext('members')"
              mode="inline-panel"
              :retry="loadMembers"
              :retrying="membersLoading"
            />
            <div v-else-if="members.length > 0" class="space-y-2">
              <div
                v-for="member in members"
                :key="member.user"
                class="relative flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <EntityAvatar
                  :username="member.user"
                  :name="member.user"
                  :size="32"
                  :alt="`${member.user} avatar`"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    <RouterLink
                      :to="`/${member.user}`"
                      class="stretched-link !text-inherit"
                      >{{ member.user }}</RouterLink
                    >
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ member.role }}
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else
              class="text-center py-4 text-sm text-gray-500 dark:text-gray-400"
            >
              No members yet
            </div>
          </section>

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
                    <span v-else class="text-gray-400">/ Unlimited</span>
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
                <div
                  v-else
                  class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"
                ></div>
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
                    <span v-else class="text-gray-400">/ Unlimited</span>
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
                <div
                  v-else
                  class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"
                ></div>
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
                <LinkButton
                  :to="`/organizations/${orgname}/storage`"
                  class="w-full"
                >
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
                :to="profileLink(`/organizations/${orgname}`)"
                class="profile-nav-link profile-nav-link-active"
                aria-current="page"
              >
                <div class="flex items-center gap-2 text-sm">
                  <div class="i-carbon-grid text-gray-500 dark:text-gray-400" />
                  <span class="font-semibold">Overview</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="profileLink(`/organizations/${orgname}/models`)"
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
                :to="profileLink(`/organizations/${orgname}/datasets`)"
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
                :to="profileLink(`/organizations/${orgname}/spaces`)"
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
              orgCardLoading ||
              orgCardError ||
              visibleOrgCard ||
              (publicOnly &&
                orgCard &&
                (profileSpaceVisibilityLoading || profileSpaceError))
            "
            class="card profile-panel"
            :aria-busy="
              orgCardLoading || (publicOnly && profileSpaceVisibilityLoading)
            "
            aria-label="Profile README"
          >
            <p
              v-if="
                orgCardLoading || (publicOnly && profileSpaceVisibilityLoading)
              "
              role="status"
              class="text-sm text-gray-500"
            >
              Loading profile README...
            </p>
            <ErrorState
              v-else-if="orgCardError"
              :error="orgCardError"
              :context="errorContext('profile README')"
              mode="inline-panel"
              :retrying="orgCardLoading"
              :retry="loadOrgCard"
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
              <MarkdownViewer :content="visibleOrgCard" />
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
                :to="profileLink(`/organizations/${orgname}/models`)"
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
                :to="profileLink(`/organizations/${orgname}/datasets`)"
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
                :to="profileLink(`/organizations/${orgname}/spaces`)"
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
import { repoAPI, orgAPI, settingsAPI } from "@/utils/api";
import LinkButton from "@/components/common/LinkButton.vue";
import ProfileRepoCard from "@/components/profile/ProfileRepoCard.vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import FollowControls from "@/components/profile/FollowControls.vue";
import ProfileViewToggle from "@/components/profile/ProfileViewToggle.vue";
import { useOrganizationProfileAccess } from "@/composables/useOrganizationProfileAccess";
import { formatRelativeTime } from "@/utils/datetime";
import {
  getRepoSortPreference,
  setRepoSortPreference,
} from "@/utils/repoSortPreference";
import ErrorState from "@/components/common/ErrorState.vue";
import IncompleteNotice from "@/components/common/IncompleteNotice.vue";
import { useIncompleteSources } from "@/composables/useIncompleteSources";
import { KIND, decodeError } from "@/errors";
import { useErrorContext } from "@/composables/useErrorContext";

const route = useRoute();
const orgname = computed(() => route.params.orgname);

const loading = ref(true);
const orgInfo = ref(null);
const profileDetails = ref(null);
const profileInfo = computed(() =>
  orgInfo.value || profileDetails.value
    ? { ...orgInfo.value, ...profileDetails.value }
    : null,
);
const detailsLoading = ref(true);
const detailsError = ref(null);
let detailsRequest = 0;
const members = ref([]);
const membersLoading = ref(true);
const membersError = ref(null);
let membersRequest = 0;
const repos = ref({ models: [], datasets: [], spaces: [] });
const orgCard = ref("");
const profileSpacePublic = ref(null);
const profileSpaceVisibilityLoading = ref(false);
const profileSpaceError = ref(null);
const orgCardLoading = ref(true);
const orgCardError = ref(null);
let orgCardRequest = 0;
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
    scope: "org",
    repoType: "model",
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
  dataset: getRepoSortPreference({
    scope: "org",
    repoType: "dataset",
    allowedValues: ["recent", "updated", "downloads", "likes"],
    fallback: "recent",
  }),
  space: getRepoSortPreference({
    scope: "org",
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

const {
  localOrgReady,
  identityLoading,
  identityError,
  identityMissing,
  reloadIdentity,
  roleLoading,
  roleError,
  reloadRole,
  canManage,
  isMember,
  visitorView,
  publicOnly,
  toggleVisitorView,
  profileLink,
  visibleRepos,
} = useOrganizationProfileAccess(orgname);
const orgNotFound = computed(
  () => profileMissing.value && identityMissing.value,
);
const isExternalOrg = computed(
  () =>
    !localOrgReady.value &&
    orgInfo.value?._source &&
    orgInfo.value._source !== "local",
);
const visibleOrgCard = computed(() => {
  if (!publicOnly.value) return orgCard.value;
  return profileSpacePublic.value === true ? orgCard.value : "";
});
watch(
  publicOnly,
  (preview) => {
    if (preview) void loadProfileSpaceVisibility();
  },
  { immediate: true },
);

const externalSourceName = computed(
  () => orgInfo.value?._source || "external source",
);
const hasPartialProfile = computed(() => orgInfo.value?._partial === true);
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
  if (bytes === null || bytes === undefined) return "Unlimited";
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

async function checkOrgExists() {
  const request = ++profileRequest;
  loading.value = true;
  profileError.value = null;
  profileMissing.value = false;
  try {
    const { data } = await orgAPI.getProfileInfo(orgname.value);
    if (pageActive && request === profileRequest) orgInfo.value = data;
  } catch (err) {
    if (!pageActive || request !== profileRequest) return;
    if (err.response?.status === 404) profileMissing.value = true;
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) profileError.value = decoded;
  } finally {
    if (pageActive && request === profileRequest) loading.value = false;
  }
}

async function loadProfileDetails() {
  const request = ++detailsRequest;
  detailsLoading.value = true;
  detailsError.value = null;
  try {
    const { data } = await settingsAPI.getOrgProfile(orgname.value);
    if (pageActive && request === detailsRequest) profileDetails.value = data;
  } catch (error) {
    if (!pageActive || request !== detailsRequest) return;
    if (error.response?.status !== 404) {
      const decoded = decodeError(error);
      if (decoded.kind !== KIND.CANCELLED) detailsError.value = decoded;
    }
  } finally {
    if (pageActive && request === detailsRequest) detailsLoading.value = false;
  }
}

async function loadMembers() {
  const request = ++membersRequest;
  membersLoading.value = true;
  membersError.value = null;
  try {
    const { data } = await orgAPI.listMembers(orgname.value);
    if (pageActive && request === membersRequest)
      members.value = data.members || [];
  } catch (error) {
    if (!pageActive || request !== membersRequest) return;
    const decoded = decodeError(error);
    if (decoded.kind !== KIND.CANCELLED) membersError.value = decoded;
  } finally {
    if (pageActive && request === membersRequest) membersLoading.value = false;
  }
}

async function loadRepoType(type) {
  const request = ++repoRequests[type];
  repoLoading[type] = true;
  repoErrors[type] = null;
  recordIncomplete(type, []);
  try {
    const { data, incomplete } = await repoAPI.listAllRepos(type, {
      author: orgname.value,
      sort: selectedSorts[type],
    });
    if (!pageActive || request !== repoRequests[type]) return;
    repos.value[getPluralKey(type)] = data;
    recordIncomplete(type, incomplete);
  } catch (err) {
    if (!pageActive || request !== repoRequests[type]) return;
    console.error(`Failed to load organization ${getPluralKey(type)}:`, err);
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
        scope: "org",
        repoType: type,
        value: selectedSorts[type],
      });
      if (pageActive && !orgNotFound.value) void loadRepoType(type);
    },
  );
}

async function loadProfileSpaceVisibility() {
  if (profileSpaceVisibilityLoading.value || profileSpacePublic.value !== null)
    return;
  const namespace = orgname.value;
  profileSpaceVisibilityLoading.value = true;
  profileSpaceError.value = null;
  try {
    const { data } = await repoAPI.getInfo("space", namespace, namespace, [
      "private",
    ]);
    if (pageActive && orgname.value === namespace)
      profileSpacePublic.value = data.private === false;
  } catch (err) {
    if (!pageActive || orgname.value !== namespace) return;
    if ([403, 404].includes(err.response?.status))
      profileSpacePublic.value = false;
    else {
      const decoded = decodeError(err);
      if (decoded.kind !== KIND.CANCELLED) profileSpaceError.value = decoded;
    }
  } finally {
    if (pageActive && orgname.value === namespace)
      profileSpaceVisibilityLoading.value = false;
  }
}

async function loadOrgCard() {
  const request = ++orgCardRequest;
  orgCardLoading.value = true;
  orgCardError.value = null;
  try {
    const response = await orgAPI.getProfileReadme(orgname.value);
    if (pageActive && request === orgCardRequest) orgCard.value = response.data;
  } catch (err) {
    if (!pageActive || request !== orgCardRequest) return;
    orgCard.value = "";
    if (![401, 403, 404].includes(err.response?.status)) {
      const decoded = decodeError(err);
      if (decoded.kind !== KIND.CANCELLED) orgCardError.value = decoded;
    }
  } finally {
    if (pageActive && request === orgCardRequest) orgCardLoading.value = false;
  }
}

async function loadQuotaInfo() {
  const request = ++quotaRequest;
  quotaLoading.value = true;
  quotaError.value = null;
  try {
    const response = await orgAPI.getPublicQuota(orgname.value);
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
  return checkOrgExists();
}

function load() {
  // Every content region starts independently of profile and namespace lookup.
  void checkOrgExists();
  void loadProfileDetails();
  void loadMembers();
  for (const type of repoTypes) void loadRepoType(type);
  void loadOrgCard();
  void loadQuotaInfo();
}

onMounted(load);
onBeforeUnmount(() => {
  pageActive = false;
});
</script>

<style scoped src="@/styles/profile.css" />
