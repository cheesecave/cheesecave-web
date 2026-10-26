<script setup>
import { computed, inject, ref } from "vue";
import { inferenceContext } from "../context.js";
const props = defineProps({
  fieldKey: String,
  modelValue: { default: null },
  title: { default: "输入图片" },
  description: { default: "选择或拖入一张图片" },
  showSample: { type: Boolean, default: true },
});
const emit = defineEmits(["update:modelValue"]);
const runtime = inject(inferenceContext, null);
const uploader = ref(null);
const image = computed(() => runtime?.images[props.fieldKey]);
const disabled = computed(() => !!runtime?.busy.value);
async function select(upload) {
  if (!runtime || disabled.value || !upload.raw) return;
  try {
    const value = await runtime.selectImage(
      props.fieldKey,
      upload.raw,
      upload.name,
    );
    if (value) emit("update:modelValue", value);
  } catch (error) {
    runtime.fail(error);
  } finally {
    uploader.value?.clearFiles();
  }
}
async function sample() {
  if (!runtime || disabled.value) return;
  try {
    const value = await runtime.loadSample(props.fieldKey);
    if (value) emit("update:modelValue", value);
  } catch (error) {
    runtime.fail(error);
  }
}
function clear() {
  if (!runtime || disabled.value) return;
  if (runtime.clearImage(props.fieldKey)) {
    uploader.value?.clearFiles();
    emit("update:modelValue", null);
  }
}
</script>

<template>
  <section class="cc-image-input" :data-field="fieldKey">
    <header class="cc-component-heading">
      <strong>{{ title }}</strong>
      <div class="cc-image-actions">
        <el-button
          v-if="showSample && (!runtime || runtime.document.value.task.sample)"
          data-testid="sample-btn"
          size="small"
          :disabled="disabled"
          @click="sample"
          >载入示例</el-button
        ><el-button
          data-testid="clear-image"
          size="small"
          :disabled="disabled || !image"
          @click="clear"
          >清除图片</el-button
        >
      </div>
    </header>
    <el-upload
      ref="uploader"
      class="cc-local-upload"
      drag
      accept="image/*"
      :auto-upload="false"
      :show-file-list="false"
      :disabled="disabled"
      :on-change="select"
    >
      <img
        v-if="image"
        :src="image.url"
        :alt="image.name"
        class="cc-image-preview"
      />
      <div v-else class="cc-image-empty">
        <span class="cc-image-symbol">＋</span><strong>{{ description }}</strong
        ><span>点击选择图片，或拖到这里</span>
      </div>
      <div v-if="image" class="cc-image-replace">点击或拖入以更换图片</div>
    </el-upload>
    <p class="cc-image-meta">
      {{
        image
          ? `${image.name} · ${image.width} × ${image.height}`
          : "PNG / JPEG / WebP"
      }}
    </p>
  </section>
</template>
