<template>
  <div
    v-if="isOwner && !visitorView"
    class="profile-owner-actions"
    role="group"
    aria-label="Profile actions"
  >
    <LinkButton to="/settings?tab=profile">Edit profile</LinkButton>
  </div>
</template>

<script setup>
import { computed } from "vue";
import LinkButton from "@/components/common/LinkButton.vue";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  username: { type: String, required: true },
  visitorView: { type: Boolean, default: false },
});
const auth = useAuthStore();
const isOwner = computed(
  () => auth.isAuthenticated && auth.username === props.username,
);
</script>

<style scoped>
.profile-owner-actions {
  margin: 16px 0;
}

.profile-owner-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
</style>
