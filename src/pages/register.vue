<!-- src/kohaku-hub-ui/src/pages/register.vue -->
<template>
  <div class="min-h-[calc(100vh-16rem)] flex items-center justify-center">
    <div class="card w-full max-w-md">
      <h1 class="text-2xl font-bold mb-6 text-center">Create Account</h1>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="Username" prop="username">
          <el-input
            v-model="form.username"
            placeholder="Choose a username"
            size="large"
          />
        </el-form-item>

        <el-form-item label="Email" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            placeholder="your@email.com"
            size="large"
          />
        </el-form-item>

        <el-form-item
          v-if="showInvitationInput"
          label="Invitation code"
          prop="invitationCode"
        >
          <el-input
            v-model="form.invitationCode"
            type="password"
            show-password
            autocomplete="off"
            placeholder="Invitation code"
            aria-label="Invitation code"
            :required="invitationRequired"
            maxlength="256"
          />
        </el-form-item>

        <el-form-item label="Password" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="Create a password"
            size="large"
            show-password
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="w-full"
          :loading="loading"
          :disabled="!siteConfig"
          @click="handleSubmit"
        >
          Sign Up
        </el-button>
      </el-form>

      <div class="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?
        <RouterLink
          to="/login"
          class="text-blue-500 dark:text-blue-400 hover:underline"
        >
          Login
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { notifyError, safeReturn } from "@/errors";
import { useAuthStore } from "@/stores/auth";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import axios from "axios";
import { passwordProblem } from "@/utils/password-policy";
import {
  clearRepositoryRegistration,
  readRepositoryRegistration,
} from "@/utils/repository-registration";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const formRef = ref(null);
const loading = ref(false);
const siteConfig = ref(null);
const registrationId = route.query.repository_invitation;
const repositoryRegistration = readRepositoryRegistration(registrationId);
const suppliedInvitation =
  typeof route.query.invitation === "string" ? route.query.invitation : "";
const form = reactive({
  username: "",
  email: "",
  password: "",
  invitationCode: suppliedInvitation || repositoryRegistration?.token || "",
});
const invitationRequired = computed(() => !!siteConfig.value?.invitation_only);
const showInvitationInput = computed(
  () => !repositoryRegistration?.guestRepositoryId || invitationRequired.value,
);

const rules = computed(() => ({
  username: [
    { required: true, message: "Please enter username", trigger: "blur" },
    {
      min: 3,
      message: "Username must be at least 3 characters",
      trigger: "blur",
    },
  ],
  email: [
    { required: true, message: "Please enter email", trigger: "blur" },
    { type: "email", message: "Please enter valid email", trigger: "blur" },
  ],
  password: [
    {
      validator: (_rule, value, callback) => {
        const problem = passwordProblem(value);
        callback(problem ? new Error(problem) : undefined);
      },
      trigger: "blur",
    },
  ],
  invitationCode: [
    {
      required: invitationRequired.value,
      message: "Enter an invitation code",
      trigger: "blur",
    },
  ],
}));

async function loadSiteConfig() {
  try {
    const { data } = await axios.get("/api/site-config");
    siteConfig.value = data;

    // An automatic repository grant is retained separately when site policy
    // requires an additional registration credential. No type selection UI.
    if (
      data.invitation_only &&
      !suppliedInvitation &&
      repositoryRegistration?.token &&
      form.invitationCode === repositoryRegistration.token
    ) {
      form.invitationCode = "";
    }
  } catch (err) {
    console.error("Failed to load site config:", err);
    notifyError(err, { fallback: "Failed to load site settings" });
  }
}

async function handleSubmit() {
  if (!formRef.value || !siteConfig.value || loading.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid || (invitationRequired.value && !form.invitationCode.trim()))
      return;

    loading.value = true;
    try {
      const { invitationCode: suppliedCode, ...registerData } = form;
      const code = suppliedCode.trim();
      if (code) registerData.invitation_code = code;
      // Preserve automatic context if the single visible field supplies another
      // credential; only the server determines the invitation's type.
      if (
        repositoryRegistration?.token &&
        repositoryRegistration.token !== code
      )
        registerData.repo_invitation_token = repositoryRegistration.token;
      if (repositoryRegistration?.guestRepositoryId)
        registerData.repo_guest_repository_id =
          repositoryRegistration.guestRepositoryId;
      const result = await authStore.register(registerData);
      const serverDestination = result.repository_url;
      const destination =
        typeof serverDestination === "string" &&
        safeReturn(serverDestination) === serverDestination
          ? serverDestination
          : repositoryRegistration?.repositoryPath ||
            safeReturn(route.query.return);
      clearRepositoryRegistration(registrationId);
      form.invitationCode = "";
      ElMessage.success(result.message || "Registration successful");

      // Auto login if email verified
      if (result.email_verified) {
        try {
          await authStore.login({
            username: form.username,
            password: form.password,
          });
        } catch (error) {
          notifyError(error, {
            fallback: "Account created. Sign in to continue",
          });
          router.push(
            destination === "/"
              ? "/login"
              : { path: "/login", query: { return: destination } },
          );
          return;
        }
        router.push(destination);
      } else {
        router.push(
          destination === "/"
            ? "/login"
            : { path: "/login", query: { return: destination } },
        );
      }
    } catch (err) {
      notifyError(err, { fallback: "Registration failed" });
    } finally {
      loading.value = false;
    }
  });
}

onMounted(() => {
  loadSiteConfig();
});
</script>
