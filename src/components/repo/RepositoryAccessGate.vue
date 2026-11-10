<template>
  <keep-alive :include="['RepoViewer']" :key="cacheGeneration"
    ><component v-if="allowed && component" :is="component" :key="componentKey"
  /></keep-alive>
  <slot v-if="allowed && !component" />
  <div v-if="repository && loading" class="container-main py-12" role="status">
    Checking repository access…
  </div>
  <ErrorState
    v-else-if="error"
    :error="error"
    mode="inline-panel"
    :retry="reload"
  />
  <RepositoryInvitationPage
    v-else-if="access?.access === 'invite'"
    :repository="repository"
    :access="access"
    @changed="reload"
  />
  <RestrictedRepositoryViewer
    v-else-if="access?.access === 'guest'"
    :repository="repository"
    @changed="reload"
  />
</template>

<script setup>
import { computed, ref, watch, provide, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { repositoryAccessAPI } from "@/utils/api";
import { repositoryFromRoute } from "@/utils/repository-access";
import { decodeError } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import RepositoryInvitationPage from "./RepositoryInvitationPage.vue";
import RestrictedRepositoryViewer from "./RestrictedRepositoryViewer.vue";

const props = defineProps({
  route: { type: Object, required: true },
  component: { type: [Object, Function], default: null },
  componentKey: { type: String, default: "" },
});
const auth = useAuthStore();
const authIdentity = computed(() =>
  JSON.stringify([
    auth.isAuthenticated,
    auth.username,
    auth.user?.id,
    auth.user?.is_org,
    auth.user?.is_active,
    auth.token,
  ]),
);
const repository = computed(() => repositoryFromRoute(props.route));
const access = ref(null);
const loading = ref(false);
const error = ref(null);
const cacheGeneration = ref(0);
let cacheIdentity = authIdentity.value;
const allowed = computed(
  () =>
    !repository.value || ["full", "standard"].includes(access.value?.access),
);
let sequence = 0;
provide("repositoryAccess", access);
provide("reloadRepositoryAccess", reload);
async function reload() {
  const request = ++sequence;
  const identity = authIdentity.value;
  if (identity !== cacheIdentity) {
    cacheGeneration.value++;
    cacheIdentity = identity;
  }
  access.value = null;
  error.value = null;
  if (!repository.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const { data } = await repositoryAccessAPI.getAccess(repository.value);
    if (request !== sequence) return;
    if (!["full", "standard", "invite", "guest"].includes(data?.access))
      throw new Error("Repository access could not be established");
    if (data.access !== "full") cacheGeneration.value++;
    access.value = data;
  } catch (cause) {
    if (request === sequence) {
      cacheGeneration.value++;
      error.value = decodeError(cause);
    }
  } finally {
    if (request === sequence) loading.value = false;
  }
}
watch(
  [() => JSON.stringify(repository.value), () => authIdentity.value],
  reload,
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => {
  sequence++;
});
</script>
