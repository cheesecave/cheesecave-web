<template>
  <section class="container-main py-8 max-w-xl space-y-5">
    <h1 class="text-2xl font-semibold">Bind a repository invitation</h1>
    <p>
      Use a code to grant your account read access to one private or invite
      repository, including normal downloads with your own personal token.
    </p>
    <RouterLink
      v-if="!auth.isAuthenticated"
      :to="{ path: '/login', query: { return: '/repo-access' } }"
      class="text-blue-500"
      >Sign in to bind a code</RouterLink
    >
    <p v-if="bindingNotice" role="status">{{ bindingNotice }}</p>
    <div class="space-y-5">
      <el-select v-model="repository.type" aria-label="Repository type"
        ><el-option label="Model" value="model" /><el-option
          label="Dataset"
          value="dataset" /><el-option label="Space" value="space"
      /></el-select>
      <el-input
        v-model="repository.namespace"
        placeholder="Repository owner or organization"
        aria-label="Repository namespace"
      />
      <el-input
        v-model="repository.name"
        placeholder="Repository name"
        aria-label="Repository name"
      />
      <el-input
        v-model="token"
        type="password"
        show-password
        autocomplete="off"
        placeholder="Repository invitation code"
        aria-label="Repository invitation code"
      />
      <el-button v-if="auth.isAuthenticated" :loading="busy" @click="bind"
        >Bind to my account</el-button
      >
      <el-button :loading="busy" @click="openGuest"
        >Open temporary web preview</el-button
      >
      <p class="text-sm text-gray-500">
        Temporary previews prohibit original files and bulk downloads. Displayed
        content can still be copied or saved. Your existing sign-in stays
        unchanged.
      </p>
      <RouterLink
        v-if="bound"
        :to="`/${bound.type}s/${encodeURIComponent(bound.namespace)}/${encodeURIComponent(bound.name)}`"
        class="text-blue-500"
        >Open repository</RouterLink
      >
    </div>
  </section>
</template>
<script setup>
import { reactive, ref, watch, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { repositoryAccessAPI } from "@/utils/api";
import {
  isAccountGrantActive,
  INACTIVE_GRANT_NOTICE,
} from "@/utils/repository-access";
import { notifyError } from "@/errors";
import { ElMessage } from "element-plus";
const auth = useAuthStore();
const repository = reactive({ type: "model", namespace: "", name: "" });
const token = ref("");
const busy = ref(false);
const bound = ref(null);
const bindingNotice = ref("");
let generation = 0;
watch(
  () => JSON.stringify([repository, auth.username, auth.token]),
  () => {
    generation++;
    bound.value = null;
    bindingNotice.value = "";
    busy.value = false;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  generation++;
});
const bind = () => redeem(false);
const openGuest = () => redeem(true);
async function redeem(guest) {
  if (busy.value || (!guest && !auth.isAuthenticated)) return;
  if (
    !token.value.trim() ||
    !repository.namespace.trim() ||
    !repository.name.trim() ||
    /[\\/]/.test(repository.namespace + repository.name)
  ) {
    ElMessage.warning("Enter the repository owner, name and invitation code");
    return;
  }
  const owner = generation;
  busy.value = true;
  bound.value = null;
  bindingNotice.value = "";
  const target = {
    type: repository.type,
    namespace: repository.namespace.trim(),
    name: repository.name.trim(),
  };
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
    bound.value = target;
    ElMessage.success(
      guest ? "Temporary preview is ready" : "Repository access granted",
    );
  } catch (error) {
    if (owner === generation)
      notifyError(error, {
        fallback: guest
          ? "Could not open temporary preview"
          : "Could not bind repository invitation",
      });
  } finally {
    if (owner === generation) busy.value = false;
  }
}
</script>
