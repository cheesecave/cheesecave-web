<template>
  <RouterLink
    v-if="available"
    :to="target"
    class="text-sm text-[var(--site-link)] hover:underline"
    @click.capture="prepare"
    @auxclick.capture="prepare"
    @contextmenu="prepare"
    >Create an account</RouterLink
  >
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { notifyError } from "@/errors";
import {
  createGuestRepositoryRegistration,
  newRepositoryRegistrationId,
  repositoryRegistrationTarget,
} from "@/utils/repository-registration";

const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, required: true },
});
const auth = useAuthStore();
const id = ref(newRepositoryRegistrationId());
const available = computed(
  () =>
    !auth.isAuthenticated &&
    props.access.access === "guest" &&
    Number.isSafeInteger(props.access.registration_repository_id) &&
    props.access.registration_repository_id > 0,
);
const target = computed(() =>
  repositoryRegistrationTarget(props.repository, id.value),
);
watch(
  () => JSON.stringify(props.repository),
  () => {
    id.value = newRepositoryRegistrationId();
  },
);
function prepare(event) {
  if (!available.value) {
    event.preventDefault();
    return;
  }
  try {
    createGuestRepositoryRegistration(
      props.repository,
      props.access.registration_repository_id,
      id.value,
    );
  } catch (error) {
    event.preventDefault();
    notifyError(error, { fallback: "Could not continue to registration" });
  }
}
</script>
