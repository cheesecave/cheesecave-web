<!-- Any address no page claims: say so, and say which address. -->

<script setup>
import { useRoute } from "vue-router";
import { AppError, KIND } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import { useErrorContext } from "@/composables/useErrorContext";

const route = useRoute();
const context = useErrorContext();
const error = new AppError({
  kind: KIND.NOT_FOUND,
  serverMessage: `Nothing lives at ${route.fullPath}.`,
});
</script>

<template>
  <ErrorState :error="error" :context="context('page')" />
</template>
