<script setup>
import { computed, resolveComponent } from "vue";

// Page numbers as real links (right-click, middle-click and Ctrl/Cmd-click work). The page list
// follows Element Plus's pager (first, last, a window around the open page, "…" that jumps three).
const props = defineProps({
  currentPage: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  // page number -> route location
  target: { type: Function, required: true },
});
const JUMP = 3;
// RouterLink marks every link to the open route as aria-current="page" (it ignores the query),
// so each link says `aria-current` is null; only the open page's own <span> carries it.
// Looked up by name, as LinkButton does, so tests that mock vue-router can stub it
const RouterLink = resolveComponent("RouterLink");
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
);
const items = computed(() => {
  const last = pageCount.value;
  const current = props.currentPage;
  const more = last > 5;
  const prevMore = more && current > 3;
  const nextMore = more && current < last - 2;
  let middle = [];
  if (prevMore && !nextMore) middle = range(last - 3, last - 1);
  else if (!prevMore && nextMore) middle = range(2, 4);
  else if (prevMore && nextMore) middle = range(current - 1, current + 1);
  else middle = range(2, last - 1);
  return [
    { page: 1 },
    ...(prevMore
      ? [{ page: Math.max(1, current - JUMP), jump: "Previous" }]
      : []),
    ...middle.map((page) => ({ page })),
    ...(nextMore
      ? [{ page: Math.min(last, current + JUMP), jump: "Next" }]
      : []),
    ...(last > 1 ? [{ page: last }] : []),
  ];
});
function range(from, to) {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}
</script>

<template>
  <nav class="link-pager" aria-label="Pagination">
    <component
      :is="currentPage > 1 ? RouterLink : 'span'"
      class="pager-step"
      aria-label="Previous page"
      v-bind="
        currentPage > 1
          ? {
              to: target(currentPage - 1),
              replace: true,
              rel: 'prev',
              'aria-current': null,
            }
          : { 'aria-disabled': 'true' }
      "
    >
      <span class="i-carbon-chevron-left" aria-hidden="true" />
    </component>
    <template v-for="item in items" :key="item.jump ? item.jump : item.page">
      <span
        v-if="!item.jump && item.page === currentPage"
        class="pager-page"
        aria-current="page"
        :aria-label="`Page ${item.page}`"
        >{{ item.page }}</span
      >
      <component
        :is="RouterLink"
        v-else
        class="pager-page"
        :class="{ 'pager-jump': item.jump }"
        :to="target(item.page)"
        replace
        :aria-current="null"
        :aria-label="
          item.jump ? `${item.jump} ${JUMP} pages` : `Page ${item.page}`
        "
      >
        {{ item.jump ? "…" : item.page }}
      </component>
    </template>
    <component
      :is="currentPage < pageCount ? RouterLink : 'span'"
      class="pager-step"
      aria-label="Next page"
      v-bind="
        currentPage < pageCount
          ? {
              to: target(currentPage + 1),
              replace: true,
              rel: 'next',
              'aria-current': null,
            }
          : { 'aria-disabled': 'true' }
      "
    >
      <span class="i-carbon-chevron-right" aria-hidden="true" />
    </component>
  </nav>
</template>

<style scoped>
/* The look of the Element Plus pager it replaces: tiles on the card colour, the open page bold */
.link-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  font-size: 14px;
}
.pager-page,
.pager-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--site-card, #fffdf7);
  color: var(--site-text, #2c332b);
  font-weight: 400;
  text-decoration: none;
}
.pager-jump {
  font-weight: 700;
}
a.pager-page:hover,
a.pager-step:hover {
  color: var(--site-page-link, #94621f);
}
a.pager-page:focus-visible,
a.pager-step:focus-visible {
  outline: 2px solid var(--site-primary, #c28b37);
  outline-offset: -2px;
}
.pager-page[aria-current="page"] {
  font-weight: 700;
  color: var(--site-page-link, #94621f);
}
.pager-step[aria-disabled="true"] {
  color: var(--el-pagination-button-disabled-color, #858881);
  cursor: not-allowed;
}
</style>
