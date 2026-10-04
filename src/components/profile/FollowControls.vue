<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router/auto";
import { useAuthStore } from "@/stores/auth";
import { socialAPI } from "@/utils/api";
import { getAuthIdentity } from "@/utils/auth-identity";
import FollowListDialog from "./FollowListDialog.vue";

const props = defineProps({ username: { type: String, required: true } });
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const state = ref(null);
const loading = ref(false);
const writing = ref(false);
const error = ref("");
const dialogOpen = ref(false);
const dialogKind = ref("followers");
let version = 0;
const identity = computed(() => getAuthIdentity(auth));
const isSelf = computed(
  () => auth.isAuthenticated && auth.username === props.username,
);
const followAllowed = computed(
  () => !auth.isAuthenticated || Boolean(state.value?.can_follow),
);
async function loadState() {
  if (loading.value || !props.username) return;
  const request = version;
  loading.value = true;
  error.value = "";
  try {
    const { data } = await socialAPI.getFollowState(props.username);
    if (request === version) state.value = data;
  } catch (failure) {
    if (request === version)
      error.value = "Could not load follow information. Please try again.";
  } finally {
    if (request === version) loading.value = false;
  }
}
function login() {
  router.push({ path: "/login", query: { return: route.fullPath } });
}
async function toggleFollow() {
  if (writing.value || loading.value || !state.value || isSelf.value) return;
  if (!auth.isAuthenticated) {
    login();
    return;
  }
  if (!followAllowed.value) return;
  const request = version;
  const username = props.username;
  writing.value = true;
  error.value = "";
  try {
    const { data } = await (
      state.value.following ? socialAPI.unfollow : socialAPI.follow
    )(username);
    if (request !== version) return;
    state.value = data;
    window.dispatchEvent(
      new CustomEvent("hub-follow-changed", { detail: { username } }),
    );
  } catch (failure) {
    if (request !== version) return;
    error.value = "Could not update follow status. Please try again.";
    if (failure.response?.status === 401) login();
  } finally {
    if (request === version) writing.value = false;
  }
}
function openList(kind) {
  dialogKind.value = kind;
  dialogOpen.value = true;
}
watch(
  () => [props.username, identity.value],
  () => {
    version++;
    state.value = null;
    loading.value = false;
    writing.value = false;
    error.value = "";
    dialogOpen.value = false;
    void loadState();
  },
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => version++);
</script>

<template>
  <section
    class="follow-controls"
    aria-label="Follow information"
    :aria-busy="loading || writing"
  >
    <div v-if="state" class="follow-counts">
      <button type="button" @click="openList('followers')">
        <strong>{{ state.followers_count.toLocaleString() }}</strong> followers
      </button>
      <button type="button" @click="openList('following')">
        <strong>{{ state.following_count.toLocaleString() }}</strong> following
      </button>
    </div>
    <el-button
      v-if="!isSelf && state"
      :type="state.following ? 'default' : 'primary'"
      :loading="writing"
      :disabled="loading || writing || !followAllowed"
      :aria-pressed="Boolean(state.following)"
      :title="
        !followAllowed
          ? 'Following is unavailable for this account.'
          : undefined
      "
      class="follow-button"
      @click="toggleFollow"
      >{{ state.following ? "Following" : "Follow" }}</el-button
    >
    <p v-if="loading" class="follow-status" role="status">
      Loading follow information…
    </p>
    <p v-if="error" class="follow-error" role="alert">{{ error }}</p>
    <el-button
      v-if="error && !state"
      size="small"
      :loading="loading"
      @click="loadState"
      >Try again</el-button
    >
    <FollowListDialog
      v-model="dialogOpen"
      :username="username"
      :kind="dialogKind"
      :identity="identity"
    />
  </section>
</template>

<style scoped>
.follow-controls {
  margin: 16px 0;
  min-width: 0;
}
.follow-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 12px;
}
.follow-counts button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--site-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.follow-counts strong {
  font-weight: 600;
  color: var(--site-card-text);
}
.follow-counts button:hover {
  color: var(--site-link);
}
.follow-counts button:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
  border-radius: 3px;
}
.follow-button {
  width: 100%;
}
.follow-status {
  font-size: 12px;
  color: var(--site-muted);
}
.follow-error {
  margin: 8px 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
