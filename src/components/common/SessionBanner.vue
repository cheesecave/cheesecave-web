<!--
  SessionBanner.vue: the strip above the header when the sign-in is in doubt.

  - expired: the server refused our token, so we signed out; Sign in returns
    to the current page.
  - unverified: the server could not be asked (network / 5xx); the token is
    kept and Retry asks again, so a blip does not sign anyone out.
-->

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { signInPath } from "@/errors/copy";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const signIn = computed(() => signInPath(route.fullPath));
</script>

<template>
  <div
    v-if="auth.sessionNotice"
    role="status"
    data-testid="session-banner"
    class="flex items-center justify-center gap-3 px-4 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800"
  >
    <template v-if="auth.sessionNotice === 'expired'">
      <span>Your session has ended. Sign in again to keep working.</span>
      <router-link :to="signIn" class="underline font-medium"
        >Sign in</router-link
      >
    </template>
    <template v-else>
      <span>We couldn't check whether you're signed in right now.</span>
      <button
        type="button"
        class="underline font-medium"
        data-testid="session-retry"
        @click="auth.retryVerify()"
      >
        Retry
      </button>
    </template>
  </div>
</template>
