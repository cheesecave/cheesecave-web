<script setup>
import { computed } from "vue";
import { formatShare } from "@/utils/repo-derived";

const props = defineProps({
  // From `modelSummary`: the size, the tensor types and the architecture of a model
  summary: {
    type: Object,
    required: true,
  },
});

// One type is just its name; several say how the model is made up
const types = computed(() => {
  const list = props.summary.tensorTypes;
  return list.length === 1
    ? list[0].dtype
    : list.map((t) => `${t.dtype} ${formatShare(t.share)}`).join(" · ");
});
</script>

<template>
  <div class="card">
    <h3 class="font-semibold mb-3">Model</h3>
    <div class="space-y-2 text-sm">
      <div v-if="summary.parameters" data-row="size">
        <span class="text-gray-600 dark:text-gray-400">Model size:</span>
        <span class="ml-2 font-medium" data-value
          >{{ summary.parameters }} params</span
        >
      </div>
      <div v-if="summary.tensorTypes.length" data-row="types">
        <span class="text-gray-600 dark:text-gray-400">Tensor type:</span>
        <span class="ml-2 font-mono text-xs" data-value>{{ types }}</span>
      </div>
      <div v-if="summary.architectures.length" data-row="architecture">
        <span class="text-gray-600 dark:text-gray-400">Architecture:</span>
        <span class="ml-2 font-mono text-xs" data-value>{{
          summary.architectures.join(", ")
        }}</span>
      </div>
      <div v-if="summary.modelType" data-row="model-type">
        <span class="text-gray-600 dark:text-gray-400">Model type:</span>
        <span class="ml-2 font-mono text-xs" data-value>{{
          summary.modelType
        }}</span>
      </div>
    </div>
  </div>
</template>
