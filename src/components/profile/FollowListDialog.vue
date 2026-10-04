<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { socialAPI } from "@/utils/api";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import { buildEntityProfilePath } from "@/utils/entity-avatar";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  username: { type: String, required: true },
  kind: {
    type: String,
    default: "followers",
    validator: (value) => ["followers", "following"].includes(value),
  },
  identity: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const items = ref([]);
const busy = ref(false);
const error = ref("");
const cursor = ref(null);
const hasMore = ref(false);
const loaded = ref(false);
let version = 0;
const title = computed(
  () =>
    `${props.username} · ${props.kind === "followers" ? "Followers" : "Following"}`,
);
async function loadMore() {
  if (busy.value || !props.modelValue) return;
  const request = version;
  const username = props.username;
  const kind = props.kind;
  busy.value = true;
  error.value = "";
  try {
    const { data } = await (
      kind === "followers" ? socialAPI.listFollowers : socialAPI.listFollowing
    )(username, {
      limit: 20,
      ...(cursor.value ? { cursor: cursor.value } : {}),
    });
    if (request !== version) return;
    const known = new Set(items.value.map((item) => item.username));
    items.value.push(...data.items.filter((item) => !known.has(item.username)));
    cursor.value = data.next_cursor;
    hasMore.value = data.has_more && Boolean(data.next_cursor);
    loaded.value = true;
  } catch (failure) {
    if (request !== version) return;
    error.value = `Could not load ${kind}. Please try again.`;
  } finally {
    if (request === version) busy.value = false;
  }
}
watch(
  () => [props.modelValue, props.username, props.kind, props.identity],
  () => {
    version++;
    items.value = [];
    cursor.value = null;
    hasMore.value = false;
    busy.value = false;
    loaded.value = false;
    error.value = "";
    if (props.modelValue) void loadMore();
  },
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => version++);
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(480px, calc(100vw - 32px))"
    class="follow-list-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-scrollbar max-height="min(420px, 60vh)">
      <div
        class="follow-list"
        :aria-busy="busy"
        :aria-label="kind === 'followers' ? 'Followers' : 'Following'"
      >
        <RouterLink
          v-for="item in items"
          :key="item.username"
          :to="buildEntityProfilePath(item.username, item.is_org)"
          class="follow-list-person"
          @click="emit('update:modelValue', false)"
        >
          <EntityAvatar
            :username="item.username"
            :is-org="item.is_org"
            :name="item.full_name || item.username"
            :avatar-url="item.avatar_url"
            :version="item.avatar_updated_at"
            :size="36"
            class="follow-avatar placeholder"
          />
          <span class="follow-person-name"
            ><strong>{{ item.full_name || item.username }}</strong
            ><small
              >@{{ item.username
              }}<span v-if="item.is_org"> · Organization</span></small
            ></span
          >
        </RouterLink>
        <p v-if="busy" role="status" class="follow-list-status">
          Loading {{ kind }}…
        </p>
        <p v-if="loaded && !items.length && !busy" class="follow-list-status">
          {{
            kind === "followers"
              ? "No followers yet."
              : "Not following anyone yet."
          }}
        </p>
        <p v-if="error" role="alert" class="follow-list-error">{{ error }}</p>
      </div>
    </el-scrollbar>
    <template v-if="hasMore || error" #footer
      ><el-button :loading="busy" :disabled="busy" @click="loadMore">{{
        error ? "Try again" : "Load more"
      }}</el-button></template
    >
  </el-dialog>
</template>

<style scoped>
.follow-list-dialog :deep(.el-dialog__title) {
  overflow-wrap: anywhere;
}
.follow-list {
  color: var(--site-card-text);
  min-width: 0;
}
.follow-list-person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  color: var(--site-card-text);
  border-bottom: 1px solid var(--site-border);
  text-decoration: none;
  min-width: 0;
}
.follow-list-person:hover {
  color: var(--site-link);
  background: var(--site-hover);
}
.follow-list-person:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: -2px;
}
.follow-person-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}
.follow-person-name strong,
.follow-person-name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.follow-person-name strong {
  font-size: 14px;
  font-weight: 600;
}
.follow-person-name small {
  font-size: 12px;
  color: var(--site-muted);
}
.follow-list-status {
  padding: 20px 4px;
  color: var(--site-muted);
  font-size: 13px;
}
.follow-list-error {
  padding: 12px 4px;
  color: var(--el-color-danger);
  font-size: 13px;
}
</style>
