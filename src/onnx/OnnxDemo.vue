<script setup>
import RuntimeView from "./runtime/RuntimeView.vue";
import { installOnnxComponents } from "./install.js";
import { bindOnnxDocument } from "@/utils/onnx-space.js";
const props = defineProps({
  document: { type: Object, required: true },
  context: { type: Object, required: true },
});
installOnnxComponents(getCurrentInstance().appContext.app);
const bound = computed(() => bindOnnxDocument(props.document, props.context));
</script>
<template>
  <section class="cc-onnx-space" aria-label="ONNX demo">
    <RuntimeView :document="bound" />
  </section>
</template>
