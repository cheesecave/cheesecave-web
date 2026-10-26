<script setup>
import { computed } from "vue";
const props = defineProps({ text: { default: "标题" }, level: { default: 2 } });
const tag = computed(() =>
  [1, 2, 3, 4, 5, 6].includes(Number(props.level))
    ? `h${Number(props.level)}`
    : "h2",
);
</script>
<template>
  <component :is="tag" class="cc-heading">{{ text }}</component>
</template>
