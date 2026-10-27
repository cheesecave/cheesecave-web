import { computed, unref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getAuthIdentity } from "@/utils/auth-identity";

/** Preview public profile content without changing the signed-in session. */
export function useProfileView(username, localUserReady) {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const initialIdentity = getAuthIdentity(auth);
  const matchesOwner = computed(
    () => auth.isAuthenticated && auth.username === unref(username),
  );
  const isOwnProfile = computed(
    () => unref(localUserReady) && matchesOwner.value,
  );
  // Filter early responses even while a legacy profile's source is unresolved.
  const requestedVisitorView = computed(
    () => matchesOwner.value && route.query.view === "visitor",
  );
  const visitorView = computed(
    () => isOwnProfile.value && requestedVisitorView.value,
  );
  // Cached owner data must remain hidden if the account changes during preview.
  const publicOnly = computed(
    () =>
      requestedVisitorView.value ||
      (getAuthIdentity(auth) !== initialIdentity && !matchesOwner.value),
  );
  function toggleVisitorView() {
    if (!isOwnProfile.value) return;
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
  return {
    isOwnProfile,
    visitorView,
    publicOnly,
    toggleVisitorView,
    profileLink,
    visibleRepos,
  };
}
