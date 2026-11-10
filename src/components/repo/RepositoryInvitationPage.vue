<template>
  <section class="container-main py-8 max-w-3xl space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ repository.namespace }}/{{ repository.name }}
    </h1>
    <p class="text-sm text-gray-500">
      Invite repository · Access requires approval or a repository invitation.
    </p>
    <div class="card prose dark:prose-invert" v-html="markdown" />
    <div class="card space-y-3">
      <h2 class="text-lg font-semibold">Request access</h2>
      <p v-if="requestState" role="status">
        Application status: {{ requestState.status }}
      </p>
      <el-button
        v-if="requestState?.status === 'approved' && auth.isAuthenticated"
        @click="$emit('changed')"
        >Check approved access</el-button
      >
      <p v-if="auth.isAuthenticated">
        Applying as {{ auth.username }}. Approval grants this account read
        access to this repository.
      </p>
      <el-input
        v-else
        v-model="email"
        type="email"
        placeholder="Email required for anonymous requests"
        aria-label="Application email"
      />
      <el-input
        v-model="message"
        type="textarea"
        placeholder="Tell the manager why you need access"
        aria-label="Application message"
        maxlength="4000"
      />
      <el-button :loading="busy" @click="apply">Submit application</el-button>
      <el-button :disabled="busy" @click="loadRequest"
        >Refresh application status</el-button
      >
    </div>
    <div class="card space-y-3">
      <h2 class="text-lg font-semibold">Have a repository invitation code?</h2>
      <p v-if="bindingNotice" role="status">{{ bindingNotice }}</p>
      <el-input
        v-model="token"
        type="password"
        show-password
        autocomplete="off"
        placeholder="Repository invitation code"
        aria-label="Repository invitation code"
      />
      <el-button
        v-if="auth.isAuthenticated"
        :loading="busy"
        @click="redeem(false)"
        >Bind to my account</el-button
      >
      <RouterLink v-else :to="{ path: '/register' }" class="text-blue-500"
        >Create an account, then enter your repository code</RouterLink
      >
      <el-button :loading="busy" @click="redeem(true)"
        >Open temporary web preview</el-button
      >
      <p class="text-sm text-gray-500">
        Temporary previews do not allow original files or bulk downloads.
        Displayed content may still be copied or saved.
      </p>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { repositoryAccessAPI } from "@/utils/api";
import {
  isAccountGrantActive,
  INACTIVE_GRANT_NOTICE,
  renderPublicInviteMarkdown,
} from "@/utils/repository-access";
import { notifyError } from "@/errors";
import { ElMessage } from "element-plus";
const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);
const auth = useAuthStore();
const email = ref("");
const message = ref("");
const token = ref("");
const busy = ref(false);
const requestState = ref(null);
const bindingNotice = ref("");
let generation = 0;
let statusSequence = 0;
const receiptKey = computed(
  () => `repository-request:${JSON.stringify(props.repository)}`,
);
const markdown = computed(() =>
  renderPublicInviteMarkdown(
    props.access.invite_markdown ||
      "# Request repository access\nThis private repository accepts access applications. Submit an application below.",
  ),
);
async function loadRequest() {
  const owner = generation;
  const request = ++statusSequence;
  const target = { ...props.repository };
  const key = receiptKey.value;
  try {
    const { data } = await repositoryAccessAPI.getRequest(
      target,
      sessionStorage.getItem(key),
    );
    if (owner === generation && request === statusSequence)
      requestState.value = data.request;
  } catch (error) {
    if (owner === generation && request === statusSequence)
      notifyError(error, { fallback: "Could not load application status" });
  }
}
async function apply() {
  if (
    !auth.isAuthenticated &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
  ) {
    ElMessage.warning("Enter a valid email address");
    return;
  }
  if (busy.value) return;
  const owner = generation;
  const request = ++statusSequence;
  const target = { ...props.repository };
  const key = receiptKey.value;
  busy.value = true;
  try {
    const { data } = await repositoryAccessAPI.request(target, {
      ...(auth.isAuthenticated ? {} : { email: email.value.trim() }),
      message: message.value,
    });
    if (owner !== generation || request !== statusSequence) return;
    requestState.value = data.request;
    if (data.receipt) sessionStorage.setItem(key, data.receipt);
    ElMessage.success("Application submitted for review");
  } catch (error) {
    if (owner === generation)
      notifyError(error, { fallback: "Could not submit application" });
  } finally {
    if (owner === generation) busy.value = false;
  }
}
async function redeem(guest) {
  if (!token.value.trim() || busy.value) return;
  const owner = generation;
  const target = { ...props.repository };
  bindingNotice.value = "";
  busy.value = true;
  try {
    const { data } = await (
      guest ? repositoryAccessAPI.guest : repositoryAccessAPI.bind
    )(target, token.value.trim());
    if (owner !== generation) return;
    token.value = "";
    if (!guest && !isAccountGrantActive(data.grant)) {
      bindingNotice.value = INACTIVE_GRANT_NOTICE;
      ElMessage.warning(INACTIVE_GRANT_NOTICE);
      return;
    }
    emit("changed");
  } catch (error) {
    if (owner === generation)
      notifyError(error, {
        fallback: "Could not redeem repository invitation",
      });
  } finally {
    if (owner === generation) busy.value = false;
  }
}
watch(
  () => JSON.stringify(props.repository),
  () => {
    generation++;
    requestState.value = null;
    bindingNotice.value = "";
    token.value = "";
    busy.value = false;
    loadRequest();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
</script>
