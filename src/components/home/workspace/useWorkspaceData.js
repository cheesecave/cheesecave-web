import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { repoAPI } from "@/utils/api";
import { REPOSITORY_TYPES as types } from "@/utils/repository-types";
import { getAuthIdentity } from "@/utils/auth-identity";

export function useWorkspaceData() {
  const authStore = useAuthStore();
  const { username, organizations: authOrganizations } = storeToRefs(authStore);
  const identity = computed(() => getAuthIdentity(authStore));
  const embeddedOrganizations = () => {
    const value = authStore.user?.organizations ?? authStore.user?.orgs;
    return Array.isArray(value) ? value : null;
  };
  const organizations = ref(
    username.value ? (embeddedOrganizations() ?? authOrganizations.value) : [],
  );
  const repositories = ref([]);
  const loading = ref(false);
  const error = ref(false);
  const filter = ref("");
  const feedType = ref("all");
  const personalExpanded = ref(false);
  const trendingType = ref("model");
  const trendingRepositories = ref([]);
  const trendingLoading = ref(false);
  const trendingError = ref(false);
  let requestVersion = 0;
  let trendingVersion = 0;
  async function loadRepositories() {
    const version = ++requestVersion;
    const owner = username.value;
    repositories.value = [];
    error.value = false;
    loading.value = !!owner;
    if (!owner) return;
    try {
      const { data } = await repoAPI.getUserOverview(owner, "updated", 7);
      if (version !== requestVersion || username.value !== owner) return;
      repositories.value = types
        .flatMap(({ type }) =>
          (data[`${type}s`] || []).map((repo) => ({ ...repo, type })),
        )
        .sort((a, b) =>
          (b.lastModified || b.createdAt || "").localeCompare(
            a.lastModified || a.createdAt || "",
          ),
        );
    } catch {
      if (version === requestVersion && username.value === owner)
        error.value = true;
    } finally {
      if (version === requestVersion && username.value === owner)
        loading.value = false;
    }
  }
  async function loadTrending() {
    const version = ++trendingVersion;
    const owner = username.value;
    const type = trendingType.value;
    trendingRepositories.value = [];
    trendingError.value = false;
    trendingLoading.value = !!owner;
    if (!owner) return;
    try {
      const { data } = await repoAPI.listRepos(type, {
        limit: 3,
        sort: "trending",
        fallback: false,
      });
      if (
        version !== trendingVersion ||
        username.value !== owner ||
        trendingType.value !== type
      )
        return;
      trendingRepositories.value = Array.isArray(data) ? data : [];
    } catch {
      if (
        version === trendingVersion &&
        username.value === owner &&
        trendingType.value === type
      )
        trendingError.value = true;
    } finally {
      if (
        version === trendingVersion &&
        username.value === owner &&
        trendingType.value === type
      )
        trendingLoading.value = false;
    }
  }
  watch(
    identity,
    (_, previous) => {
      organizations.value =
        username.value && previous === undefined
          ? (embeddedOrganizations() ?? authOrganizations.value)
          : [];
      filter.value = "";
      feedType.value = "all";
      personalExpanded.value = false;
      loadRepositories();
      if (trendingType.value !== "model") trendingType.value = "model";
      else loadTrending();
    },
    { immediate: true, flush: "sync" },
  );
  watch(
    authOrganizations,
    (value) => {
      organizations.value = username.value ? value : [];
    },
    { flush: "sync" },
  );
  watch(
    embeddedOrganizations,
    (value) => {
      if (value && username.value) organizations.value = value;
    },
    { flush: "sync" },
  );
  watch(trendingType, loadTrending, { flush: "sync" });
  onBeforeUnmount(() => {
    requestVersion++;
    trendingVersion++;
  });
  return {
    username,
    organizations,
    repositories,
    loading,
    error,
    filter,
    feedType,
    personalExpanded,
    trendingType,
    trendingRepositories,
    trendingLoading,
    trendingError,
    loadRepositories,
    loadTrending,
  };
}
