<script setup>
import { computed, provide, ref, watch } from "vue";
import { validateDocument } from "../config/document.js";
import { inferenceContext } from "./context.js";
import { useInference } from "./useInference.js";
const props = defineProps({ document: { type: Object, required: true } });
const formApi = ref(null),
  formData = ref({});
const rules = ref([]);
const documentRef = computed(() => validateDocument(props.document));
function prepareRules(source) {
  return source.map((rule) => {
    const prepared = JSON.parse(JSON.stringify(rule));
    if (
      ["ccImageInput", "ccDetectionResult", "ccClassificationResult"].includes(
        prepared.type,
      )
    )
      prepared.props = { ...prepared.props, fieldKey: prepared.field };
    if (prepared.children) prepared.children = prepareRules(prepared.children);
    return prepared;
  });
}
function prepareDocument(document) {
  rules.value = prepareRules(document.ui.rules);
  const values = {};
  const collect = (nodes) =>
    nodes.forEach((node) => {
      if (node.field && node.value !== undefined)
        values[node.field] = node.value;
      if (node.children) collect(node.children);
    });
  collect(rules.value);
  if (
    document.bindings.threshold &&
    values[document.bindings.threshold] === undefined
  )
    values[document.bindings.threshold] = document.task.params.threshold;
  if (values[document.bindings.backend] === undefined)
    values[document.bindings.backend] = document.task.params.backend;
  formData.value = values;
}
watch(documentRef, prepareDocument, { immediate: true });
const runtime = useInference(documentRef, formData, formApi);
provide(inferenceContext, runtime);
const options = computed(() => ({
  ...props.document.ui.options,
  submitBtn: false,
  resetBtn: false,
}));
defineExpose({ formApi, formData, runtime });
</script>
<template>
  <div class="cc-runtime-view" data-testid="runtime-view">
    <form-create
      v-model:api="formApi"
      v-model="formData"
      :rule="rules"
      :option="options"
    />
  </div>
</template>
