<!-- The page a password reset link opens: whose account, a new password, done. -->
<template>
  <div class="min-h-[calc(100vh-16rem)] flex items-center justify-center">
    <div class="card w-full max-w-md">
      <h1 class="text-2xl font-bold mb-6 text-center">Reset your password</h1>

      <div
        v-if="state === 'checking'"
        class="text-center text-gray-600 dark:text-gray-400"
        data-testid="reset-checking"
      >
        Checking your link…
      </div>

      <div v-else-if="state === 'ready'" data-testid="reset-ready">
        <p class="mb-1" data-testid="reset-account">
          Choose a new password for <strong>{{ username }}</strong
          >.
        </p>
        <p
          class="mb-4 text-sm text-gray-600 dark:text-gray-400"
          data-testid="reset-expiry"
        >
          This link works once and stops working {{ expiry }}.
        </p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="New password" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="New password"
              size="large"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <el-form-item label="Repeat the new password" prop="confirm">
            <el-input
              v-model="form.confirm"
              type="password"
              placeholder="Repeat the new password"
              size="large"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
            At least 8 characters. You will be signed out of every device and
            log in again with the new password.
          </p>

          <el-button
            type="primary"
            size="large"
            class="w-full"
            :loading="loading"
            @click="handleSubmit"
          >
            Set new password
          </el-button>
        </el-form>
      </div>

      <div v-else-if="state === 'done'" data-testid="reset-done">
        <p class="mb-2 text-lg font-semibold">
          <span class="i-carbon-checkmark-filled text-green-500 mr-1" />
          Your password has been changed.
        </p>
        <p class="mb-4 text-gray-600 dark:text-gray-400">
          For your safety you have been signed out everywhere. Log in with your
          new password.
        </p>
        <RouterLink to="/login">
          <el-button type="primary" size="large" class="w-full">
            Go to login
          </el-button>
        </RouterLink>
      </div>

      <div v-else-if="state === 'unreachable'" data-testid="reset-unreachable">
        <p class="mb-4 text-gray-600 dark:text-gray-400">
          The link could not be checked right now. This is not a problem with
          the link itself.
        </p>
        <el-button
          type="primary"
          size="large"
          class="w-full"
          @click="checkLink"
        >
          Try again
        </el-button>
      </div>

      <div v-else data-testid="reset-invalid">
        <p class="mb-2 font-semibold">
          <span class="i-carbon-warning-filled text-yellow-500 mr-1" />
          This reset link is invalid, expired or already used.
        </p>
        <p class="mb-4 text-gray-600 dark:text-gray-400">
          Ask your administrator for a new link.
        </p>
        <RouterLink
          to="/login"
          class="text-blue-500 dark:text-blue-400 hover:underline"
        >
          Back to login
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { notifyError } from "@/errors";
import { useAuthStore } from "@/stores/auth";
import { authAPI } from "@/utils/api";
import { confirmationProblem, passwordProblem } from "@/utils/password-policy";
import { describeRemaining } from "@/utils/remaining-time";
import { ElMessage } from "element-plus";

const authStore = useAuthStore();
const formRef = ref(null);
const loading = ref(false);
// checking | ready | invalid | unreachable | done
const state = ref("checking");
const username = ref("");
const expiresAt = ref(null);
const form = reactive({ password: "", confirm: "" });

// The token lives in memory only: it is taken out of the address bar at once, so it cannot be copied from there, kept in
// the history or end up in a screenshot of the browser
let token = "";

const rules = {
  password: [
    {
      validator: (_rule, value, callback) => {
        const problem = passwordProblem(value);
        callback(problem ? new Error(problem) : undefined);
      },
      trigger: "blur",
    },
  ],
  confirm: [
    {
      validator: (_rule, value, callback) => {
        const problem = confirmationProblem(form.password, value);
        callback(problem ? new Error(problem) : undefined);
      },
      trigger: "blur",
    },
  ],
};

// only shown once the link has been checked, so there is an expiry to describe
const expiry = computed(() => {
  const at = new Date(expiresAt.value);
  return `${describeRemaining(at - Date.now())} (${at.toLocaleString()})`;
});

function takeTokenFromUrl() {
  const fragment = window.location.hash.replace(/^#/, "");
  const found = new URLSearchParams(fragment).get("token") || "";
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
  return found;
}

// No Referer should leave this page with the link's address in it: the policy is held while the page is open
let referrerMeta = null;
let referrerWas = null;
let referrerCreated = false;

function holdReferrer() {
  referrerMeta = document.head.querySelector('meta[name="referrer"]');
  if (referrerMeta) {
    referrerWas = referrerMeta.content;
  } else {
    referrerMeta = document.createElement("meta");
    referrerMeta.name = "referrer";
    document.head.append(referrerMeta);
    referrerCreated = true;
  }
  referrerMeta.content = "no-referrer";
}

function restoreReferrer() {
  if (referrerCreated) referrerMeta.remove();
  else referrerMeta.content = referrerWas;
}

const refused = (err) => err?.response?.status === 400;

async function checkLink() {
  if (!token) {
    state.value = "invalid";
    return;
  }
  state.value = "checking";
  try {
    const { data } = await authAPI.checkPasswordReset(token);
    username.value = data.username;
    expiresAt.value = data.expires_at;
    state.value = "ready";
  } catch (err) {
    if (refused(err)) {
      state.value = "invalid";
      return;
    }
    // the server could not be asked: that says nothing about the link
    state.value = "unreachable";
    notifyError(err, { fallback: "Could not check the reset link" });
  }
}

async function handleSubmit() {
  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    try {
      await authAPI.resetPassword({
        token,
        new_password: form.password,
      });
      // every session of the account is gone on the server; this browser stops acting as if it were signed in
      authStore.forgetSession();
      token = "";
      form.password = "";
      form.confirm = "";
      state.value = "done";
      ElMessage.success("Password changed");
    } catch (err) {
      if (refused(err)) {
        // used up, withdrawn or expired between opening the page and pressing the button
        state.value = "invalid";
      } else {
        notifyError(err, { fallback: "Failed to reset the password" });
      }
    } finally {
      loading.value = false;
    }
  });
}

onMounted(() => {
  holdReferrer();
  token = takeTokenFromUrl();
  checkLink();
});

onBeforeUnmount(restoreReferrer);
</script>
