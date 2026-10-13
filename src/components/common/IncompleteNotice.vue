<!--
  IncompleteNotice.vue: a list is incomplete because an external source could not be reached.

  The server answers a "partial" list request without the source that is down and names it; saying so
  keeps a short list from reading as "that is everything".
-->

<script setup>
defineProps({
  sources: { type: Array, default: () => [] },
});
</script>

<template>
  <div
    v-if="sources.length"
    role="status"
    data-testid="incomplete-notice"
    class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
  >
    These lists may be incomplete: {{ sources.join(", ") }}
    could not be reached, so its repositories are missing for now.
  </div>
</template>
