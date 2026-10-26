<script setup>
import { computed } from "vue";
import { formatShape } from "./model-facts.js";

const task = defineModel({ type: Object, required: true });
defineProps({
  resource: { type: Object, required: true },
  facts: { type: Object, required: true },
  repository: { type: Object, required: true },
});
const emit = defineEmits(["change", "output-kind", "refresh-model"]);
const classification = computed(
  () => task.value.pipeline.output.kind === "classification",
);
const channelLabels = computed(() =>
  task.value.pipeline.input.color === "BGR" ? ["B", "G", "R"] : ["R", "G", "B"],
);
const labelsText = computed({
  get: () => task.value.pipeline.output.labels.join("\n"),
  // Preserve unfinished lines while editing. Save/generate validates the task.
  set: (value) => {
    task.value.pipeline.output.labels = value.split(/\r?\n/);
    if (!classification.value) task.value.pipeline.output.topK = 1;
  },
});
function changed() {
  emit("change");
}
</script>

<template>
  <section class="cc-task-section cc-pipeline-section" aria-label="模型资源">
    <h3>Space 仓库资源</h3>
    <div class="cc-repository-heading" data-testid="space-context">
      <div>
        <strong>{{ repository.context?.id || "正在读取仓库…" }}</strong
        ><span
          >{{ repository.context?.revision
          }}{{ repository.context?.local ? " · 本地目录" : "" }}</span
        >
      </div>
      <el-button
        link
        size="small"
        data-testid="refresh-repository"
        :disabled="repository.status === 'loading'"
        @click="repository.refresh"
        >刷新文件</el-button
      >
    </div>
    <p
      v-if="repository.selectionError"
      class="cc-model-resource-error"
      role="alert"
      data-testid="repository-error"
    >
      {{ repository.selectionError }}
    </p>
    <el-form-item label="ONNX 模型文件">
      <el-select
        :model-value="repository.selectedModel"
        filterable
        :loading="repository.status === 'loading'"
        data-testid="model-file"
        aria-label="ONNX 模型文件"
        @change="repository.selectModel"
      >
        <el-option
          v-for="file in repository.models"
          :key="file.path"
          :value="file.path"
          :label="file.path"
        />
      </el-select>
    </el-form-item>
    <div
      class="cc-model-resource"
      data-testid="model-resource-status"
      :data-state="resource.status"
      aria-live="polite"
      :aria-busy="resource.status === 'loading'"
    >
      <div class="cc-model-resource-heading">
        <span>{{
          resource.status === "ready"
            ? "模型文件信息"
            : resource.status === "loading"
              ? "正在读取模型信息…"
              : resource.status === "idle"
                ? "请选择模型文件"
                : "模型读取失败"
        }}</span>
        <el-button
          link
          size="small"
          :disabled="resource.status === 'loading'"
          data-testid="refresh-model"
          @click="emit('refresh-model')"
          >重新读取</el-button
        >
      </div>
      <p
        v-if="resource.status === 'error'"
        class="cc-model-resource-error"
        role="alert"
      >
        {{ resource.error }}
      </p>
      <template v-else-if="resource.status === 'ready'">
        <output data-testid="model-bytes" :data-bytes="task.model.bytes"
          >{{ (task.model.bytes / 1e6).toFixed(2) }} MB ·
          {{ task.model.bytes.toLocaleString("zh-CN") }} 字节</output
        >
        <div
          v-for="direction in ['inputs', 'outputs']"
          :key="direction"
          class="cc-tensor-list"
          :data-testid="`model-${direction}`"
        >
          <div
            v-for="tensor in resource[direction]"
            :key="tensor.name"
            class="cc-tensor-fact"
          >
            <span
              >{{ direction === "inputs" ? "输入" : "输出" }} ·
              {{ tensor.name }}</span
            ><code>{{ tensor.type }} {{ formatShape(tensor.shape) }}</code>
          </div>
        </div>
        <p
          v-if="facts.error"
          class="cc-model-resource-error"
          role="alert"
          data-testid="model-compatibility-error"
        >
          {{ facts.error }}
        </p>
        <details class="cc-model-digest">
          <summary>SHA-256 校验信息</summary>
          <code data-testid="model-sha256">{{ task.model.sha256 }}</code>
        </details>
      </template>
    </div>
    <el-form-item label="示例图片">
      <el-select
        :model-value="repository.selectedSample"
        filterable
        clearable
        placeholder="可选"
        data-testid="sample-file"
        aria-label="示例图片"
        @change="repository.selectSample"
      >
        <el-option
          v-for="file in repository.images"
          :key="file.path"
          :value="file.path"
          :label="file.path"
        />
      </el-select>
    </el-form-item>
  </section>

  <section class="cc-task-section cc-pipeline-section" aria-label="图像前处理">
    <h3>图像前处理</h3>
    <div class="cc-fixed-fact">
      输入张量
      <output data-testid="input-name">{{
        resource.status === "ready" ? task.pipeline.input.name : "—"
      }}</output>
    </div>
    <div class="cc-pipeline-pair">
      <el-form-item label="输入宽度">
        <output
          v-if="facts.width && resource.status === 'ready'"
          class="cc-dimension"
          data-testid="input-width"
          >{{ facts.width }} <small>固定</small></output
        >
        <el-input-number
          v-else-if="resource.status === 'ready'"
          v-model="task.pipeline.input.width"
          :min="1"
          :max="1024"
          :step="1"
          controls-position="right"
          data-testid="input-width"
          aria-label="动态输入宽度"
          @change="changed"
        />
        <output v-else class="cc-dimension" data-testid="input-width">—</output>
      </el-form-item>
      <el-form-item label="输入高度">
        <output
          v-if="facts.height && resource.status === 'ready'"
          class="cc-dimension"
          data-testid="input-height"
          >{{ facts.height }} <small>固定</small></output
        >
        <el-input-number
          v-else-if="resource.status === 'ready'"
          v-model="task.pipeline.input.height"
          :min="1"
          :max="1024"
          :step="1"
          controls-position="right"
          data-testid="input-height"
          aria-label="动态输入高度"
          @change="changed"
        />
        <output v-else class="cc-dimension" data-testid="input-height"
          >—</output
        >
      </el-form-item>
    </div>
    <div class="cc-pipeline-pair">
      <el-form-item label="输入布局">
        <output
          v-if="facts.autoLayout && resource.status === 'ready'"
          class="cc-dimension"
          data-testid="input-layout"
          >{{ facts.autoLayout }} <small>自动识别</small></output
        >
        <el-select
          v-else
          v-model="task.pipeline.input.layout"
          data-testid="input-layout"
          aria-label="输入布局"
          @change="changed"
        >
          <el-option label="NCHW" value="NCHW" />
          <el-option label="NHWC" value="NHWC" />
        </el-select>
      </el-form-item>
      <el-form-item label="颜色顺序">
        <el-select
          v-model="task.pipeline.input.color"
          data-testid="input-color"
          aria-label="颜色顺序"
          @change="changed"
        >
          <el-option label="RGB" value="RGB" />
          <el-option label="BGR" value="BGR" />
        </el-select>
      </el-form-item>
    </div>
    <el-form-item label="缩放插值">
      <el-select
        v-model="task.pipeline.input.interpolation"
        data-testid="input-interpolation"
        aria-label="缩放插值"
        @change="changed"
      >
        <el-option label="Pillow Bicubic" value="pillow-bicubic" />
        <el-option label="Pillow Bilinear" value="pillow-bilinear" />
      </el-select>
    </el-form-item>
    <p class="cc-pipeline-help">图片拉伸至输入尺寸，透明区域填充白色。</p>
    <el-form-item label="像素缩放系数 · scale">
      <el-input-number
        v-model="task.pipeline.input.scale"
        :step="0.001"
        controls-position="right"
        data-testid="input-scale"
        aria-label="像素缩放系数"
        @change="changed"
      />
    </el-form-item>
    <div
      v-for="(channel, index) in channelLabels"
      :key="index"
      class="cc-pipeline-pair"
    >
      <el-form-item :label="`${channel} · 均值`">
        <el-input-number
          v-model="task.pipeline.input.mean[index]"
          :step="0.01"
          controls-position="right"
          :data-testid="`input-mean-${index}`"
          :aria-label="`${channel} 通道均值`"
          @change="changed"
        />
      </el-form-item>
      <el-form-item :label="`${channel} · 标准差`">
        <el-input-number
          v-model="task.pipeline.input.std[index]"
          :step="0.01"
          controls-position="right"
          :data-testid="`input-std-${index}`"
          :aria-label="`${channel} 通道标准差`"
          @change="changed"
        />
      </el-form-item>
    </div>
    <p class="cc-pipeline-help">
      按颜色顺序逐通道归一化：<br /><code
        >(像素值 × scale − 均值) / 标准差</code
      >
    </p>
  </section>

  <section class="cc-task-section cc-pipeline-section" aria-label="输出解码">
    <h3>输出解码</h3>
    <el-form-item label="输出张量">
      <el-select
        v-if="resource.status === 'ready' && resource.outputs?.length > 1"
        v-model="task.pipeline.output.name"
        data-testid="output-name"
        aria-label="输出张量"
        placeholder="选择需要解码的输出"
        @change="changed"
      >
        <el-option
          v-for="tensor in resource.outputs"
          :key="tensor.name"
          :value="tensor.name"
          :label="`${tensor.name} · ${tensor.type} ${formatShape(tensor.shape)}`"
        />
      </el-select>
      <output v-else class="cc-dimension" data-testid="output-name">{{
        resource.status === "ready" ? task.pipeline.output.name : "—"
      }}</output>
    </el-form-item>
    <el-form-item label="输出类型">
      <el-select
        v-model="task.pipeline.output.kind"
        data-testid="output-kind"
        aria-label="输出类型"
        @change="emit('output-kind', $event)"
      >
        <el-option label="目标检测" value="yolo-detection" />
        <el-option label="图像分类" value="classification" />
      </el-select>
    </el-form-item>
    <el-form-item v-if="!classification" label="检测张量布局">
      <output
        v-if="facts.autoOutputLayout && resource.status === 'ready'"
        class="cc-dimension"
        data-testid="output-layout"
        >{{ facts.autoOutputLayout }} <small>自动识别</small></output
      >
      <el-select
        v-else
        v-model="task.pipeline.output.layout"
        data-testid="output-layout"
        aria-label="检测张量布局"
        @change="changed"
      >
        <el-option label="BCN" value="BCN" />
        <el-option label="BNC" value="BNC" />
      </el-select>
    </el-form-item>
    <el-form-item label="分数转换">
      <el-select
        v-model="task.pipeline.output.activation"
        data-testid="output-activation"
        aria-label="分数转换"
        @change="changed"
      >
        <el-option label="无 · 直接使用输出分数" value="none" />
        <el-option label="Softmax · 模型输出 logits" value="softmax" />
      </el-select>
    </el-form-item>
    <el-form-item label="类别标签来源">
      <el-select
        :model-value="repository.selectedLabels"
        filterable
        data-testid="label-file"
        aria-label="类别标签来源"
        @change="repository.selectLabels"
      >
        <el-option value="" label="手动填写" />
        <el-option
          v-for="file in repository.labelFiles"
          :key="file.path"
          :value="file.path"
          :label="file.path"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="类别标签 · 每行一个">
      <el-input
        v-model="labelsText"
        :readonly="Boolean(task.labelFile)"
        type="textarea"
        :rows="4"
        data-testid="output-labels"
        aria-label="类别标签"
        @input="changed"
      />
      <p class="cc-pipeline-help cc-pipeline-inline-help">
        顺序与模型输出的类别索引一致。
      </p>
    </el-form-item>
    <el-form-item v-if="classification" label="分类结果数量 · Top K">
      <el-input-number
        v-model="task.pipeline.output.topK"
        :step="1"
        controls-position="right"
        data-testid="output-topk"
        aria-label="分类结果数量"
        @change="changed"
      />
    </el-form-item>
  </section>
</template>

<style scoped>
.cc-pipeline-section {
  min-width: 0;
  border-top: 1px solid var(--cc-border);
  margin-top: 20px;
  padding-top: 18px;
}
.cc-pipeline-section h3 {
  color: var(--cc-text-strong);
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 16px;
}
.cc-pipeline-section :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.cc-pipeline-section :deep(.el-form-item__label) {
  font-size: 12px;
}
.cc-pipeline-section :deep(.el-form-item__content) {
  min-width: 0;
}
.cc-pipeline-section :deep(.el-select),
.cc-pipeline-section :deep(.el-input-number),
.cc-pipeline-section :deep(.el-input) {
  width: 100%;
  min-width: 0;
}
.cc-pipeline-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
.cc-pipeline-pair :deep(.el-input__wrapper) {
  padding-left: 7px;
}
.cc-pipeline-pair :deep(.el-input-number .el-input__inner) {
  text-align: left;
}
.cc-pipeline-help {
  color: var(--cc-text-muted);
  font-size: 11px;
  line-height: 1.6;
  margin: -3px 0 14px;
  overflow-wrap: anywhere;
}
.cc-pipeline-inline-help {
  width: 100%;
  margin: 5px 0 0;
}
.cc-pipeline-help code {
  font-family: inherit;
}
.cc-model-resource {
  margin: 0 0 16px;
  padding: 12px;
  border: 1px solid var(--cc-border);
  border-radius: var(--el-border-radius-base);
  background: var(--cc-surface-soft);
  color: var(--cc-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
.cc-model-resource-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--cc-text-secondary);
}
.cc-model-resource output {
  display: block;
  margin-top: 5px;
  color: var(--cc-text-strong);
  font-variant-numeric: tabular-nums;
}
.cc-model-resource-error {
  color: var(--el-color-danger);
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.cc-model-digest {
  margin-top: 8px;
}
.cc-model-digest summary {
  cursor: pointer;
}
.cc-model-digest code {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
  font-size: 11px;
  user-select: all;
}
.cc-repository-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 12px;
}
.cc-repository-heading strong,
.cc-repository-heading span {
  display: block;
  overflow-wrap: anywhere;
}
.cc-repository-heading span {
  margin-top: 4px;
  color: var(--cc-text-muted);
  font-size: 11px;
}
.cc-tensor-list {
  margin-top: 10px;
}
.cc-tensor-fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}
.cc-tensor-fact code {
  color: var(--cc-text-strong);
  overflow-wrap: anywhere;
  font-size: 11px;
}
.cc-fixed-fact {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
  font-size: 12px;
  color: var(--cc-text-muted);
  gap: 12px;
}
.cc-fixed-fact output {
  color: var(--cc-text-strong);
  overflow-wrap: anywhere;
}
.cc-dimension {
  display: block;
  width: 100%;
  padding: 0 10px;
  min-height: 32px;
  background: var(--cc-surface-soft);
  border-radius: var(--el-border-radius-base);
  color: var(--cc-text-strong);
}
.cc-dimension small {
  float: right;
  font-size: 10px;
  color: var(--cc-text-muted);
}
</style>
