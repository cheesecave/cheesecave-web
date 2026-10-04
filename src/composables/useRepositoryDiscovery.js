import { computed, ref, watch, onMounted, onBeforeUnmount, toValue } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { repoAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { getAuthIdentity } from "@/utils/auth-identity";
import { ElMessage } from "element-plus";
import {
  getRepoSortPreference,
  setRepoSortPreference,
} from "@/utils/repoSortPreference";
import {
  discoverySorts,
  discoveryPageSize,
  facetKeys,
  facetLabel,
  readDiscoveryQuery,
  discoveryParams,
  discoveryQuery,
} from "@/utils/repo-discovery";

// Owns request lifetime and URL state independently of the page layout.
export function useRepositoryDiscovery(type) {
  const repoType = computed(() => toValue(type));
  const router = useRouter();
  const route = useRoute();
  const authStore = useAuthStore();
  const { isAuthenticated } = storeToRefs(authStore);
  const authIdentity = computed(() => getAuthIdentity(authStore));
  const fallbackSort = getRepoSortPreference({
    scope: "repo",
    repoType: repoType.value,
    allowedValues: discoverySorts,
    fallback: "trending",
  });
  const initial = readDiscoveryQuery(route.query, fallbackSort);
  const searchQuery = ref(initial.search);
  const searchTerm = ref(initial.search);
  const sortBy = ref(initial.sort);
  const selectedFilters = ref(initial.selected);
  const currentPage = ref(initial.page);
  const repos = ref([]);
  const total = ref(0);
  const facets = ref([]);
  const indexing = ref({ pending: 0, total: 0 });
  const loading = ref(true);
  const hasLoaded = ref(false);
  const loadError = ref("");
  let requestSequence = 0;
  let pollTimer;
  let searchTimer;
  let destroyed = false;
  let previousPending;
  let pollDelay = 2000;
  const state = computed(() => ({
    search: searchTerm.value,
    sort: sortBy.value,
    page: currentPage.value,
    selected: selectedFilters.value,
  }));
  const requestKey = computed(() =>
    JSON.stringify([repoType.value, authIdentity.value, state.value]),
  );
  const activeFilters = computed(() =>
    facetKeys.flatMap((key) =>
      (selectedFilters.value[key] || []).map((value) => ({
        key,
        value,
        label: facetLabel(key, value),
      })),
    ),
  );
  function syncLocation() {
    router.replace({ query: discoveryQuery(state.value, route.query) });
  }
  function toggleFilter({ key, value }) {
    const values = selectedFilters.value[key] || [];
    const next = {
      ...selectedFilters.value,
      [key]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value].sort(),
    };
    if (!next[key].length) delete next[key];
    selectedFilters.value = next;
    currentPage.value = 1;
    syncLocation();
  }
  function clearFilters() {
    selectedFilters.value = {};
    currentPage.value = 1;
    syncLocation();
  }
  function resetSearch() {
    clearTimeout(searchTimer);
    searchQuery.value = "";
    searchTerm.value = "";
    clearFilters();
  }
  function changeSort() {
    currentPage.value = 1;
    setRepoSortPreference({
      scope: "repo",
      repoType: repoType.value,
      value: sortBy.value,
    });
    syncLocation();
  }
  function changePage(page) {
    currentPage.value = page;
    syncLocation();
  }
  watch(searchQuery, (value) => {
    clearTimeout(searchTimer);
    if (value.trim() === searchTerm.value) return;
    searchTimer = setTimeout(() => {
      searchTerm.value = value.trim();
      currentPage.value = 1;
      syncLocation();
    }, 250);
  });
  watch(
    () => route.query,
    (query) => {
      const next = readDiscoveryQuery(query, fallbackSort);
      clearTimeout(searchTimer);
      searchTerm.value = next.search;
      searchQuery.value = next.search;
      sortBy.value = next.sort;
      currentPage.value = next.page;
      if (
        JSON.stringify(next.selected) !== JSON.stringify(selectedFilters.value)
      )
        selectedFilters.value = next.selected;
    },
    { deep: true },
  );
  async function loadRepos() {
    clearTimeout(pollTimer);
    const sequence = ++requestSequence;
    const owner = authIdentity.value;
    loading.value = true;
    loadError.value = "";
    try {
      const { data } = await repoAPI.discoverRepos(
        repoType.value,
        discoveryParams(state.value),
      );
      if (
        destroyed ||
        sequence !== requestSequence ||
        authIdentity.value !== owner
      )
        return;
      repos.value = data.items || [];
      total.value = data.total || 0;
      facets.value = (data.facets || []).map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          label: facetLabel(group.key, option.value),
        })),
      }));
      indexing.value = data.indexing || { pending: 0, total: 0 };
      // The server owns Unicode case folding; use its canonical selection in the UI and URL.
      if (data.selected) {
        const canonical = readDiscoveryQuery(
          data.selected,
          sortBy.value,
        ).selected;
        if (
          JSON.stringify(canonical) !== JSON.stringify(selectedFilters.value)
        ) {
          selectedFilters.value = canonical;
          syncLocation();
        }
      }
      const lastPage = Math.max(1, Math.ceil(total.value / discoveryPageSize));
      if (currentPage.value > lastPage && !indexing.value.pending) {
        currentPage.value = lastPage;
        syncLocation();
      } else if (indexing.value.pending) {
        pollDelay =
          previousPending === indexing.value.pending
            ? Math.min(10000, pollDelay * 2)
            : 2000;
        previousPending = indexing.value.pending;
        pollTimer = setTimeout(loadRepos, pollDelay);
      }
    } catch (err) {
      if (
        destroyed ||
        sequence !== requestSequence ||
        authIdentity.value !== owner
      )
        return;
      if ([401, 403].includes(err?.response?.status)) clearResults();
      console.error(`Failed to load ${repoType.value}s:`, err);
      loadError.value = `Failed to load ${repoType.value}s. Please try again.`;
      ElMessage.error(`Failed to load ${repoType.value}s`);
    } finally {
      if (
        !destroyed &&
        sequence === requestSequence &&
        authIdentity.value === owner
      ) {
        loading.value = false;
        hasLoaded.value = true;
      }
    }
  }
  function clearResults() {
    repos.value = [];
    facets.value = [];
    total.value = 0;
    indexing.value = { pending: 0, total: 0 };
  }
  watch(
    () => [repoType.value, authIdentity.value],
    () => {
      requestSequence++;
      clearTimeout(pollTimer);
      clearResults();
      if (currentPage.value !== 1) {
        currentPage.value = 1;
        syncLocation();
      }
      loadError.value = "";
      hasLoaded.value = false;
      loading.value = true;
    },
    { flush: "sync" },
  );
  watch(requestKey, () => {
    previousPending = undefined;
    pollDelay = 2000;
    loadRepos();
  });
  onMounted(() => {
    if (activeFilters.value.length) syncLocation();
    loadRepos();
  });
  onBeforeUnmount(() => {
    destroyed = true;
    requestSequence++;
    clearTimeout(pollTimer);
    clearTimeout(searchTimer);
  });
  return {
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
  };
}
