import { computed, onBeforeUnmount, onMounted, ref, toValue, watch } from "vue";
import { getLocalProfileType } from "@/utils/api";
import { KIND, decodeError } from "@/errors";

/** Resolve local account controls and organization routing independently of page content. */
export function useUserProfileIdentity(username, organizationPath) {
  const router = useRouter();
  const localType = ref(null);
  const identityLoading = ref(true);
  const identityError = ref(null);
  const identityMissing = ref(false);
  const localUserReady = computed(() => localType.value === "user");
  const isOrganization = computed(() => localType.value === "org");
  let version = 0;
  let active = true;
  let mounted = false;

  const isCurrent = (request, namespace) =>
    active && request === version && namespace === toValue(username);

  async function reloadIdentity() {
    if (!active) return;
    const request = ++version;
    const namespace = toValue(username);
    let lookupSucceeded = false;
    localType.value = null;
    identityError.value = null;
    identityMissing.value = false;
    identityLoading.value = true;
    try {
      const { data } = await getLocalProfileType(namespace);
      if (!isCurrent(request, namespace)) return;
      lookupSucceeded = true;
      localType.value = data.type;
      if (isOrganization.value) await router.replace(toValue(organizationPath));
    } catch (error) {
      if (!isCurrent(request, namespace)) return;
      const decoded = decodeError(error);
      // A local miss may still be an external profile; its own lookup decides that.
      if (decoded.status === 404 && !lookupSucceeded) {
        identityMissing.value = true;
      } else if (decoded.kind !== KIND.CANCELLED) {
        identityError.value = decoded;
      }
    } finally {
      if (isCurrent(request, namespace)) identityLoading.value = false;
    }
  }

  onMounted(() => {
    mounted = true;
    void reloadIdentity();
  });
  watch(
    () => toValue(username),
    () => {
      if (mounted) void reloadIdentity();
    },
    { flush: "sync" },
  );
  onBeforeUnmount(() => {
    active = false;
    version++;
  });

  return {
    localUserReady,
    isOrganization,
    identityLoading,
    identityError,
    identityMissing,
    reloadIdentity,
  };
}
