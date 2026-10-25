<script setup>
import { resolveComponent } from "vue";

// An Element Plus button that is a real link: right-click, middle-click and Ctrl/Cmd-click work,
// and a plain click is still client-side navigation. Give it `to` and the usual el-button props.
// Use it only for a destination of its own; actions (cancel, save, logout) stay el-button.
defineOptions({ inheritAttrs: false });

// Looked up by name (the router registers RouterLink globally) instead of imported: tests that
// mock "vue-router/auto" replace the very module an import would come from.
const RouterLink = resolveComponent("RouterLink");
</script>

<template>
  <el-button :tag="RouterLink" v-bind="$attrs"><slot /></el-button>
</template>
