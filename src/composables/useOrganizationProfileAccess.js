import { computed, onBeforeUnmount, onMounted, ref, toValue, watch } from "vue";
import { getLocalProfileType } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { KIND, decodeError } from "@/errors";
import { getAuthIdentity } from "@/utils/auth-identity";

/** Load local identity and current membership independently of profile content. */
export function useOrganizationProfileAccess(orgname) {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const initialIdentity = getAuthIdentity(auth);
  let identityVersion = 0;
  let roleVersion = 0;
  let active = true;
  let mounted = false;
  const localType = ref(null);
  const identityLoading = ref(true);
  const identityError = ref(null);
  const identityMissing = ref(false);
  const userRole = ref(null);
  const roleLoading = ref(auth.isAuthenticated);
  const roleError = ref(null);
  const localOrgReady = computed(() => localType.value === "org");
  const isMember = computed(
    () => localOrgReady.value && Boolean(userRole.value),
  );
  const canManage = computed(
    () => isMember.value && ["admin", "super-admin"].includes(userRole.value),
  );
  const requestedVisitorView = computed(() => route.query.view === "visitor");
  const visitorView = computed(
    () => isMember.value && requestedVisitorView.value,
  );
  const publicOnly = computed(
    () =>
      requestedVisitorView.value || getAuthIdentity(auth) !== initialIdentity,
  );

  function toggleVisitorView() {
    if (!isMember.value) return;
    const query = { ...route.query };
    if (visitorView.value) delete query.view;
    else query.view = "visitor";
    return router.replace({ query, hash: route.hash });
  }

  function profileLink(path) {
    return requestedVisitorView.value ? `${path}?view=visitor` : path;
  }

  function visibleRepos(repos = []) {
    return publicOnly.value ? repos.filter((repo) => !repo.private) : repos;
  }

  async function reloadIdentity() {
    if (!active) return;
    const request = ++identityVersion;
    const namespace = toValue(orgname);
    const isCurrent = () =>
      active && request === identityVersion && namespace === toValue(orgname);
    localType.value = null;
    identityError.value = null;
    identityMissing.value = false;
    identityLoading.value = true;
    try {
      const { data } = await getLocalProfileType(namespace);
      if (!isCurrent()) return;
      localType.value = data.type;
      identityMissing.value = data.type === "user";
    } catch (error) {
      if (!isCurrent()) return;
      const decoded = decodeError(error);
      if (decoded.status === 404) identityMissing.value = true;
      else if (decoded.kind !== KIND.CANCELLED) identityError.value = decoded;
    } finally {
      if (isCurrent()) identityLoading.value = false;
    }
  }

  async function reloadRole() {
    if (!active) return;
    const request = ++roleVersion;
    const namespace = toValue(orgname);
    const identity = getAuthIdentity(auth);
    const username = auth.username;
    const isCurrent = () =>
      active &&
      request === roleVersion &&
      namespace === toValue(orgname) &&
      identity === getAuthIdentity(auth);
    userRole.value = null;
    roleError.value = null;
    if (!auth.isAuthenticated) {
      roleLoading.value = false;
      return;
    }
    roleLoading.value = true;
    try {
      const data = await auth.fetchUserInfo();
      if (!isCurrent() || data.name !== username) return;
      const membership = data.orgs?.find((org) => org.name === namespace);
      userRole.value = membership?.roleInOrg || membership?.role || null;
    } catch (error) {
      if (!isCurrent()) return;
      const decoded = decodeError(error);
      if (decoded.kind !== KIND.CANCELLED) roleError.value = decoded;
    } finally {
      if (isCurrent()) roleLoading.value = false;
    }
  }

  onMounted(() => {
    mounted = true;
    void reloadIdentity();
    void reloadRole();
  });
  watch(
    [() => toValue(orgname), () => getAuthIdentity(auth)],
    ([namespace], [previousNamespace]) => {
      if (!mounted) return;
      if (namespace !== previousNamespace) void reloadIdentity();
      void reloadRole();
    },
    { flush: "sync" },
  );
  onBeforeUnmount(() => {
    active = false;
    identityVersion++;
    roleVersion++;
  });

  return {
    localOrgReady,
    identityLoading,
    identityError,
    identityMissing,
    reloadIdentity,
    userRole,
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
  };
}
