<template>
  <section v-if="auth.isAuthenticated" class="container-main py-8">
    <div class="card mx-auto max-w-md">
      <h1 class="text-2xl font-semibold mb-6">Access repository</h1>
      <p v-if="bindingNotice" class="mb-4" role="status">{{ bindingNotice }}</p>
      <el-form label-position="top" @submit.prevent="openRepository">
        <el-form-item label="Invitation code">
          <el-input
            v-model="token"
            type="password"
            show-password
            autocomplete="off"
            placeholder="Invitation code"
            aria-label="Invitation code"
            maxlength="256"
            :disabled="busy"
          />
        </el-form-item>
        <el-button
          type="primary"
          class="w-full"
          :loading="busy"
          @click="openRepository"
        >
          Open repository
        </el-button>
      </el-form>
    </div>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { repositoryAccessAPI } from "@/utils/api";
import {
  isAccountGrantActive,
  INACTIVE_GRANT_NOTICE,
} from "@/utils/repository-access";
import { notifyError, safeReturn } from "@/errors";
import { ElMessage } from "element-plus";

const auth = useAuthStore();
const router = useRouter();
const token = ref("");
const busy = ref(false);
const bindingNotice = ref("");
let generation = 0;
watch(
  () =>
    JSON.stringify([
      auth.isAuthenticated,
      auth.username,
      auth.user?.id,
      auth.token,
    ]),
  () => {
    generation++;
    token.value = "";
    busy.value = false;
    bindingNotice.value = "";
    if (!auth.isAuthenticated)
      router.replace({ path: "/login", query: { return: "/repo-access" } });
  },
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => {
  generation++;
  token.value = "";
});
async function openRepository() {
  if (busy.value || !auth.isAuthenticated) return;
  const code = token.value.trim();
  if (!code) {
    ElMessage.warning("Enter an invitation code");
    return;
  }
  const owner = generation;
  busy.value = true;
  bindingNotice.value = "";
  try {
    const { data } = await repositoryAccessAPI.redeem(code);
    if (owner !== generation) return;
    if (!isAccountGrantActive(data.grant)) {
      token.value = "";
      bindingNotice.value = INACTIVE_GRANT_NOTICE;
      return;
    }
    const target = data.repository_url;
    if (
      typeof target !== "string" ||
      safeReturn(target) !== target ||
      !/^\/(models|datasets|spaces)\/[^/?#]+\/[^/?#]+$/.test(target)
    )
      throw new Error("Could not open repository");
    token.value = "";
    await router.push(target);
  } catch (error) {
    if (owner === generation)
      notifyError(error, { fallback: "Could not open repository" });
  } finally {
    if (owner === generation) busy.value = false;
  }
}
</script>
