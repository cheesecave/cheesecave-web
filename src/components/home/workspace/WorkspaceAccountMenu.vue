<script setup>
import {
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElScrollbar,
} from "element-plus";
import EntityAvatar from "@/components/common/EntityAvatar.vue";

defineProps({
  options: { type: Array, required: true },
  label: { type: String, required: true },
  menuClass: { type: String, default: "" },
  avatarClass: { type: String, default: "" },
  labelClass: { type: String, default: "" },
  checkClass: { type: String, default: "" },
});
const selected = defineModel({ type: String, required: true });

function select(value) {
  selected.value = value;
}
</script>

<template>
  <ElDropdown
    trigger="click"
    placement="bottom-start"
    :show-arrow="false"
    popper-class="workspace-account-popper"
    @command="select"
  >
    <slot name="trigger" />
    <template #dropdown>
      <ElScrollbar max-height="min(360px, 50vh)">
        <ElDropdownMenu
          class="workspace-account-menu"
          :class="menuClass"
          :aria-label="label"
        >
          <ElDropdownItem
            v-for="option in options"
            :key="option.value"
            :command="option.value"
            :divided="Boolean(option.divided)"
            :aria-current="selected === option.value ? 'true' : undefined"
          >
            <EntityAvatar
              :username="option.username"
              :is-org="option.isOrg"
              :name="option.name || option.label"
              :src="option.src"
              :icon="option.icon"
              :size="24"
              :class="avatarClass"
            />
            <span class="workspace-account-label" :class="labelClass">{{
              option.label
            }}</span>
            <span
              v-if="selected === option.value"
              class="i-carbon-checkmark workspace-account-check"
              :class="checkClass"
              aria-hidden="true"
            />
          </ElDropdownItem>
        </ElDropdownMenu>
      </ElScrollbar>
    </template>
  </ElDropdown>
</template>

<style scoped>
:global(.workspace-account-popper.el-popper) {
  overflow: hidden;
  border-radius: var(--site-card-radius, 12px);
  background: var(--site-card);
  box-shadow: var(--site-card-shadow);
}
.workspace-account-menu {
  min-width: 230px;
  max-width: min(320px, calc(100vw - 40px));
  border-radius: var(--site-card-radius, 12px);
}
.workspace-account-menu :deep(.el-dropdown-menu__item) {
  display: flex;
  gap: 9px;
  padding: 8px 14px;
  font-size: 12px;
}
.workspace-account-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-account-check {
  color: var(--site-primary);
}
</style>
