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

onErrorCaptured((err) => {
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
