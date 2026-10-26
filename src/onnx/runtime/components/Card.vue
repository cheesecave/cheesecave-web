<script setup>
defineProps({ title: { default: "" } });
</script>
<template>
  <el-card class="cc-card" shadow="never"
    ><template v-if="title" #header
      ><strong>{{ title }}</strong></template
    ><slot
  /></el-card>
</template>
