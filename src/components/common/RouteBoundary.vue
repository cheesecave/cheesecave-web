<!--
  RouteBoundary.vue: a page that throws while rendering shows the "bug" state
  with the request-free technical details, instead of a blank screen. It
  clears when the route changes (`routeKey`), so one broken page never
  strands the rest of the app.
-->

<script setup>
import { onErrorCaptured, ref, watch } from "vue";
import { AppError, KIND } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";

const props = defineProps({ routeKey: { type: String, default: "" } });
const failure = ref(null);

// A page that cannot render or set itself up has nothing to show. An error in
// an event handler, a watcher or a hook does not: the page and what the user
// typed stay, and the error goes on to the app-level handler (a toast).
// (In a production build `info` is a link ending in the error's code.)
const CANNOT_RENDER = /render function|setup function|#runtime-[01]$/;

onErrorCaptured((err, _instance, info) => {
  if (!CANNOT_RENDER.test(String(info))) return true;
  console.error(err);
  failure.value = new AppError({ kind: KIND.BUG, cause: err });
  return false;
});

watch(
  () => props.routeKey,
  () => (failure.value = null),
);
</script>

<template>
  <ErrorState v-if="failure" :error="failure" />
  <slot v-else />
</template>
