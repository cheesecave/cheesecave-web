<script setup>
import { computed } from "vue";
import { ElAvatar } from "element-plus";
import { buildEntityAvatarUrl } from "@/utils/entity-avatar";

const props = defineProps({
  username: { type: String, default: null },
  isOrg: { type: Boolean, default: false },
  name: { type: String, default: "" },
  src: { type: String, default: "" },
  avatarUrl: { type: String, default: "" },
  version: { type: [String, Number], default: undefined },
  size: { type: [Number, String], default: 32 },
  icon: { type: String, default: "" },
});
const source = computed(() =>
  buildEntityAvatarUrl({
    username: props.username,
    isOrg: props.isOrg,
    src: props.src || props.avatarUrl,
    version: props.version,
  }),
);
const initials = computed(() =>
  Array.from((props.name || props.username || "").trim())
    .slice(0, 2)
    .join("")
    .toUpperCase(),
);
</script>

<template>
  <ElAvatar :src="source" :size="size" class="entity-avatar">
    <span
      v-if="icon || !username"
      :class="icon || 'i-carbon-user-avatar'"
      aria-hidden="true"
    />
    <span v-else>{{ initials }}</span>
  </ElAvatar>
</template>

<style scoped>
.entity-avatar {
  flex-shrink: 0;
  background: var(--site-hover);
  color: var(--site-muted);
  border: 1px solid var(--site-border);
  font-size: max(11px, calc(var(--el-avatar-size, 32px) * 0.34));
  font-weight: 600;
}
</style>
