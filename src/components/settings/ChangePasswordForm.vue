<!-- Settings > Security: change the password of the signed-in account. -->
<template>
  <section class="max-w-md" data-testid="change-password">
    <p class="mb-4 text-gray-600 dark:text-gray-400">
      Choose a new password of at least 8 characters. When you change it, your
      other devices are signed out. Access tokens keep working: revoke them
      under API Tokens if you want them to stop.
    </p>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="handleSubmit"
    >
      <el-form-item label="Current password" prop="current">
        <el-input
          v-model="form.current"
          type="password"
          placeholder="Current password"
          show-password
          @input="currentError = ''"
        />
        <p
          v-if="currentError"
          class="mt-1 text-sm text-red-500"
          role="alert"
          data-testid="current-password-error"
        >
          {{ currentError }}
        </p>
      </el-form-item>

      <el-form-item label="New password" prop="next">
        <el-input
          v-model="form.next"
          type="password"
          placeholder="New password"
          show-password
        />
      </el-form-item>

      <el-form-item label="Repeat the new password" prop="again">
        <el-input
          v-model="form.again"
          type="password"
          placeholder="Repeat the new password"
          show-password
        />
      </el-form-item>

      <el-button type="primary" :loading="loading" @click="handleSubmit">
        Change password
      </el-button>
    </el-form>
  </section>
</template>

<script setup>
import { notifyError } from "@/errors";
import { authAPI } from "@/utils/api";
import { confirmationProblem, passwordProblem } from "@/utils/password-policy";
import { ElMessage } from "element-plus";

const formRef = ref(null);
const loading = ref(false);
const currentError = ref("");
const form = reactive({ current: "", next: "", again: "" });

const problemRule = (check) => ({
  validator: (_rule, value, callback) => {
    const problem = check(value);
    callback(problem ? new Error(problem) : undefined);
  },
  trigger: "blur",
});

const rules = {
  current: [
    {
      required: true,
      message: "Please enter your current password",
      trigger: "blur",
    },
  ],
  next: [problemRule(passwordProblem)],
  again: [problemRule((value) => confirmationProblem(form.next, value))],
};

async function handleSubmit() {
  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    currentError.value = "";
    try {
      await authAPI.changePassword({
        current_password: form.current,
        new_password: form.next,
      });
      form.current = form.next = form.again = "";
      ElMessage.success(
        "Password changed. Your other devices were signed out.",
      );
    } catch (err) {
      if (err?.response?.status === 403) {
        // the one failure that is about a field: say which
        currentError.value = "Current password is incorrect";
      } else {
        notifyError(err, { fallback: "Failed to change the password" });
      }
    } finally {
      loading.value = false;
    }
  });
}
</script>
