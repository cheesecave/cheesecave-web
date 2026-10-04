<template>
  <div class="repo-discovery">
    <aside class="discovery-sidebar" aria-label="Repository filters">
      <el-scrollbar max-height="calc(100dvh - 125px)" :tabindex="0">
        <RepoFilterPanel
          :facets="facets"
          :selected="selectedFilters"
          @toggle="toggleFilter"
          @clear="clearFilters"
        />
      </el-scrollbar>
    </aside>
    <div class="discovery-main">
      <header class="discovery-heading">
        <div class="discovery-title">
          <h1>{{ pageTitle }}</h1>
          <span v-if="hasLoaded" class="repo-total">{{
            total.toLocaleString()
          }}</span>
        </div>
        <el-button
          v-if="isAuthenticated"
          type="primary"
          @click="showCreateDialog = true"
          ><span class="i-carbon-add mr-1" />New {{ repoTypeLabel }}</el-button
        >
      </header>
      <p class="discovery-description">{{ pageDescription }}</p>
      <div class="discovery-toolbar">
        <el-input
          v-model="searchQuery"
          :placeholder="`Search ${repoType}s...`"
          clearable
          :maxlength="200"
          aria-label="Search repositories"
          ><template #prefix><span class="i-carbon-search" /></template
        ></el-input>
        <el-select
          v-model="sortBy"
          aria-label="Sort repositories"
          @change="changeSort"
        >
          <el-option
            v-for="sort in REPOSITORY_SORTS"
            :key="sort.value"
            :label="sort.label"
            :value="sort.value"
          />
        </el-select>
        <el-button class="mobile-filter-button" @click="showFilters = true"
          ><span class="i-carbon-filter mr-1" />Filters<span
            v-if="activeFilters.length"
          >
            ({{ activeFilters.length }})</span
          ></el-button
        >
      </div>
      <div
        v-if="activeFilters.length"
        class="selected-filters"
        aria-label="Selected filters"
      >
        <button
          v-for="filter in activeFilters"
          :key="`${filter.key}:${filter.value}`"
          type="button"
          :aria-label="`Remove ${filter.label} filter`"
          @click="toggleFilter(filter)"
        >
          {{ filter.label }}<span class="i-carbon-close" aria-hidden="true" />
        </button>
        <button type="button" class="clear-selected" @click="clearFilters">
          Clear all
        </button>
      </div>
      <div class="discovery-status" aria-live="polite">
        <span v-if="loading && hasLoaded" class="repo-refreshing" role="status"
          ><span
            class="i-carbon-circle-dash animate-spin"
            aria-hidden="true"
          />Updating repositories</span
        >
        <span v-else-if="indexing.pending" role="status"
          >Updating filters · {{ indexing.pending }} repositories
          remaining</span
        >
      </div>
      <section
        class="repo-results"
        :aria-busy="loading"
        aria-label="Repositories"
      >
        <el-skeleton :loading="loading && !hasLoaded" animated>
          <template #template
            ><div class="discovery-grid" aria-hidden="true">
              <div v-for="index in 12" :key="index" class="repo-skeleton-card">
                <el-skeleton-item
                  variant="h3"
                  class="!w-3/4"
                /><el-skeleton-item
                  variant="text"
                  class="!w-2/3"
                /><el-skeleton-item variant="text" class="!w-1/2" />
              </div></div
          ></template>
          <template #default>
            <div v-if="loadError" class="discovery-error" role="alert">
              {{ loadError }}<el-button @click="loadRepos">Retry</el-button>
            </div>
            <div v-if="repos.length" class="discovery-grid">
              <RepoDiscoveryCard
                v-for="repo in repos"
                :key="repo.id"
                :repo="repo"
                :repo-type="repoType"
              />
            </div>
            <div v-else-if="!loadError" class="discovery-empty">
              <span class="i-carbon-search" aria-hidden="true" />
              <h2>
                {{
                  indexing.pending
                    ? "Preparing repository filters"
                    : "No repositories found"
                }}
              </h2>
              <p>
                {{
                  indexing.pending
                    ? "Results will update as metadata is indexed."
                    : "Try another search or clear the selected filters."
                }}
              </p>
              <el-button
                v-if="activeFilters.length || searchTerm"
                @click="resetSearch"
                >Clear filters</el-button
              >
            </div>
          </template>
        </el-skeleton>
      </section>
      <el-pagination
        v-if="total > discoveryPageSize"
        class="discovery-pagination"
        :current-page="currentPage"
        :page-size="discoveryPageSize"
        :total="total"
        layout="prev, pager, next"
        :pager-count="5"
        @current-change="changePage"
      />
    </div>
    <el-drawer
      v-model="showFilters"
      title="Filters"
      direction="btt"
      size="85%"
      class="discovery-filter-drawer"
    >
      <el-scrollbar height="100%" :tabindex="0">
        <RepoFilterPanel
          :facets="facets"
          :selected="selectedFilters"
          @toggle="toggleFilter"
          @clear="clearFilters"
        />
      </el-scrollbar>
      <template #footer
        ><el-button type="primary" @click="showFilters = false"
          >Show results</el-button
        ></template
      >
    </el-drawer>
    <!-- Create Repository Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="`Create New ${repoTypeLabel}`"
      width="min(500px, calc(100vw - 32px))"
    >
      <CreateRepositoryForm
        v-if="showCreateDialog"
        :fixed-type="repoType"
        compact
        @cancel="showCreateDialog = false"
        @created="showCreateDialog = false"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import RepoFilterPanel from "@/components/discovery/RepoFilterPanel.vue";
import RepoDiscoveryCard from "@/components/discovery/RepoDiscoveryCard.vue";
import CreateRepositoryForm from "@/components/repo/CreateRepositoryForm.vue";
import { useRepositoryDiscovery } from "@/composables/useRepositoryDiscovery";
import { discoveryPageSize } from "@/utils/repo-discovery";
import { REPOSITORY_SORTS } from "@/utils/repository-sorts";
import { getRepositoryType, isRepositoryType } from "@/utils/repository-types";
const props = defineProps({
  repoType: {
    type: String,
    required: true,
    validator: isRepositoryType,
  },
});
const repositoryType = computed(() => getRepositoryType(props.repoType));
const repoTypeLabel = computed(() => repositoryType.value.label);
const pageTitle = computed(() => repositoryType.value.plural);
const pageDescription = computed(
  () => repositoryType.value.discoveryDescription,
);
const {
  isAuthenticated,
  searchQuery,
  searchTerm,
  sortBy,
  selectedFilters,
  currentPage,
  repos,
  total,
  facets,
  indexing,
  loading,
  hasLoaded,
  loadError,
  activeFilters,
  toggleFilter,
  clearFilters,
  resetSearch,
  changeSort,
  changePage,
  loadRepos,
} = useRepositoryDiscovery(() => props.repoType);
const showFilters = ref(false);
const showCreateDialog = ref(false);
</script>

<style scoped>
.repo-discovery {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 32px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 32px 28px;
}
.discovery-sidebar {
  min-width: 0;
  align-self: start;
  position: sticky;
  top: 24px;
  padding-right: 24px;
  border-right: 1px solid var(--site-border);
}
.discovery-main {
  min-width: 0;
}
.discovery-heading,
.discovery-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.discovery-heading {
  justify-content: space-between;
}
.discovery-title h1 {
  font-size: 24px;
  font-weight: 650;
  margin: 0;
}
.repo-total {
  font-size: 15px;
  color: var(--site-page-muted);
}
.discovery-description {
  color: var(--site-page-muted);
  font-size: 13px;
  margin: 6px 0 20px;
}
.discovery-toolbar {
  display: flex;
  gap: 12px;
}
.discovery-toolbar > .el-input {
  flex: 1;
  min-width: 0;
}
.discovery-toolbar > .el-select {
  width: 185px;
  flex-shrink: 0;
}
.mobile-filter-button {
  display: none;
}
.selected-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.selected-filters button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  cursor: pointer;
  padding: 5px 8px;
  border: 1px solid var(--site-primary);
  border-radius: 7px;
  background: var(--site-card);
  color: var(--site-link);
}
.selected-filters button:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 2px;
}
.selected-filters .clear-selected {
  border-color: transparent;
  background: transparent;
}
.discovery-status {
  min-height: 30px;
  padding-top: 8px;
  color: var(--site-page-muted);
  font-size: 12px;
}
.repo-refreshing {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.repo-results {
  position: relative;
}
.discovery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.repo-skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 122px;
  border-radius: var(--site-card-radius, 12px);
  box-shadow: var(--site-card-shadow, none);
  padding: 18px;
  background: var(--site-card);
  border: 1px solid var(--site-border);
}
.discovery-empty {
  padding: 72px 16px;
  text-align: center;
  color: var(--site-page-muted);
  border: 1px solid var(--site-border);
  border-radius: var(--site-card-radius, 12px);
  box-shadow: var(--site-card-shadow, none);
  background: var(--site-card);
}
.discovery-empty > span {
  display: inline-block;
  width: 28px;
  height: 28px;
}
.discovery-empty h2 {
  font-size: 17px;
  margin: 16px 0 8px;
  color: var(--site-card-text);
}
.discovery-empty p {
  font-size: 13px;
  margin-bottom: 16px;
}
.discovery-error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  padding: 16px;
  margin-bottom: 16px;
  border-radius: var(--site-card-radius, 12px);
  box-shadow: var(--site-card-shadow, none);
  background: var(--site-card);
  border: 1px solid var(--site-border);
}
.discovery-pagination {
  margin-top: 24px;
  justify-content: center;
}
@media (max-width: 1100px) {
  .repo-discovery {
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 24px;
  }
  .discovery-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .repo-discovery {
    display: block;
    padding: 24px 16px;
  }
  .discovery-sidebar {
    display: none;
  }
  .mobile-filter-button {
    display: inline-flex;
  }
  .discovery-toolbar {
    flex-wrap: wrap;
    gap: 10px;
  }
  .discovery-toolbar > .el-input {
    flex: 1 1 100%;
  }
  .discovery-toolbar > .el-select {
    flex: 1;
    width: auto;
  }
  .discovery-title h1 {
    font-size: 22px;
  }
  .discovery-heading > .el-button {
    font-size: 12px;
    padding: 8px 10px;
  }
}
</style>
