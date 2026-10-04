<script setup>
import { computed, ref, useId, watch } from "vue";

const props = defineProps({
  facets: { type: Array, default: () => [] },
  selected: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["toggle", "clear"]);
const search = ref("");
const category = ref(null);
const expanded = ref({});
const searchId = `discovery-facet-search-${useId()}`;
const groups = computed(() =>
  props.facets.filter((facet) => facet.options?.length),
);
const selectionCount = computed(() =>
  Object.values(props.selected).reduce(
    (count, values) => count + (Array.isArray(values) ? values.length : 0),
    0,
  ),
);
const visibleGroups = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return groups.value
    .filter((group) => category.value === null || category.value === group.key)
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          !query ||
          `${option.label || option.value} ${option.value}`
            .toLocaleLowerCase()
            .includes(query),
      ),
    }))
    .filter((group) => group.options.length);
});
watch(groups, (value) => {
  if (
    category.value !== null &&
    !value.some((group) => group.key === category.value)
  )
    category.value = null;
});
function isSelected(key, value) {
  return props.selected[key]?.includes(value) ?? false;
}
function visibleOptions(group) {
  return expanded.value[group.key] || search.value.trim()
    ? group.options
    : group.options.slice(0, 8);
}
</script>

<template>
  <section class="repo-filter-panel" aria-label="Repository filters">
    <div class="filter-heading">
      <h2>
        Filters
        <span v-if="selectionCount" class="selection-count">{{
          selectionCount
        }}</span>
      </h2>
      <button
        v-if="selectionCount"
        type="button"
        class="clear-filters"
        @click="emit('clear')"
      >
        Clear all
      </button>
    </div>
    <nav class="filter-categories" aria-label="Filter categories">
      <button
        type="button"
        :aria-pressed="category === null"
        @click="category = null"
      >
        Main
      </button>
      <button
        v-for="group in groups"
        :key="group.key"
        type="button"
        :aria-pressed="category === group.key"
        @click="category = group.key"
      >
        {{ group.label }}
      </button>
    </nav>
    <div class="facet-search">
      <span class="i-carbon-search" aria-hidden="true" />
      <input
        :id="searchId"
        v-model="search"
        type="search"
        aria-label="Search filters"
        placeholder="Search filters"
      />
    </div>
    <div v-if="!groups.length" class="filter-empty">
      No filters available for these repositories.
    </div>
    <div v-else-if="!visibleGroups.length" class="filter-empty" role="status">
      No matching filters.
    </div>
    <section
      v-for="group in visibleGroups"
      :key="group.key"
      class="facet-group"
      :aria-label="group.label"
    >
      <h3>{{ group.label }}</h3>
      <div class="facet-options">
        <button
          v-for="option in visibleOptions(group)"
          :key="option.value"
          type="button"
          class="facet-chip"
          :aria-pressed="isSelected(group.key, option.value)"
          :title="option.label || option.value"
          @click="emit('toggle', { key: group.key, value: option.value })"
        >
          <span class="facet-label">{{ option.label || option.value }}</span>
          <span v-if="Number.isFinite(option.count)" class="facet-count">{{
            option.count.toLocaleString()
          }}</span>
        </button>
      </div>
      <button
        v-if="group.options.length > 8 && !search.trim()"
        type="button"
        class="facet-more"
        :aria-expanded="Boolean(expanded[group.key])"
        :aria-label="`${expanded[group.key] ? 'Show fewer' : 'Show more'} ${group.label} filters`"
        @click="expanded[group.key] = !expanded[group.key]"
      >
        {{
          expanded[group.key]
            ? "Show less"
            : `+ ${group.options.length - 8} more`
        }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.repo-filter-panel {
  min-width: 0;
  color: var(--site-text, #2c332b);
}
.filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.filter-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.selection-count {
  font-size: 11px;
  color: var(--site-page-muted, #6b7068);
}
button {
  font: inherit;
  cursor: pointer;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--site-primary, #c28b37);
  outline-offset: 3px;
}
.clear-filters,
.facet-more {
  border: 0;
  padding: 0;
  color: var(--site-page-link, #94621f);
  background: transparent;
  font-size: 12px;
}
.clear-filters:hover,
.facet-more:hover {
  text-decoration: underline;
}
.filter-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 16px;
}
.filter-categories button {
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 6px 8px;
  color: var(--site-page-muted, #6b7068);
  background: transparent;
  font-size: 12px;
}
.filter-categories button[aria-pressed="true"] {
  color: var(--site-card-text, #2c332b);
  background: var(--site-card, #fffdf7);
  border-color: var(--site-border, #dedfd4);
}
.facet-search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--site-border, #dedfd4);
  border-radius: 9px;
  padding: 9px 11px;
  background: var(--site-card, #fffdf7);
  color: var(--site-muted, #6b7068);
}
.facet-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--site-card-text, #2c332b);
  font: inherit;
  font-size: 12px;
}
.facet-search input::placeholder {
  color: var(--site-muted, #6b7068);
}
.facet-group {
  padding: 21px 0;
  border-bottom: 1px solid var(--site-border, #dedfd4);
}
.facet-group:last-child {
  border-bottom: 0;
}
.facet-group h3 {
  margin: 0 0 11px;
  font-size: 13px;
  font-weight: 600;
}
.facet-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.facet-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--site-border, #dedfd4);
  padding: 5px 8px;
  border-radius: 7px;
  background: var(--site-card, #fffdf7);
  color: var(--site-card-text, #2c332b);
  font-size: 11px;
  line-height: 1.4;
}
.facet-chip:hover,
.filter-categories button:hover {
  border-color: var(--site-primary, #c28b37);
}
.facet-chip[aria-pressed="true"] {
  border-color: var(--site-primary, #c28b37);
  color: var(--site-primary-text, #000);
  background: var(--site-primary, #c28b37);
}
.facet-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.facet-count {
  flex-shrink: 0;
  color: var(--site-muted, #6b7068);
  font-size: 10px;
}
.facet-chip[aria-pressed="true"] .facet-count {
  color: inherit;
}
.facet-more {
  margin-top: 11px;
}
.filter-empty {
  padding: 24px 0;
  color: var(--site-page-muted, #6b7068);
  font-size: 12px;
  line-height: 1.7;
}
</style>
