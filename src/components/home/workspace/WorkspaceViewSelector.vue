<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import WorkspaceAccountMenu from "./WorkspaceAccountMenu.vue";

const props = defineProps({
  username: { type: String, default: null },
  organizations: { type: Array, default: () => [] },
});
const view = defineModel({ type: String, default: "self" });
const selectedOrganization = computed(() =>
  props.organizations.find((org) => `org:${org.name}` === view.value),
);
const selectedName = computed(
  () => selectedOrganization.value?.name || props.username || "Your workspace",
);
const options = computed(() => [
  {
    value: "self",
    label: props.username || "Your workspace",
    username: props.username,
  },
  ...props.organizations.map((org, index) => ({
    value: `org:${org.name}`,
    label: org.name,
    username: org.name,
    isOrg: true,
    divided: index === 0,
  })),
]);
</script>

<template>
  <WorkspaceAccountMenu
    v-model="view"
    :options="options"
    label="Workspace view"
    class="workspace-view-selector"
    menu-class="workspace-view-menu"
    avatar-class="workspace-avatar"
    label-class="workspace-option-label"
    check-class="workspace-check"
  >
    <template #trigger>
      <button type="button" class="account-link" aria-label="Select workspace">
        <EntityAvatar
          :username="selectedOrganization?.name || username"
          :is-org="Boolean(selectedOrganization)"
          :name="selectedName"
          :size="36"
          class="workspace-avatar"
        />
        <span class="account-label">
          <strong>{{ selectedName }}</strong>
          <small>{{
            selectedOrganization
              ? "Organization workspace"
              : "Personal workspace"
          }}</small>
        </span>
        <span class="i-carbon-chevron-down" aria-hidden="true" />
      </button>
    </template>
  </WorkspaceAccountMenu>
</template>

<style scoped>
.workspace-view-selector {
  display: block;
  margin-bottom: 28px;
}
.account-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 0;
  text-align: left;
  color: var(--ws-text);
}
.account-link:hover .account-label strong {
  color: var(--site-primary);
}
.account-link:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 5px;
  border-radius: 6px;
}
.account-label {
  flex: 1;
  min-width: 0;
}
.account-label strong {
  display: block;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.account-label small {
  display: block;
  color: var(--ws-muted);
  font-size: 11px;
  margin-top: 2px;
}
@media (max-width: 700px) {
  .workspace-view-selector {
    margin-bottom: 12px;
  }
}
</style>
