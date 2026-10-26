<script setup>
import { computed, inject } from "vue";
import { inferenceContext } from "../context.js";

const props = defineProps({
  fieldKey: String,
  modelValue: { default: null },
  title: { default: "分类结果" },
  showScores: { type: Boolean, default: true },
});
const runtime = inject(inferenceContext, null);
const bound = computed(
  () => runtime && props.fieldKey === runtime.document.value.bindings.result,
);
const completed = computed(
  () =>
    bound.value &&
    runtime.metrics.value.status === "completed" &&
    runtime.metrics.value.resultKind === "classification",
);
const classifications = computed(() =>
  completed.value ? runtime.metrics.value.classifications || [] : [],
);
const percentage = (score) => Math.min(100, Math.max(0, Number(score) * 100));
</script>

<template>
  <section class="cc-classification-result" :data-field="fieldKey">
    <header class="cc-component-heading">
      <strong>{{ title }}</strong
      ><el-tag type="info" effect="plain"
        ><span data-testid="classification-count">{{
          completed ? classifications.length : "—"
        }}</span>
        个类别</el-tag
      >
    </header>
    <ol
      v-if="classifications.length"
      class="cc-classification-list"
      aria-label="分类结果"
    >
      <li
        v-for="(item, rank) in classifications"
        :key="item.index"
        class="cc-classification-row"
        :data-index="item.index"
      >
        <span class="cc-classification-rank">{{ rank + 1 }}</span>
        <div class="cc-classification-item">
          <div class="cc-classification-summary">
            <strong class="cc-classification-label">{{ item.label }}</strong
            ><span v-if="showScores" class="cc-classification-score"
              >{{ percentage(item.score).toFixed(2) }}%</span
            >
          </div>
          <el-progress
            v-if="showScores"
            :percentage="percentage(item.score)"
            :show-text="false"
            :stroke-width="6"
            color="var(--el-color-primary)"
          />
        </div>
      </li>
    </ol>
    <div v-else class="cc-classification-empty">
      {{ completed ? "模型未返回分类结果。" : "运行后在这里查看分类与置信度" }}
    </div>
  </section>
</template>

<style scoped>
.cc-classification-result {
  width: 100%;
  min-width: 0;
}
.cc-classification-list {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-classification-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--cc-border);
  border-radius: 8px;
  background: var(--cc-surface-soft);
}
.cc-classification-rank {
  display: grid;
  place-items: center;
  flex: 0 0 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
}
.cc-classification-item {
  min-width: 0;
  flex: 1;
}
.cc-classification-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}
.cc-classification-label {
  color: var(--cc-text-strong);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.cc-classification-score {
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.cc-classification-item :deep(.el-progress) {
  margin-top: 10px;
}
.cc-classification-empty {
  display: grid;
  place-items: center;
  min-height: 130px;
  padding: 20px;
  border-radius: 8px;
  background: var(--cc-surface-muted);
  color: var(--cc-text-subtle);
  font-size: 13px;
}
</style>
