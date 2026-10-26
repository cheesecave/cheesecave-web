<script setup>
import { computed, inject, nextTick, ref, watch } from "vue";
import { inferenceContext } from "../context.js";
const props = defineProps({
  fieldKey: String,
  modelValue: { default: null },
  title: { default: "检测结果" },
  showScores: { type: Boolean, default: true },
});
const runtime = inject(inferenceContext, null);
const canvas = ref(null);
const bound = computed(
  () => runtime && props.fieldKey === runtime.document.value.bindings.result,
);
const image = computed(() => (bound.value ? runtime.boundImage.value : null));
const detections = computed(() =>
  bound.value ? runtime.metrics.value.detections || [] : [],
);
const completed = computed(
  () => bound.value && runtime.metrics.value.status === "completed",
);
function draw() {
  if (!canvas.value || !image.value) return;
  const bitmap = image.value.bitmap;
  canvas.value.width = bitmap.width;
  canvas.value.height = bitmap.height;
  const ctx = canvas.value.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  const scale = Math.max(1, bitmap.width / 700),
    fontSize = 15 * scale;
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.lineWidth = 2.5 * scale;
  for (const detection of detections.value) {
    const [x1, y1, x2, y2] = detection.box;
    ctx.strokeStyle = "#f2b430";
    ctx.fillStyle = "#f2b430";
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const label = `#${detection.id}${props.showScores ? `  ${(detection.score * 100).toFixed(1)}%` : ""}`;
    const width = ctx.measureText(label).width + 12 * scale;
    const y = y1 >= fontSize + 12 * scale ? y1 - fontSize - 12 * scale : y1;
    ctx.fillRect(x1, y, width, fontSize + 10 * scale);
    ctx.fillStyle = "#29251d";
    ctx.fillText(label, x1 + 6 * scale, y + fontSize + scale);
  }
}
watch(
  [image, detections, () => props.showScores],
  async () => {
    await nextTick();
    draw();
  },
  { immediate: true },
);
</script>

<template>
  <section class="cc-result" :data-field="fieldKey">
    <header class="cc-component-heading">
      <strong>{{ title }}</strong
      ><el-tag type="info" effect="plain"
        ><span id="face-count">{{ completed ? detections.length : "—" }}</span>
        张人脸</el-tag
      >
    </header>
    <div class="cc-result-frame">
      <canvas
        v-if="image"
        id="image-canvas"
        ref="canvas"
        aria-label="人脸检测结果"
      />
      <div v-else class="cc-result-empty">运行后在这里查看检测框</div>
    </div>
    <div v-if="completed" id="detection-list" class="cc-detection-list">
      <p v-if="!detections.length">当前阈值下未检测到人脸。</p>
      <article
        v-for="detection in detections"
        :key="detection.id"
        class="cc-detection-card"
      >
        <strong>人脸 {{ detection.id }}</strong
        ><span v-if="showScores">{{ (detection.score * 100).toFixed(1) }}%</span
        ><small
          >({{ detection.box[0] }}, {{ detection.box[1] }}) → ({{
            detection.box[2]
          }}, {{ detection.box[3] }})</small
        >
      </article>
    </div>
  </section>
</template>
