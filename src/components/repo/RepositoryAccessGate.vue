<template>
  <RepositoryHeader
    v-if="sharedHeader && repository"
    v-bind="headerProps"
    @copy="copyHeaderId"
    @clone="invokeHeader('clone')"
    @download="invokeHeader('download')"
    @like="invokeHeader('like')"
  >
    <template v-if="access?.access === 'guest' && !loading && !error" #actions>
      <el-button @click="leaveGuest">End temporary access</el-button>
    </template>
    <template v-if="headerMetadata" #metadata>
      <MetadataHeader
        :metadata="headerMetadata"
        :repo-type="repository.type"
        :libraries="headerTagGroups.libraries"
        :others="headerTagGroups.others"
        :arxiv="headerTagGroups.arxiv"
        @navigate-to-metadata="navigateGuest('metadata')"
      />
    </template>
  </RepositoryHeader>
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
    embedded
    @changed="reload"
  />
  <RestrictedRepositoryViewer
    v-else-if="access?.access === 'guest'"
    :repository="repository"
    :access="access"
    embedded
    :view="guestView"
    :path="guestLocation.path"
    :file-path="guestLocation.filePath"
    :branch="guestLocation.branch"
    @overview="guestOverview = $event"
    @navigate="navigateGuest"
    @open-file="openGuestFile"
    @open-folder="openGuestFolder"
    @changed="reload"
  />
</template>

<script setup>
import {
  computed,
  ref,
  shallowRef,
  watch,
  provide,
  onBeforeUnmount,
} from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";
import { repositoryAccessAPI } from "@/utils/api";
import {
  repositoryFromRoute,
  guestRepositoryTabs,
} from "@/utils/repository-access";
import { splitTags } from "@/utils/repo-derived";
import { copyToClipboard } from "@/utils/clipboard";
import { decodeError } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import RepositoryInvitationPage from "./RepositoryInvitationPage.vue";
import RestrictedRepositoryViewer from "./RestrictedRepositoryViewer.vue";
import RepositoryHeader from "./RepositoryHeader.vue";
import MetadataHeader from "./metadata/MetadataHeader.vue";

const props = defineProps({
  route: { type: Object, required: true },
  component: { type: [Object, Function], default: null },
  componentKey: { type: String, default: "" },
});
const auth = useAuthStore();
const router = useRouter();
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
const sharedHeader = ref(false);
const normalHeaderState = shallowRef(null);
const guestOverview = shallowRef(null);
const forcedGuestView = ref(null);
const headerBridge = {
  enabled: computed(
    () =>
      sharedHeader.value &&
      !loading.value &&
      !error.value &&
      access.value?.access === "full",
  ),
  state: normalHeaderState,
};
provide("repositoryHeaderBridge", headerBridge);
const fullHeader = computed(() =>
  headerBridge.enabled.value ? normalHeaderState.value : null,
);
const guestView = computed(() => {
  if (forcedGuestView.value) return forcedGuestView.value;
  if (props.route.query?.tab === "metadata") return "metadata";
  const section = (props.route.path || "").split("/")[4];
  if (["commits", "commit"].includes(section)) return "commits";
  if (["tree", "blob"].includes(section)) return "files";
  return "card";
});
function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
const guestLocation = computed(() => {
  const parts = (props.route.path || "").split("/").slice(4);
  const path = parts.slice(2).map(decodeRouteSegment).join("/");
  const branch = ["blob", "tree", "commits"].includes(parts[0])
    ? decodeRouteSegment(parts[1] || "main")
    : "main";
  return parts[0] === "blob"
    ? { path: path.split("/").slice(0, -1).join("/"), filePath: path, branch }
    : { path: parts[0] === "tree" ? path : "", filePath: "", branch };
});
const headerMetadata = computed(() => {
  const metadata = fullHeader.value?.hasMetadataHeader
    ? fullHeader.value.metadata
    : access.value?.access === "guest" && !error.value
      ? guestOverview.value?.card_metadata || guestOverview.value?.metadata
      : null;
  return metadata && Object.keys(metadata).length ? metadata : null;
});
const headerTagGroups = computed(
  () =>
    fullHeader.value?.tagGroups ||
    (repository.value?.type === "model" && headerMetadata.value
      ? splitTags(headerMetadata.value.tags, {
          libraryName: headerMetadata.value.library_name,
          pipelineTag: headerMetadata.value.pipeline_tag,
          languages: [].concat(headerMetadata.value.language || []),
        })
      : { libraries: [], others: [], arxiv: [] }),
);
const headerProps = computed(() => {
  const normal = fullHeader.value;
  const target = repository.value;
  const path = `/${target.type}s/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.name)}`;
  const inviteTabs = [
    { key: "card", label: "Invitation", to: path },
    {
      key: "files",
      label: "Files",
      disabledReason: "Repository access is required",
    },
    {
      key: "metadata",
      label: "Metadata",
      disabledReason: "Repository access is required",
    },
  ];
  return {
    repoType: target.type,
    namespace: target.namespace,
    name: target.name,
    namespaceLink: normal?.namespaceLink || `/${target.namespace}`,
    repoInfo: normal?.repoInfo || null,
    visibility:
      access.value?.visibility === "public"
        ? null
        : ["invite", "private"].includes(access.value?.visibility)
          ? access.value.visibility
          : "invite",
    signedIn: normal?.signedIn || false,
    isOwner: normal?.isOwner || false,
    liked: normal?.liked || false,
    likesCount: normal?.likesCount || 0,
    liking: normal?.liking || false,
    tabs:
      normal?.tabs ||
      (access.value?.access === "guest"
        ? guestRepositoryTabs(target)
        : inviteTabs),
    activeTab:
      normal?.activeTab ||
      (access.value?.access === "guest" ? guestView.value : "card"),
  };
});
function navigateGuest(view) {
  if (fullHeader.value?.navigate) return fullHeader.value.navigate(view);
  forcedGuestView.value = view;
  const target = guestRepositoryTabs(repository.value).find(
    (item) => item.key === view,
  );
  if (target && router) return router.push(target.to);
}
function guestTarget(kind, path) {
  const target = repository.value;
  return `/${target.type}s/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.name)}/${kind}/main${path ? "/" + path.split("/").map(encodeURIComponent).join("/") : ""}`;
}
function openGuestFile(path) {
  if (router) return router.push(guestTarget("blob", path));
}
function openGuestFolder(path) {
  if (router) return router.push(guestTarget("tree", path));
}
async function copyHeaderId() {
  if (fullHeader.value?.copy) return fullHeader.value.copy();
  const copied = await copyToClipboard(
    `${repository.value.namespace}/${repository.value.name}`,
  );
  if (copied) ElMessage.success("Repository ID copied to clipboard");
  else ElMessage.error("Failed to copy repository ID");
}
function invokeHeader(action) {
  return fullHeader.value?.[action]?.();
}
async function leaveGuest() {
  try {
    await repositoryAccessAPI.leaveGuest(repository.value);
    await reload();
  } catch (cause) {
    error.value = decodeError(cause);
  }
}
watch(
  () => [props.route.path, props.route.query?.tab],
  () => {
    forcedGuestView.value = null;
  },
);
const cacheGeneration = ref(0);
let cacheIdentity = authIdentity.value;
const allowed = computed(
  () =>
    !repository.value ||
    (!loading.value &&
      !error.value &&
      ["full", "standard"].includes(access.value?.access)),
);
let sequence = 0;
provide("repositoryAccess", access);
provide("reloadRepositoryAccess", reload);
let resourceIdentity = "";
async function reload() {
  const request = ++sequence;
  const identity = authIdentity.value;
  const resource = JSON.stringify(repository.value);
  if (resource !== resourceIdentity) {
    sharedHeader.value = false;
    access.value = null;
    guestOverview.value = null;
    resourceIdentity = resource;
    cacheGeneration.value++;
  }
  normalHeaderState.value = null;
  if (identity !== cacheIdentity) {
    cacheGeneration.value++;
    cacheIdentity = identity;
    access.value = null;
    guestOverview.value = null;
  }
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
    if (["invite", "guest"].includes(data.access)) sharedHeader.value = true;
    if (data.access === "standard") sharedHeader.value = false;
    if (data.access !== "guest") guestOverview.value = null;
    access.value = data;
  } catch (cause) {
    if (request === sequence) {
      cacheGeneration.value++;
      error.value = decodeError(cause);
      normalHeaderState.value = null;
      guestOverview.value = null;
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
