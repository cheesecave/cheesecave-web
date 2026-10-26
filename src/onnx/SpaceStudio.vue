<script setup>
import Editor from "./editor/Editor.vue";
import { installOnnxComponents } from "./install.js";
defineProps({
  context: { type: Object, required: true },
  document: { type: Object, default: null },
  saveDocument: { type: Function, required: true },
  reloadDocument: { type: Function, required: true },
  previewTo: { type: [Object, String], required: true },
});
installOnnxComponents(getCurrentInstance().appContext.app);
</script>
<template>
  <div class="cc-onnx-space cc-studio">
    <Editor
      :context="context"
      :document="document"
      :save-document="saveDocument"
      :reload-document="reloadDocument"
      :preview-to="previewTo"
    />
  </div>
</template>
