<!--
  ZipPasswordForm.vue

  Password prompt for TarBrowserPanel's zip mode. Shown once when an
  archive is opened (and again only for a member that uses a different
  password). The password never leaves the browser: zip.js decrypts
  the Range-read bytes locally.
-->

<script setup>
import { ref } from "vue";

const props = defineProps({
  message: { type: String, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["submit"]);

const password = ref("");

function submit() {
  if (!password.value || props.busy) return;
  emit("submit", password.value);
}
</script>

<template>
  <form
    class="max-w-sm mx-auto py-8 text-center"
    data-testid="zip-password-form"
    @submit.prevent="submit"
  >
    <div
      class="i-carbon-locked text-5xl text-gray-400 dark:text-gray-500 mb-3 inline-block"
    />
    <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">{{ message }}</p>
    <el-input
      v-model="password"
      type="password"
      show-password
      placeholder="Password"
      aria-label="Archive password"
      autocomplete="off"
    />
    <p v-if="error" class="mt-2 text-xs text-red-500" role="alert">
      {{ error }}
    </p>
    <el-button
      class="mt-4"
      type="primary"
      native-type="submit"
      :loading="busy"
      :disabled="!password"
    >
      Unlock
    </el-button>
  </form>
</template>
