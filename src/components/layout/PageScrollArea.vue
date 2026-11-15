<template>
  <ElScrollbar
    class="page-scroll-area"
    :style="{ '--repository-sticky-offset': `${repositoryStickyOffset}px` }"
    wrap-class="page-scroll-wrap"
    view-class="page-scroll-content"
    :tabindex="0"
    always
    role="region"
    aria-label="Page content"
  >
    <slot />
  </ElScrollbar>
</template>

<script setup>
import { ElScrollbar } from "element-plus";
import { provide, ref } from "vue";

const repositoryStickyOffset = ref(0);
provide("repositoryStickyOffset", repositoryStickyOffset);
</script>

<style scoped>
.page-scroll-area {
  flex: 1;
  min-height: 0;
  height: 0;
  width: 100%;
}

:deep(.page-scroll-wrap) {
  scroll-padding-top: var(--repository-sticky-offset, 0px);
}

:deep(.page-scroll-content) {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
</style>
