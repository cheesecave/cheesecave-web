import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { workspaceAPI } from "@/utils/api";
import { getAuthIdentity } from "@/utils/auth-identity";

export function useWorkspaceActivity(organizations = null) {
  const authStore = useAuthStore();
  const { username } = storeToRefs(authStore);
  const identity = computed(() => getAuthIdentity(authStore));
  const scope = ref("all");
  const type = ref("all");
  const items = ref([]);
  const loading = ref(false);
  const error = ref(false);
  const hasMore = ref(false);
  const cursor = ref(null);
  let sequence = 0;
  let disposed = false;
  let resetting = false;
  let failedAppend = false;
  function clear() {
    sequence++;
    items.value = [];
    cursor.value = null;
    hasMore.value = false;
    error.value = false;
    loading.value = false;
  }
  async function load(append = false) {
    if (!username.value || disposed) return;
    const version = ++sequence;
    const owner = identity.value;
    const organization = scope.value.startsWith("org:")
      ? scope.value.slice(4)
      : null;
    const params = {
      scope: organization ? "organization" : scope.value,
      ...(organization ? { organization } : {}),
      repo_type: type.value === "likes" ? "all" : type.value,
      ...(type.value !== "all"
        ? { event_type: type.value === "likes" ? "like" : "repository" }
        : {}),
      limit: 20,
    };
    if (append && cursor.value) params.cursor = cursor.value;
    loading.value = true;
    error.value = false;
    failedAppend = append;
    try {
      const { data } = await workspaceAPI.getFeed(params);
      if (disposed || sequence !== version || identity.value !== owner) return;
      const seen = new Set();
      items.value = [
        ...(append ? items.value : []),
        ...(data.items || []),
      ].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      cursor.value = data.next_cursor || null;
      hasMore.value = !!data.has_more && !!cursor.value;
    } catch (failure) {
      if (!disposed && version === sequence && identity.value === owner) {
        if ([401, 403].includes(failure?.response?.status)) {
          items.value = [];
          cursor.value = null;
          hasMore.value = false;
          failedAppend = false;
        }
        error.value = true;
      }
    } finally {
      if (!disposed && version === sequence && identity.value === owner)
        loading.value = false;
    }
  }
  function setFilters(nextScope, nextType = "all") {
    if (scope.value === nextScope && type.value === nextType) return;
    resetting = true;
    scope.value = nextScope;
    type.value = nextType;
    resetting = false;
    clear();
    refresh();
  }
  const refresh = () => load(false);
  const loadMore = () => {
    if (!loading.value && hasMore.value) return load(true);
  };
  const retry = () => load(failedAppend);
  watch(
    [scope, type],
    () => {
      if (resetting) return;
      clear();
      refresh();
    },
    { flush: "sync" },
  );
  watch(
    identity,
    () => {
      clear();
      resetting = true;
      scope.value = "all";
      type.value = "all";
      resetting = false;
      refresh();
    },
    { immediate: true, flush: "sync" },
  );
  watch(
    () =>
      (organizations?.value ?? authStore.organizations).map((org) => org.name),
    (names) => {
      if (
        scope.value.startsWith("org:") &&
        !names.includes(scope.value.slice(4))
      )
        scope.value = "all";
    },
    { flush: "sync" },
  );
  function followChanged() {
    if (["all", "following"].includes(scope.value)) refresh();
  }
  onMounted(() => window.addEventListener("hub-follow-changed", followChanged));
  onBeforeUnmount(() => {
    disposed = true;
    sequence++;
    window.removeEventListener("hub-follow-changed", followChanged);
  });
  return {
    scope,
    type,
    items,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
    retry,
    setFilters,
  };
}
