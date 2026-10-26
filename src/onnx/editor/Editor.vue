<script setup>
import {
  computed,
  nextTick,
  onMounted,
  provide,
  reactive,
  ref,
  shallowRef,
} from "vue";
import { ElMessage } from "element-plus";
import FcDesigner from "@form-create/designer";
import OptionsEditor from "./OptionsEditor.vue";
import TaskPipelineSettings from "./TaskPipelineSettings.vue";
import { useModelResource } from "./useModelResource.js";
import { useSpaceResources } from "./useSpaceResources.js";
import { taskContext } from "../runtime/context.js";
import { createDragRules, designerConfig } from "./rules.js";
import {
  createDefaultDocument,
  createEmptyDocument,
  parseDocument,
  validateDocument,
  cleanDesignerRules,
  flattenRules,
} from "../config/document.js";
import { bindOnnxDocument } from "@/utils/onnx-space.js";

const props = defineProps({
  context: { type: Object, required: true },
  document: { type: Object, default: null },
  saveDocument: { type: Function, required: true },
  reloadDocument: { type: Function, required: true },
  previewTo: { type: [String, Object], required: true },
});

FcDesigner.component("CcOptionsEditor", OptionsEditor);
const designer = shallowRef();
const importInput = ref();
const draft = ref(createEmptyDocument());
const saving = ref(false);
const fieldRules = ref([]);
const savedAt = ref("");
const dirty = ref(false);
const error = ref("");
const configured = ref(false);
let editVersion = 0;
const space = reactive(
  useSpaceResources(
    computed(() => draft.value.task),
    changed,
    computed(() => props.context),
  ),
);
const {
  state: modelResource,
  ready: inspectionReady,
  facts: modelFacts,
  refresh: refreshModel,
} = useModelResource(
  computed(() => draft.value.task.model),
  computed(() => draft.value.task.pipeline),
  changed,
);
const modelReady = computed(() => inspectionReady.value && space.ready);
provide(
  taskContext,
  computed(() => draft.value.task),
);
const classification = computed(
  () => draft.value.task.pipeline.output.kind === "classification",
);
const menus = ref([
  { name: "inference", title: "模型演示", list: [] },
  { name: "inputs", title: "常规输入", list: [] },
  { name: "layout", title: "布局与说明", list: [] },
]);
const bindings = computed(() => [
  { key: "image", label: "图片输入", types: ["ccImageInput"] },
  ...(!classification.value
    ? [
        {
          key: "threshold",
          label: "置信度输入",
          types: ["slider", "inputNumber"],
        },
      ]
    : []),
  { key: "backend", label: "计算方式输入", types: ["select"] },
  {
    key: "result",
    label: "结果输出",
    types: [
      classification.value ? "ccClassificationResult" : "ccDetectionResult",
    ],
  },
]);
const statusText = computed(() =>
  dirty.value
    ? "有未保存修改"
    : savedAt.value
      ? `已保存 · ${savedAt.value}`
      : "预设已就绪",
);
function refreshFields() {
  if (!designer.value || !configured.value) return;
  fieldRules.value = flattenRules(cleanDesignerRules(designer.value.getRule()));
  const threshold = fieldRules.value.find(
    (rule) => rule.field === draft.value.bindings.threshold,
  )?.value;
  const backend = fieldRules.value.find(
    (rule) => rule.field === draft.value.bindings.backend,
  )?.value;
  if (Number.isFinite(threshold) && threshold >= 0 && threshold <= 1)
    draft.value.task.params.threshold = threshold;
  if (["auto", "webgpu", "wasm"].includes(backend))
    draft.value.task.params.backend = backend;
}
function changed() {
  if (!configured.value) return;
  editVersion++;
  dirty.value = true;
  requestAnimationFrame(refreshFields);
}
function designerInteraction(event) {
  // Task fields emit their own changes; navigating inspector tabs is not an edit.
  if (event.target.closest("._fc-r-tools-close")) return;
  if (event.target.closest("._fc-m, ._fc-r-tab-props")) changed();
}
function parameterChanged(key) {
  // findRule uses the designer's optional tree panel cache. The live form API
  // is available regardless of which designer panel the author has opened.
  designer.value?.dragForm.api?.setValue(
    draft.value.bindings[key],
    draft.value.task.params[key],
  );
  changed();
}
function bindingChanged() {
  parameterChanged("threshold");
  parameterChanged("backend");
}
function outputKindChanged() {
  if (classification.value) delete draft.value.bindings.threshold;
  else draft.value.task.pipeline.output.topK = 1;
  changed();
}
function fieldsFor(binding) {
  return fieldRules.value.filter(
    (rule) => rule.field && binding.types.includes(rule.type),
  );
}
function componentOptions(binding) {
  const names = {
    ccImageInput: "本地图片",
    slider: "滑块",
    inputNumber: "数字输入框",
    select: "选择框",
    ccClassificationResult: "分类结果",
    ccDetectionResult: "检测结果",
  };
  const options = fieldsFor(binding).map((rule) => ({
    value: rule.field,
    title: rule.title || rule.props?.title || names[rule.type],
  }));
  return options.map((option, index) => ({
    value: option.value,
    label:
      options.filter((item) => item.title === option.title).length > 1
        ? `${option.title}（第 ${options.slice(0, index + 1).filter((item) => item.title === option.title).length} 个）`
        : option.title,
  }));
}
async function restore(document) {
  editVersion++;
  configured.value = false;
  draft.value = document ? validateDocument(document) : createEmptyDocument();
  await nextTick();
  designer.value.setOption(draft.value.ui.options);
  designer.value.setRule(draft.value.ui.rules);
  await nextTick();
  configured.value = true;
  refreshFields();
  dirty.value = false;
  error.value = "";
}
function collect() {
  if (!modelReady.value)
    throw new Error(
      modelResource.value.error ||
        modelFacts.value.error ||
        space.selectionError ||
        "请等待模型信息读取完成",
    );
  const document = JSON.parse(JSON.stringify(draft.value));
  document.ui.rules = cleanDesignerRules(designer.value.getRule());
  // Canvas defaults and task-panel values are synchronized before serialization.
  const rules = flattenRules(document.ui.rules);
  const threshold = rules.find(
    (rule) => rule.field === document.bindings.threshold,
  );
  const backend = rules.find(
    (rule) => rule.field === document.bindings.backend,
  );
  if (threshold?.value != null)
    document.task.params.threshold = threshold.value;
  if (backend?.value != null) document.task.params.backend = backend.value;
  return validateDocument(document);
}
async function save() {
  if (saving.value) return null;
  saving.value = true;
  try {
    const document = collect();
    const version = editVersion;
    await props.saveDocument(document);
    // A completed commit only describes its captured snapshot. Later edits or
    // a restored document must keep their own UI and saved/unsaved state.
    if (version !== editVersion) return document;
    draft.value.ui = document.ui;
    savedAt.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    dirty.value = false;
    error.value = "";
    ElMessage.success("界面和任务配置已保存");
    return document;
  } catch (cause) {
    error.value = cause.message;
    return null;
  } finally {
    saving.value = false;
  }
}
function download() {
  let saved;
  try {
    saved = collect();
  } catch (cause) {
    error.value = cause.message;
    return;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "model-demo.space.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importDocument(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 250000) throw new Error("JSON 文件过大");
    const document = bindOnnxDocument(
      parseDocument(await file.text()),
      props.context,
    );
    await restore(document);
    dirty.value = true;
    ElMessage.success("JSON 已回载，保存后即可在展示页使用");
  } catch (cause) {
    error.value = cause.message;
  }
  event.target.value = "";
}
async function reload() {
  try {
    await restore(await props.reloadDocument());
    ElMessage.success("已回载保存的配置");
  } catch (cause) {
    error.value = cause.message;
  }
}
async function applyPreset() {
  try {
    const generated = createDefaultDocument(draft.value.task);
    generated.name = draft.value.name;
    await restore(generated);
    dirty.value = true;
  } catch (cause) {
    error.value = cause.message;
  }
}
onMounted(async () => {
  designer.value.addComponent(createDragRules());
  try {
    await restore(props.document);
  } catch (cause) {
    error.value = `配置未载入：${cause.message}`;
  }
});
</script>

<template>
  <section class="cc-author">
    <header class="cc-author-toolbar">
      <div class="cc-author-title">
        <span class="cc-kicker">SPACE STUDIO</span>
        <h1>构建你的模型演示</h1>
      </div>
      <div class="cc-author-actions">
        <span class="cc-save-status" :class="{ dirty }">{{ statusText }}</span>
        <el-button data-testid="reload-document" @click="reload"
          >回载</el-button
        >
        <el-button data-testid="import-document" @click="importInput.click()"
          >导入 JSON</el-button
        >
        <el-button
          data-testid="export-document"
          :disabled="!modelReady"
          @click="download"
          >导出 JSON</el-button
        >
        <el-button
          data-testid="save-document"
          type="primary"
          :loading="saving"
          :disabled="!modelReady || saving"
          @click="save"
          >保存配置</el-button
        >
        <RouterLink
          :to="previewTo"
          class="cc-preview-link"
          data-testid="open-runtime"
          >打开演示 ↗</RouterLink
        >
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          @change="importDocument"
        />
      </div>
    </header>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="cc-config-error"
      data-testid="config-error"
    />
    <div
      class="cc-designer-frame"
      @pointerup="designerInteraction"
      @keyup="designerInteraction"
    >
      <FcDesigner ref="designer" :menu="menus" :config="designerConfig">
        <template #space-config>
          <el-form
            label-position="top"
            class="cc-task-settings"
            data-testid="task-settings"
            @change="changed"
          >
            <section class="cc-task-section" aria-label="任务与资源">
              <h3>任务与资源</h3>
              <el-form-item label="演示名称"
                ><el-input
                  v-model="draft.name"
                  data-testid="document-name"
                  @input="changed"
              /></el-form-item>
            </section>
            <TaskPipelineSettings
              v-model="draft.task"
              :resource="modelResource"
              :facts="modelFacts"
              :repository="space"
              @refresh-model="refreshModel"
              @change="changed"
              @output-kind="outputKindChanged"
            />
            <section class="cc-task-section" aria-label="默认参数">
              <h3>默认参数</h3>
              <el-form-item v-if="!classification" label="默认置信度"
                ><el-input-number
                  v-model="draft.task.params.threshold"
                  :min="0"
                  :max="1"
                  :step="0.001"
                  :precision="3"
                  data-testid="default-threshold"
                  @change="parameterChanged('threshold')"
              /></el-form-item>
              <el-form-item label="默认计算方式"
                ><el-select
                  v-model="draft.task.params.backend"
                  aria-label="默认计算方式"
                  data-testid="default-backend"
                  @change="parameterChanged('backend')"
                  ><el-option value="auto" label="自动选择" /><el-option
                    value="webgpu"
                    label="WebGPU" /><el-option
                    value="wasm"
                    label="WASM · CPU" /></el-select
              ></el-form-item>
              <el-form-item v-if="!classification" label="NMS IoU"
                ><el-input-number
                  v-model="draft.task.params.iou"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :precision="2"
                  data-testid="default-iou"
                  @change="changed"
              /></el-form-item>
            </section>
            <section
              class="cc-task-section"
              aria-label="输入 / 输出"
              data-testid="component-connections"
            >
              <h3>输入 / 输出</h3>
              <el-form-item
                v-for="binding in bindings"
                :key="binding.key"
                :label="binding.label"
              >
                <el-select
                  v-model="draft.bindings[binding.key]"
                  :aria-label="binding.label"
                  placeholder="选择画布中的组件"
                  :data-testid="`binding-${binding.key}`"
                  @visible-change="refreshFields"
                  @change="bindingChanged"
                >
                  <el-option
                    v-for="option in componentOptions(binding)"
                    :key="option.value"
                    :value="option.value"
                    :label="option.label"
                  />
                </el-select>
              </el-form-item>
            </section>
            <div class="cc-preset-action">
              <el-button
                data-testid="apply-preset"
                :disabled="!modelReady"
                @click="applyPreset"
                >根据任务配置生成界面</el-button
              >
              <p>保留当前模型和处理配置，重新生成匹配的界面。</p>
            </div>
          </el-form>
        </template>
      </FcDesigner>
    </div>
    <p class="cc-author-note">
      每个任务使用一个运行推理按钮；清除图片和导出测量结果由各自组件提供。
    </p>
  </section>
</template>

<style scoped>
.cc-author {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--cc-page-bg);
}
.cc-author-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 20px;
  background: var(--cc-surface);
}
.cc-author-title {
  flex-shrink: 0;
}
.cc-kicker {
  font-size: 10px;
  letter-spacing: 0.17em;
  color: var(--el-color-primary);
  font-weight: 750;
}
.cc-author h1 {
  margin: 4px 0 0;
  font-size: 19px;
  line-height: 1.3;
  letter-spacing: -0.025em;
}
.cc-author-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.cc-author-actions .el-button + .el-button {
  margin-left: 0;
}
.cc-save-status {
  font-size: 12px;
  color: var(--cc-text-muted);
  margin-right: 8px;
}
.cc-save-status.dirty {
  color: var(--el-color-warning);
}
.cc-config-error {
  flex-shrink: 0;
  border-radius: 0;
}
.cc-designer-frame {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--cc-surface);
}
.cc-author-note {
  flex: 0 0 auto;
  color: var(--cc-text-muted);
  font-size: 11px;
  line-height: 20px;
  padding: 3px 20px;
  margin: 0;
  border-top: 1px solid var(--cc-border);
  background: var(--cc-surface);
}
/* The viewport owns height; only the palette, canvas and inspector scroll. */
.cc-designer-frame :deep(._fc-designer) {
  height: 100%;
  min-height: 0;
  font-family: inherit;
}
.cc-designer-frame :deep(._fc-l-menu) {
  width: 36px;
  border-top-color: var(--cc-border);
}
.cc-designer-frame :deep(._fc-l) {
  width: 244px;
  flex-shrink: 0;
}
.cc-designer-frame :deep(._fc-r) {
  width: 360px;
  flex-shrink: 0;
  border-left: 1px solid var(--cc-border);
}
.cc-designer-frame :deep(._fc-m) {
  min-width: 0;
  min-height: 0;
}
.cc-designer-frame :deep(._fc-m-con) {
  padding: 14px 16px 28px;
  min-height: 0;
  overflow: auto;
}
.cc-designer-frame :deep(._fc-m-drag.pc) {
  width: 100%;
  max-width: none;
}
.cc-designer-frame :deep(._fc-m-drag) {
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.cc-designer-frame :deep(._fc-m-drag ._fd-draggable-drag._fd-drag-box) {
  padding-bottom: 48px;
}
.cc-designer-frame :deep(._fc-l > .el-container),
.cc-designer-frame :deep(._fc-r > .el-container) {
  min-height: 0;
}
.cc-designer-frame :deep(._fc-l .el-main),
.cc-designer-frame :deep(._fc-r .el-main) {
  min-height: 0;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.cc-designer-frame :deep(._fc-r .el-main) {
  padding-bottom: 24px;
}
.cc-designer-frame :deep(._fc-r-config) {
  grid-template-columns: minmax(0, 1fr);
}
.cc-designer-frame :deep(._fc-r .el-select) {
  min-width: 0;
}
.cc-designer-frame :deep(._fc-m-tools) {
  padding-inline: 16px;
}
.cc-designer-frame :deep(._fc-l-group) {
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
}
.cc-designer-frame :deep(._fc-l-title) {
  font-size: 12px;
  color: var(--cc-text-secondary);
}
.cc-designer-frame :deep(._fc-l-item) {
  border-radius: 6px;
}
.cc-task-settings {
  padding: 0;
}
.cc-task-section + .cc-task-section {
  border-top: 1px solid var(--cc-border);
  margin-top: 20px;
  padding-top: 18px;
}
.cc-task-section h3 {
  color: var(--cc-text-strong);
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 16px;
}
.cc-task-settings .el-form-item {
  margin-bottom: 16px;
}
.cc-task-settings .el-select,
.cc-task-settings .el-input-number {
  width: 100%;
}
.cc-preset-action {
  border-top: 1px solid var(--cc-border);
  margin-top: 20px;
  padding-top: 18px;
}
.cc-preset-action .el-button {
  width: 100%;
}
.cc-preset-action p {
  margin: 10px 0 0;
  color: var(--cc-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
@media (min-width: 1800px) {
  .cc-designer-frame :deep(._fc-r) {
    width: 380px;
  }
}
@media (max-width: 1200px) {
  .cc-designer-frame :deep(._fc-l) {
    width: 216px;
  }
  .cc-designer-frame :deep(._fc-r) {
    width: 320px;
  }
  .cc-author-toolbar {
    gap: 12px;
  }
  .cc-save-status {
    margin-right: 0;
  }
  .cc-author-actions {
    gap: 6px;
  }
}
@media (max-width: 1000px) {
  .cc-author-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .cc-author-actions {
    justify-content: flex-start;
  }
  .cc-designer-frame {
    overflow-x: auto;
  }
  .cc-designer-frame :deep(._fc-designer) {
    min-width: 960px;
  }
  .cc-author-note {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
@media (max-width: 700px) {
  .cc-author-toolbar {
    padding: 10px 12px;
  }
  .cc-author-note {
    padding-inline: 12px;
  }
  .cc-save-status {
    width: 100%;
  }
}
</style>
