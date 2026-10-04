<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import { buildEntityProfilePath } from "@/utils/entity-avatar";
import { formatRelativeTime } from "@/utils/datetime";
import { getRepositoryType } from "@/utils/repository-types";

const props = defineProps({ item: { type: Object, required: true } });
const actor = computed(() =>
  props.item.actor?.username ? props.item.actor : null,
);
const actorName = computed(
  () => actor.value?.full_name || actor.value?.username || "Unknown user",
);
const actorPath = computed(() =>
  actor.value
    ? buildEntityProfilePath(actor.value.username, actor.value.is_org)
    : null,
);
const action = computed(
  () =>
    ({ like: "liked", repo_created: "created", commit: "updated" })[
      props.item.kind
    ] || "updated",
);
const repositoryType = computed(
  () => getRepositoryType(props.item.repository.type).label,
);
const time = computed(() => {
  const date = new Date(props.item.created_at);
  if (Number.isNaN(date.getTime())) return { label: "Unknown time" };
  const iso = date.toISOString();
  return {
    iso,
    label: `${iso.slice(0, 19).replace("T", " ")} UTC`,
    relative: formatRelativeTime(date),
  };
});
</script>

<template>
  <article class="activity-card" :data-event-id="item.id">
    <header class="activity-heading">
      <component
        :is="actor ? RouterLink : 'span'"
        :to="actorPath || undefined"
        class="activity-avatar-link"
        :aria-label="actor ? `View ${actorName}'s profile` : 'Unknown user'"
      >
        <EntityAvatar
          :username="actor?.username"
          :is-org="actor?.is_org"
          :name="actorName"
          :avatar-url="actor?.avatar_url"
          :version="actor?.avatar_updated_at"
          :size="32"
          class="activity-avatar"
        />
      </component>
      <div class="activity-summary">
        <RouterLink v-if="actor" :to="actorPath" class="activity-actor-link">{{
          actorName
        }}</RouterLink>
        <span v-else class="activity-unknown">{{ actorName }}</span>
        {{ " " }}
        <span class="activity-action">{{ action }} a {{ repositoryType }}</span>
      </div>
      <time :datetime="time.iso" :title="time.label">{{
        time.relative || time.label
      }}</time>
    </header>
    <div v-if="$slots.repository" class="activity-repository">
      <slot name="repository" :repository="item.repository" />
    </div>
    <div v-if="$slots.details" class="activity-details">
      <slot name="details" />
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  min-width: 0;
  color: var(--ws-text);
}
.activity-heading {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-bottom: 10px;
}
.activity-avatar-link {
  display: flex;
  align-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.activity-summary {
  min-width: 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.activity-actor-link {
  color: var(--ws-link);
  font-weight: 600;
}
.activity-action,
.activity-unknown {
  color: var(--ws-muted);
}
time {
  color: var(--ws-muted);
  font-size: 11px;
  white-space: nowrap;
}
.activity-repository,
.activity-details {
  margin-left: 42px;
  min-width: 0;
}
.activity-details {
  margin-top: 10px;
}
@media (max-width: 700px) {
  .activity-heading {
    grid-template-columns: 32px minmax(0, 1fr);
    row-gap: 2px;
  }
  .activity-avatar-link {
    grid-row: 1 / span 2;
  }
  time {
    grid-column: 2;
  }
}
</style>
