<script setup>
import { computed, inject } from "vue";
import { inferenceContext } from "../context.js";
defineOptions({ inheritAttrs: false });
const props = defineProps({
  actionId: { default: "run" },
  label: { default: "运行检测" },
  type: { default: "primary" },
});
const runtime = inject(inferenceContext, null);
const disabled = computed(() => !runtime?.canRun.value);
</script>
<template>
  <el-button
    id="run-btn"
    :type="type"
    :disabled="disabled"
    :loading="!!runtime?.busy.value"
    class="cc-action-button"
    @click="runtime?.runInference()"
    >{{ label }}</el-button
  >
</template>
