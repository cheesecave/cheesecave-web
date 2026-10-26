<script setup>
defineProps({ text: { default: "说明文字" } });
</script>
<template>
  <p class="cc-text">{{ text }}</p>
</template>
