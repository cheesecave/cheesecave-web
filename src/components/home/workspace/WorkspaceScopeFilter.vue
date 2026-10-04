<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import WorkspaceAccountMenu from "./WorkspaceAccountMenu.vue";

const props = defineProps({
  username: { type: String, default: null },
  organizations: { type: Array, default: () => [] },
});
const scope = defineModel({ type: String, default: "all" });
const options = computed(() => [
  { value: "all", label: "All", icon: "i-carbon-events" },
  {
    value: "self",
    label: "Self",
    username: props.username,
    name: props.username,
    icon: props.username ? undefined : "i-carbon-user-avatar",
  },
  { value: "following", label: "Following", icon: "i-carbon-user-follow" },
  ...props.organizations.map((org, index) => ({
    value: `org:${org.name}`,
    label: org.name,
    username: org.name,
    isOrg: true,
    divided: index === 0,
  })),
]);
const selected = computed(
  () =>
    options.value.find((item) => item.value === scope.value) ||
    options.value[0],
);
</script>

<template>
  <WorkspaceAccountMenu
    v-model="scope"
    :options="options"
    label="Activity scope"
    menu-class="scope-menu"
    avatar-class="scope-avatar"
    label-class="scope-option-label"
    check-class="scope-check"
  >
    <template #trigger>
      <button type="button" class="scope-trigger" aria-label="Filter activity">
        <EntityAvatar
          :username="selected.username"
          :is-org="selected.isOrg"
          :name="selected.name || selected.label"
          :icon="selected.icon"
          :size="22"
          class="scope-avatar"
        />
        <span class="scope-label">{{ selected.label }}</span>
        <span class="i-carbon-chevron-down" aria-hidden="true" />
      </button>
    </template>
  </WorkspaceAccountMenu>
</template>

<style scoped>
.scope-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  max-width: 100%;
  padding: 5px 11px;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  background: var(--ws-surface);
  color: var(--ws-text);
  font-size: 12px;
}
.scope-trigger:hover {
  border-color: var(--site-primary);
}
.scope-trigger:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 2px;
}
.scope-label {
  max-width: min(240px, 55vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
