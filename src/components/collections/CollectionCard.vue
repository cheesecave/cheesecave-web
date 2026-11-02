<script setup>
import { computed } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import PrivateBadge from "@/components/repo/PrivateBadge.vue";
import { formatRelativeTime } from "@/utils/datetime";
import { ITEM_ICONS, collectionPath, themeColor } from "@/utils/collections";

// A collection in a list or on a profile: the title is the one link and its ::after stretches over the card
// (.stretched-link in style.css). The first three items are shown, as on Hugging Face; a list answers four at most.
const props = defineProps({
  collection: { type: Object, required: true },
  showOwner: { type: Boolean, default: false },
});

const preview = computed(() => props.collection.items.slice(0, 3));
const more = computed(() => props.collection.items.length > 3);
const label = (item) => (item.type === "collection" ? item.title : item.id);
</script>

<template>
  <div
    class="card collection-card relative hover:shadow-md transition-shadow"
    :style="{ '--theme': themeColor(collection.theme) }"
  >
    <div class="flex items-start gap-2 mb-1">
      <h3 class="font-semibold min-w-0 flex-1 flex items-center gap-2">
        <RouterLink
          :to="collectionPath(collection.slug)"
          class="stretched-link block truncate min-w-0 collection-title"
        >
          {{ collection.title }}
        </RouterLink>
        <PrivateBadge v-if="collection.private" />
      </h3>
    </div>
    <p
      v-if="collection.description"
      class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2"
    >
      {{ collection.description }}
    </p>
    <ul class="collection-preview" aria-label="First items">
      <li v-for="item in preview" :key="item._id">
        <span :class="ITEM_ICONS[item.type]" class="flex-shrink-0" />
        <span class="truncate">{{ label(item) }}</span>
      </li>
      <li v-if="!preview.length" class="text-gray-500">No items yet</li>
      <li v-else-if="more" class="text-gray-500">and more</li>
    </ul>
    <div class="collection-foot">
      <span v-if="showOwner" class="flex items-center gap-1 min-w-0">
        <EntityAvatar
          :username="collection.owner.name"
          :is-org="collection.owner.type === 'org'"
          :name="collection.owner.name"
          :size="16"
        />
        <span class="truncate">{{ collection.owner.name }}</span>
      </span>
      <span class="flex items-center gap-1">
        <span class="i-carbon-thumbs-up" aria-hidden="true" />
        {{ collection.upvotes }}
      </span>
      <span class="truncate">
        Updated {{ formatRelativeTime(collection.lastUpdated, "never") }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* the colour of the collection: a bar down the left edge (a pseudo-element: the global .card rule owns the border) */
.collection-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  border-radius: 8px 0 0 8px;
  background: var(--theme);
}
.collection-title {
  color: inherit;
}
.collection-title:hover {
  text-decoration: underline;
}
.collection-preview {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
}
.collection-preview li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.collection-foot {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  font-size: 0.75rem;
  color: var(--site-muted, #6b7068);
}
</style>
