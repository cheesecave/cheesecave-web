<template>
  <ElScrollbar
    class="page-scroll-area"
    :class="{ 'page-scroll-fit': fit }"
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
defineProps({ fit: Boolean });
</script>

<style scoped>
.page-scroll-area {
  flex: 1;
  min-height: 0;
  height: 0;
  width: 100%;
}

:deep(.page-scroll-content) {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.page-scroll-fit :deep(.page-scroll-wrap) {
  overflow: hidden;
}
.page-scroll-fit :deep(.page-scroll-content) {
  height: 100%;
  min-height: 0;
}
.page-scroll-fit :deep(.el-scrollbar__bar) {
  display: none;
}
</style>
