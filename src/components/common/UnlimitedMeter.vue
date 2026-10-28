<script setup>
// PROTOTYPE: the meter of a quota that has no limit. Today it is an empty grey bar, which reads as "0 % used".
// In C-3 it is a hatched track: there is a bar, and it is plainly not filling up.
import { distinctMeter } from "@/utils/unlimited";

const distinct = distinctMeter();
</script>

<template>
  <div v-if="distinct" class="no-cap-track" aria-hidden="true" />
  <div v-else class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
</template>

<style scoped>
.no-cap-track {
  height: 6px;
  border-radius: 999px;
  background: repeating-linear-gradient(
    135deg,
    var(--site-border, #d4d4cc) 0 4px,
    transparent 4px 8px
  );
  opacity: 0.9;
}
</style>
