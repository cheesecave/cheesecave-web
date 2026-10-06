<!--
  ErrorState.vue: what to show when something could not be loaded or done.

  Takes the error as it was thrown (it is decoded here), picks the icon, the
  words and the actions for it (src/errors/copy.js), and keeps what to quote
  to whoever runs the server (status, code, request ID) in a disclosure.

  - `mode="full-page"`: centered, large, replaces a route's content.
  - `mode="inline-panel"`: smaller, fits inside a panel of a page.

  Actions come from the copy: Retry when the caller passes `retry`, Sign in
  (back to here afterwards), Go back, Go home, Open settings, Reload. A caller
  can replace them with the `actions` slot. `autoRetryIn` shows a countdown
  to an automatic retry that the user can cancel.

  It rises in over 180 ms, unless the user asked for less motion.
-->

<script setup>
import { computed } from "vue";
import { KIND, decodeError } from "@/errors";
import { describeError, requestLine, signInPath } from "@/errors/copy";
import { copyToClipboard } from "@/utils/clipboard";

const props = defineProps({
  // An AppError, or anything that was thrown: it is decoded
  error: { type: null, required: true },
  // { noun, signedIn, sessionExpired }: see describeError
  context: { type: Object, default: () => ({}) },
  mode: {
    type: String,
    default: "full-page",
    validator: (m) => m === "full-page" || m === "inline-panel",
  },
  // Renders a Retry button when the copy offers one
  retry: { type: Function, default: null },
  retrying: { type: Boolean, default: false },
  // Seconds until an automatic retry, or null
  autoRetryIn: { type: Number, default: null },
  titleOverride: { type: String, default: null },
  hintOverride: { type: String, default: null },
});
const emit = defineEmits(["cancel-auto-retry"]);

const appError = computed(() => decodeError(props.error));
const described = computed(() => describeError(appError.value, props.context));
const title = computed(() => props.titleOverride || described.value.title);
const hint = computed(() => props.hintOverride || described.value.description);

const TONE_COLOR = {
  warning: "text-amber-500",
  danger: "text-red-500",
  neutral: "text-gray-500 dark:text-gray-400",
};
const SERVER_SIDE = new Set([
  KIND.SERVER,
  KIND.UNAVAILABLE,
  KIND.UNEXPECTED,
  KIND.BUG,
  KIND.TIMEOUT,
]);

const full = computed(() => props.mode === "full-page");
const containerClass = computed(() =>
  full.value
    ? "py-16 flex flex-col items-center text-center"
    : "py-8 flex flex-col items-center text-center",
);
const iconSize = computed(() => (full.value ? "text-6xl" : "text-5xl"));
const titleSize = computed(() =>
  full.value ? "mt-4 text-lg font-semibold" : "mt-4 text-sm font-medium",
);

// Actions the copy offers that this caller can do
const actions = computed(() =>
  described.value.actions.filter((a) => a !== "retry" || props.retry),
);
const signInTo = computed(() =>
  signInPath(`${window.location.pathname}${window.location.search}`),
);

const quote = computed(() => requestLine(appError.value));
// The server's own sentence is shown for a client mistake, so it is only quoted
// here for a failure on the server's side
const technicalMessage = computed(() =>
  SERVER_SIDE.has(appError.value.kind) ? appError.value.serverMessage : null,
);
const showTechnical = computed(() => quote.value || technicalMessage.value);

const sourceRows = computed(() => {
  const sources = appError.value.sources;
  if (!Array.isArray(sources)) return [];
  return sources.map((src) => ({
    name: src?.name ?? "(unknown)",
    status: src?.status == null ? "-" : String(src.status),
    category: src?.category ?? "",
    message: typeof src?.message === "string" ? src.message : "",
  }));
});

const goBack = () => window.history.back();
const reload = () => window.location.reload();
</script>

<template>
  <div
    v-if="described"
    :class="[containerClass, 'error-state']"
    role="alert"
    :data-kind="appError.kind"
    data-testid="error-state"
  >
    <div
      :class="[described.icon, TONE_COLOR[described.tone], iconSize]"
      data-testid="error-icon"
    />
    <p
      :class="[titleSize, 'text-gray-800 dark:text-gray-100']"
      data-testid="error-title"
    >
      {{ title }}
    </p>
    <p
      class="mt-2 text-xs text-gray-500 dark:text-gray-400 max-w-md break-words"
      data-testid="error-hint"
    >
      {{ hint }}
    </p>

    <p
      v-if="autoRetryIn !== null"
      class="mt-3 text-xs text-gray-500 dark:text-gray-400"
      data-testid="error-autoretry"
    >
      Retrying in {{ autoRetryIn }} s…
      <button
        type="button"
        class="underline ml-1"
        data-testid="error-autoretry-cancel"
        @click="emit('cancel-auto-retry')"
      >
        Cancel
      </button>
    </p>

    <div class="mt-4 flex flex-wrap justify-center gap-2">
      <slot name="actions" :error="appError" :actions="actions">
        <template v-for="action in actions" :key="action">
          <el-button
            v-if="action === 'retry'"
            type="primary"
            plain
            :loading="retrying"
            data-testid="error-action-retry"
            @click="retry"
            >Retry</el-button
          >
          <RouterLink
            v-else-if="action === 'signin'"
            :to="signInTo"
            class="el-button el-button--primary"
            data-testid="error-action-signin"
            >Sign in</RouterLink
          >
          <el-button
            v-else-if="action === 'back'"
            plain
            data-testid="error-action-back"
            @click="goBack"
            >Go back</el-button
          >
          <RouterLink
            v-else-if="action === 'home'"
            to="/"
            class="el-button"
            data-testid="error-action-home"
            >Go to home</RouterLink
          >
          <RouterLink
            v-else-if="action === 'settings'"
            to="/settings"
            class="el-button el-button--primary"
            data-testid="error-action-settings"
            >Open settings</RouterLink
          >
          <el-button
            v-else-if="action === 'reload'"
            type="primary"
            data-testid="error-action-reload"
            @click="reload"
            >Reload page</el-button
          >
        </template>
      </slot>
    </div>

    <details
      v-if="showTechnical"
      class="mt-4 text-xs text-gray-400 dark:text-gray-500 max-w-md w-full"
      data-testid="error-technical"
    >
      <summary class="cursor-pointer">Technical details</summary>
      <p class="mt-2 font-mono break-words">{{ quote }}</p>
      <p v-if="technicalMessage" class="mt-1 font-mono break-words">
        {{ technicalMessage }}
      </p>
      <button
        v-if="quote"
        type="button"
        class="mt-2 underline"
        data-testid="error-copy"
        @click="copyToClipboard(quote)"
      >
        Copy
      </button>
    </details>

    <div v-if="sourceRows.length" class="mt-4 w-full max-w-xl text-left">
      <details class="text-xs">
        <summary class="cursor-pointer text-gray-500 dark:text-gray-400 mb-2">
          Fallback sources tried ({{ sourceRows.length }})
        </summary>
        <el-table :data="sourceRows" size="small" :border="true">
          <el-table-column prop="name" label="Source" width="130" />
          <el-table-column prop="status" label="HTTP" width="70" />
          <el-table-column prop="category" label="Category" width="110" />
          <el-table-column prop="message" label="Message" />
        </el-table>
      </details>
    </div>
  </div>
</template>

<style scoped>
.error-state {
  animation: error-rise 180ms ease-out;
}
@keyframes error-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .error-state {
    animation: none;
  }
}
</style>
