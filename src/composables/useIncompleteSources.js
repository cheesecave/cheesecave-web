// The external sources a page's lists had to leave out: one entry per repository type, shown as one set.

import { computed, reactive } from "vue";

export function useIncompleteSources() {
  const byType = reactive({});
  const sources = computed(() => [...new Set(Object.values(byType).flat())]);
  const record = (type, names) => {
    byType[type] = names;
  };
  return { sources, record };
}
