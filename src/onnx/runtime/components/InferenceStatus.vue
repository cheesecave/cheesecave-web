<script setup>
import { computed, inject } from "vue";
import {
  formatBytes,
  formatMs,
  inferenceContext,
  taskContext,
} from "../context.js";
defineProps({
  title: { default: "运行状态与开销" },
  showDetails: { type: Boolean, default: true },
  showHistory: { type: Boolean, default: true },
});
const runtime = inject(inferenceContext, null);
const authorTask = inject(taskContext, null);
const task = computed(() => runtime?.document.value.task || authorTask?.value);
const metrics = computed(
  () =>
    runtime?.metrics.value || {
      status: "idle",
      resultKind: task.value?.pipeline.output.kind,
      timings: {},
      assets: { modelBytes: task.value?.model.bytes },
      benchmark: {},
      memory: {},
    },
);
const resultLabel = computed(() =>
  metrics.value.resultKind === "classification" ? "类别" : "检测目标",
);
const progress = computed(() =>
  metrics.value.status === "loading"
    ? runtime.downloadPercent.value
    : Math.round(
        ((metrics.value.benchmark.completedRuns || 0) /
          (metrics.value.benchmark.totalRuns || 1)) *
          100,
      ),
);
const diagnostics = computed(() => !!runtime?.diagnosticsEnabled);
const pairs = computed(() => [
  [
    "计算方式",
    metrics.value.actualBackend
      ? `${metrics.value.actualBackend.toUpperCase()} · ${metrics.value.threads} 线程`
      : "待启动",
  ],
  ["单次推理", formatMs(metrics.value.timings.lastInferenceMs)],
  ...(diagnostics.value
    ? [
        ["连续测量均值", formatMs(metrics.value.benchmark.meanMs)],
        ["P95", formatMs(metrics.value.benchmark.p95Ms)],
      ]
    : []),
  [
    "模型文件",
    formatBytes(metrics.value.assets.modelBytes ?? task.value?.model.bytes),
  ],
  ["运行时文件", formatBytes(metrics.value.assets.runtimeDecodedBytes)],
  ["模型读取", formatMs(metrics.value.timings.modelFetchMs)],
  ["会话初始化", formatMs(metrics.value.timings.initMs)],
  ["首次推理", formatMs(metrics.value.timings.firstInferenceMs)],
  ["前处理", formatMs(metrics.value.timings.preprocessMs)],
  ["后处理", formatMs(metrics.value.timings.postprocessMs)],
  ["页面 JS 堆", formatBytes(metrics.value.memory.jsHeapUsedBytes)],
]);
const adapter = computed(() => {
  const value = metrics.value.adapter;
  return value
    ? value.description ||
        [value.vendor, value.architecture, value.device]
          .filter(Boolean)
          .join(" / ")
    : metrics.value.actualBackend === "wasm"
      ? "CPU 执行"
      : "";
});
const json = computed(() =>
  JSON.stringify(runtime?.snapshot.value || metrics.value, null, 2),
);
</script>
<template>
  <section class="cc-status">
    <header class="cc-component-heading">
      <strong>{{ title }}</strong>
      <div class="cc-status-actions">
        <span
          id="status-dot"
          class="cc-status-dot"
          :data-state="metrics.status || 'idle'"
        /><el-button
          id="export-btn"
          size="small"
          :disabled="!runtime?.canExport.value"
          @click="runtime?.exportMetrics()"
          >导出测量结果</el-button
        >
      </div>
    </header>
    <p id="status-text" class="cc-status-message" role="status">
      {{ runtime?.statusText.value || "选择图片或载入示例后开始" }}
    </p>
    <el-progress
      v-if="runtime?.busy.value"
      id="download-progress"
      :percentage="progress"
      :indeterminate="metrics.status === 'running'"
    />
    <el-alert
      v-if="metrics.error"
      id="error-box"
      :title="metrics.error"
      type="error"
      :closable="false"
      show-icon
    />
    <dl class="cc-metric-grid">
      <div v-for="[label, value] in pairs" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>
    <p v-if="adapter" class="cc-quiet">{{ adapter }}</p>
    <p class="cc-quiet">
      页面 JS 堆不含 Worker、WASM 和 GPU；下载耗时来自本地服务。
    </p>
    <details
      v-if="showHistory && runtime?.records.value.length"
      class="cc-details"
      open
    >
      <summary>本次运行记录</summary>
      <div class="cc-table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>计算方式</th>
              <th v-if="diagnostics">次数</th>
              <th>{{ resultLabel }}</th>
              <th>前处理</th>
              <th>推理</th>
              <th>后处理</th>
            </tr>
          </thead>
          <tbody id="history-body">
            <tr
              v-for="(row, index) in runtime.records.value"
              :key="row.at + index"
            >
              <td>
                {{
                  new Date(row.at).toLocaleTimeString("zh-CN", {
                    hour12: false,
                  })
                }}
              </td>
              <td>{{ row.backend }}</td>
              <td v-if="diagnostics">{{ row.repeats }}</td>
              <td>{{ row.resultCount ?? row.faces ?? "—" }}</td>
              <td>{{ formatMs(row.preprocessMs) }}</td>
              <td>{{ formatMs(row.inferenceMs) }}</td>
              <td>{{ formatMs(row.postprocessMs) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <details v-if="diagnostics" class="cc-details cc-diagnostics" open>
      <summary>开发诊断</summary>
      <el-button
        id="benchmark-btn"
        :disabled="!runtime?.canRun.value"
        :loading="!!runtime?.busy.value"
        @click="runtime?.benchmarkDiagnostics()"
        >诊断：连续测量 10 次</el-button
      >
    </details>
    <details v-if="showDetails" class="cc-details">
      <summary>测量数据 JSON</summary>
      <pre id="metrics-json">{{ json }}</pre>
    </details>
    <pre v-else id="metrics-json" hidden>{{ json }}</pre>
  </section>
</template>
