<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import PrivateBadge from "@/components/repo/PrivateBadge.vue";
import { formatRelativeTime } from "@/utils/datetime";
import { ITEM_ICONS, itemPath, linkify } from "@/utils/collections";

// One item of a collection. A repository shows its live numbers; another collection is a reference card (its own
// items are not shown). The note is plain text whose web addresses are links; it is never rendered as HTML.
const props = defineProps({
  item: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  // the buttons that move the card for those who do not drag (keyboard, screen reader, phone)
  canMoveUp: { type: Boolean, default: false },
  canMoveDown: { type: Boolean, default: false },
});
defineEmits(["edit-note", "remove", "move"]);

const title = computed(() =>
  props.item.type === "collection" ? props.item.title : props.item.id,
);
const parts = computed(() =>
  props.item.note ? linkify(props.item.note.text) : [],
);
const stats = computed(() => {
  const item = props.item;
  const rows = [];
  if (item.type === "collection") {
    rows.push(`${item.numberItems} item${item.numberItems === 1 ? "" : "s"}`);
    rows.push(`${item.upvotes} upvote${item.upvotes === 1 ? "" : "s"}`);
  } else {
    if (item.pipeline_tag) rows.push(item.pipeline_tag);
    if (item.type === "space" && item.sdk) rows.push(item.sdk);
    if (item.downloads !== undefined)
      rows.push(`${item.downloads.toLocaleString()} downloads`);
    rows.push(`${item.likes.toLocaleString()} likes`);
  }
  return rows;
});
const updated = computed(() =>
  formatRelativeTime(props.item.lastModified || props.item.lastUpdated, ""),
);
</script>

<template>
  <div class="card item-card relative" :class="{ 'is-dragging': dragging }">
    <div class="flex items-start gap-2">
      <span
        v-if="editable"
        class="i-carbon-draggable drag-handle"
        title="Drag to reorder"
        aria-hidden="true"
      />
      <span
        :class="ITEM_ICONS[item.type]"
        class="text-xl flex-shrink-0 mt-0.5"
      />
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold flex items-center gap-2 min-w-0">
          <RouterLink
            :to="itemPath(item)"
            class="stretched-link block truncate min-w-0 text-blue-600 dark:text-blue-400 hover:underline"
          >
            {{ title }}
          </RouterLink>
          <PrivateBadge v-if="item.private" />
        </h3>
        <div class="item-meta">
          <span
            v-if="item.type === 'collection'"
            class="flex items-center gap-1"
          >
            <EntityAvatar
              :username="item.owner.name"
              :is-org="item.owner.type === 'org'"
              :name="item.owner.name"
              :size="14"
            />
            {{ item.owner.name }}
          </span>
          <span v-for="row in stats" :key="row">{{ row }}</span>
          <span v-if="updated">Updated {{ updated }}</span>
        </div>
        <p
          v-if="item.type === 'collection' && item.description"
          class="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2"
        >
          {{ item.description }}
        </p>
      </div>
      <div v-if="editable" class="item-actions">
        <button
          type="button"
          class="icon-button"
          title="Move earlier"
          aria-label="Move earlier"
          :disabled="!canMoveUp"
          @click="$emit('move', -1)"
        >
          <span class="i-carbon-arrow-up" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="Move later"
          aria-label="Move later"
          :disabled="!canMoveDown"
          @click="$emit('move', 1)"
        >
          <span class="i-carbon-arrow-down" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="Edit the note"
          aria-label="Edit the note"
          @click="$emit('edit-note')"
        >
          <span class="i-carbon-edit" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-button danger"
          title="Remove from the collection"
          aria-label="Remove from the collection"
          @click="$emit('remove')"
        >
          <span class="i-carbon-trash-can" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="parts.length" class="item-note">
      <template v-for="(part, index) in parts" :key="index">
        <a
          v-if="part.href"
          :href="part.href"
          target="_blank"
          rel="noopener nofollow"
          class="note-link"
          >{{ part.text }}</a
        >
        <template v-else>{{ part.text }}</template>
      </template>
    </p>
  </div>
</template>

<style scoped>
.item-card.is-dragging {
  opacity: 0.45;
}
.drag-handle {
  cursor: grab;
  color: var(--site-muted, #6b7068);
  font-size: 1.1rem;
  margin-top: 0.2rem;
  position: relative;
  z-index: 2;
}
.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.9rem;
  font-size: 0.75rem;
  color: var(--site-muted, #6b7068);
  margin-top: 0.15rem;
}
.item-note {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  background: var(--site-surface-2, rgba(128, 128, 128, 0.08));
  font-size: 0.8125rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  position: relative;
  z-index: 2;
}
.note-link {
  color: #2563eb;
  text-decoration: underline;
}
.item-actions {
  display: flex;
  gap: 0.25rem;
  position: relative;
  z-index: 2;
}
.icon-button {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 0.25rem;
  cursor: pointer;
  color: var(--site-muted, #6b7068);
}
.icon-button:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.15);
  color: inherit;
}
.icon-button:disabled {
  opacity: 0.35;
  cursor: default;
}
.icon-button.danger:hover {
  color: #dc2626;
}
</style>
