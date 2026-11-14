<template>
  <RepositoryAccessLayout
    :repository="repository"
    :access="access"
    :embedded="embedded"
  >
    <article
      class="card mdx"
      aria-label="Public invitation instructions"
      v-html="markdown"
    />
    <template #aside>
      <div class="card invitation-panel space-y-3">
        <h2 class="text-lg font-semibold">Request access</h2>
        <p v-if="requestState" role="status">
          Application status: {{ requestState.status }}
        </p>
        <el-button
          v-if="requestState?.status === 'approved' && auth.isAuthenticated"
          @click="$emit('changed')"
          >Check approved access</el-button
        >
        <template v-if="!requestState || requestState.status === 'rejected'">
          <p v-if="auth.isAuthenticated">Applying as {{ auth.username }}</p>
          <el-input
            v-else
            v-model="email"
            type="email"
            placeholder="Email address"
            aria-label="Application email"
          />
          <el-input
            v-model="message"
            type="textarea"
            placeholder="Reason for access"
            aria-label="Application message"
            maxlength="4000"
          />
          <el-button type="primary" :loading="busy" @click="apply"
            >Submit application</el-button
          >
        </template>
        <el-button v-if="requestState" :disabled="busy" @click="loadRequest"
          >Refresh application status</el-button
        >
        <button
          type="button"
          class="invitation-code-trigger"
          @click="codeDialogOpen = true"
        >
          Have an Invitation?
        </button>
      </div>
    </template>
  </RepositoryAccessLayout>
  <el-dialog
    v-model="codeDialogOpen"
    title="Repository invitation"
    width="min(440px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
  >
    <div class="space-y-3">
      <p v-if="bindingNotice" role="status">{{ bindingNotice }}</p>
      <label for="repository-invitation-code">Invitation code</label>
      <el-input
        id="repository-invitation-code"
        v-model="token"
        type="password"
        show-password
        autocomplete="off"
        placeholder="Invitation code"
        aria-label="Repository invitation code"
      />
    </div>
    <template #footer>
      <div class="invitation-actions">
        <el-button
          type="primary"
          v-if="auth.isAuthenticated"
          :loading="busy"
          @click="redeem(false)"
          >Bind to my account</el-button
        >
        <RouterLink
          v-else
          :to="registrationTarget"
          class="text-blue-500"
          @click.capture="prepareRegistration"
          @auxclick.capture="prepareRegistration"
          @contextmenu="prepareRegistration"
          >Create an account</RouterLink
        >
        <el-button :loading="busy" @click="redeem(true)"
          >Open temporary web preview</el-button
        >
      </div>
    </template>
  </el-dialog>
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
import RepositoryAccessLayout from "./RepositoryAccessLayout.vue";
import {
  createRepositoryRegistration,
  newRepositoryRegistrationId,
  repositoryRegistrationTarget,
} from "@/utils/repository-registration";
import "@/markdown-styles/base.css";
const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, required: true },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["changed"]);
const auth = useAuthStore();
const email = ref("");
const message = ref("");
const token = ref("");
const busy = ref(false);
const requestState = ref(null);
const bindingNotice = ref("");
const codeDialogOpen = ref(false);
const registrationId = ref(newRepositoryRegistrationId());
const registrationTarget = computed(() =>
  repositoryRegistrationTarget(props.repository, registrationId.value),
);
function prepareRegistration(event) {
  if (busy.value || !token.value.trim()) {
    event.preventDefault();
    if (!busy.value) ElMessage.warning("Enter an invitation code");
    return;
  }
  try {
    createRepositoryRegistration(
      props.repository,
      token.value,
      registrationId.value,
    );
  } catch (error) {
    event.preventDefault();
    notifyError(error, { fallback: "Could not carry repository invitation" });
  }
}
watch(
  codeDialogOpen,
  (open) => {
    if (!open) {
      token.value = "";
      bindingNotice.value = "";
    }
  },
  { flush: "sync" },
);
let generation = 0;
let statusSequence = 0;
const receiptKey = computed(
  () => `repository-request:${JSON.stringify(props.repository)}`,
);
const markdown = computed(() =>
  renderPublicInviteMarkdown(
    props.access.invite_markdown ||
      "# Request repository access\nApply for access or use a repository invitation.",
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
    codeDialogOpen.value = false;
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
    registrationId.value = newRepositoryRegistrationId();
    requestState.value = null;
    bindingNotice.value = "";
    codeDialogOpen.value = false;
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

<style scoped>
.invitation-panel {
  padding: 24px;
}
.invitation-panel :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
.invitation-code-trigger {
  display: block;
  width: fit-content;
  margin-inline: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--site-link);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  text-underline-offset: 3px;
}
.invitation-code-trigger:hover {
  text-decoration: underline;
}
.invitation-code-trigger:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
.invitation-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}
.invitation-actions :deep(.el-button) {
  margin-left: 0;
}
</style>
