<script setup>
import { computed, inject } from "vue";
import { inferenceContext } from "../context.js";
defineOptions({ inheritAttrs: false });
const props = defineProps({
  label: { default: "重置参数" },
  type: { default: "default" },
  actionId: { default: "resetParameters" },
  disabled: { type: Boolean, default: false },
});
const runtime = inject(inferenceContext, null);
const isDisabled = computed(
  () =>
    props.disabled ||
    props.actionId !== "resetParameters" ||
    !!runtime?.busy.value,
);
function click() {
  if (!isDisabled.value && props.actionId === "resetParameters")
    runtime?.resetParameters();
}
</script>
<template>
  <el-button
    :type="type"
    :disabled="isDisabled"
    class="cc-ordinary-button"
    :data-action="actionId"
    @click="click"
    >{{ label }}</el-button
  >
</template>
