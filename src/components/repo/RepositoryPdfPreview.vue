<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
const props = defineProps({
  url: { type: String, default: "" },
  filename: { type: String, default: "" },
  pageCount: { type: Number, default: 0 },
  loadPage: { type: Function, default: null },
});
const emit = defineEmits(["access-denied"]);
const canvas = ref(null),
  page = ref(1),
  pages = ref(0),
  zoom = ref(1),
  displayWidth = ref(0),
  displayHeight = ref(0),
  loading = ref(false),
  error = ref("");
const objectUrls = new Set();
function revokeImageUrls() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
}
let documentTask = null,
  document = null,
  renderTask = null,
  controller = null,
  generation = 0,
  renderSequence = 0;
function boundedScale(width, height) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Invalid PDF page dimensions");
  return Math.min(
    1,
    4096 / Math.max(width, height),
    4000 / Math.sqrt(width) / Math.sqrt(height),
  );
}
// PDF point dimensions and server raster dimensions use the same logical
// page size. The source's pixel density must not change a reader's zoom level.
function logicalScale(width, height) {
  boundedScale(width, height);
  return (800 / Math.max(width, height)) * zoom.value;
}
function displaySize(width, height) {
  displayWidth.value = width;
  displayHeight.value = height;
}
function clearCanvas() {
  if (canvas.value) {
    displayWidth.value = 0;
    displayHeight.value = 0;
    canvas.value.width = 0;
    canvas.value.height = 0;
  }
}
function release() {
  revokeImageUrls();
  controller?.abort();
  renderTask?.cancel?.();
  renderTask = null;
  const ownedDocument = document,
    ownedTask = documentTask;
  document = null;
  documentTask = null;
  if (ownedDocument) ownedDocument.destroy?.();
  else ownedTask?.destroy?.();
  clearCanvas();
}
function fail(cause) {
  clearCanvas();
  error.value = "PDF preview unavailable";
  const status = cause?.response?.status ?? cause?.status;
  if ([401, 403, 404].includes(status)) emit("access-denied", cause);
}
async function draw() {
  const owner = generation,
    request = ++renderSequence;
  controller?.abort();
  revokeImageUrls();
  controller = new AbortController();
  renderTask?.cancel?.();
  loading.value = true;
  error.value = "";
  clearCanvas();
  try {
    await nextTick();
    if (owner !== generation || request !== renderSequence || !canvas.value)
      return;
    if (props.loadPage) {
      const value = await props.loadPage(page.value, {
        signal: controller.signal,
      });
      if (owner !== generation || request !== renderSequence) return;
      let src,
        objectUrl = null;
      if (value instanceof Blob && value.type === "image/png") {
        objectUrl = URL.createObjectURL(value);
        objectUrls.add(objectUrl);
        src = objectUrl;
      } else if (
        typeof value === "string" &&
        /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value)
      )
        src = value;
      else throw new Error("Invalid rendered PDF page");
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = src;
        });
        if (owner !== generation || request !== renderSequence || !canvas.value)
          return;
        const logical = logicalScale(image.width, image.height);
        const width = image.width * logical,
          height = image.height * logical,
          scale = boundedScale(width, height);
        displaySize(width, height);
        canvas.value.width = Math.max(
          1,
          Math.min(4096, Math.floor(width * scale)),
        );
        canvas.value.height = Math.max(
          1,
          Math.min(4096, Math.floor(height * scale)),
        );
        const context = canvas.value.getContext("2d");
        context.clearRect(0, 0, canvas.value.width, canvas.value.height);
        context.drawImage(image, 0, 0, canvas.value.width, canvas.value.height);
      } finally {
        if (objectUrl && objectUrls.delete(objectUrl))
          URL.revokeObjectURL(objectUrl);
      }
    } else if (document) {
      const pdfPage = await document.getPage(page.value);
      if (owner !== generation || request !== renderSequence || !canvas.value)
        return;
      const base = pdfPage.getViewport({ scale: 1 });
      const logical = logicalScale(base.width, base.height);
      const requested = pdfPage.getViewport({ scale: logical });
      const scale = boundedScale(requested.width, requested.height);
      displaySize(requested.width, requested.height);
      const viewport =
        scale === 1
          ? requested
          : pdfPage.getViewport({ scale: logical * scale });
      canvas.value.width = Math.max(
        1,
        Math.min(4096, Math.floor(viewport.width)),
      );
      canvas.value.height = Math.max(
        1,
        Math.min(4096, Math.floor(viewport.height)),
      );
      renderTask = pdfPage.render({
        canvas: canvas.value,
        canvasContext: canvas.value.getContext("2d"),
        viewport,
      });
      await renderTask.promise;
    }
  } catch (cause) {
    if (
      owner === generation &&
      request === renderSequence &&
      cause?.name !== "RenderingCancelledException" &&
      cause?.name !== "AbortError"
    )
      fail(cause);
  } finally {
    if (owner === generation && request === renderSequence)
      loading.value = false;
  }
}
watch(
  () => [props.url, props.pageCount, props.loadPage],
  async () => {
    const owner = ++generation;
    release();
    page.value = 1;
    pages.value = 0;
    error.value = "";
    loading.value = true;
    try {
      if (props.loadPage) {
        if (
          !Number.isInteger(props.pageCount) ||
          props.pageCount < 1 ||
          props.pageCount > 100000
        )
          throw new Error("Invalid PDF page count");
        pages.value = props.pageCount;
      } else {
        const pdf = await import("pdfjs-dist");
        if (owner !== generation) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdf.getDocument({
          url: props.url,
          withCredentials: true,
          isEvalSupported: false,
          enableXfa: false,
        });
        documentTask = task;
        const loaded = await task.promise;
        if (owner !== generation) {
          loaded.destroy?.();
          return;
        }
        document = loaded;
        pages.value = loaded.numPages;
      }
      await draw();
    } catch (cause) {
      if (owner === generation) {
        fail(cause);
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
watch([page, zoom], () => {
  if (pages.value) draw();
});
function setPage(event) {
  const value = Number(event.target.value);
  page.value = Number.isInteger(value)
    ? Math.min(pages.value, Math.max(1, value))
    : page.value;
  event.target.value = String(page.value);
}
onBeforeUnmount(() => {
  generation++;
  renderSequence++;
  release();
});
</script>
<template>
  <section class="repository-pdf-preview" :aria-label="`PDF: ${filename}`">
    <div class="pdf-toolbar" role="toolbar" aria-label="PDF controls">
      <button
        type="button"
        aria-label="Previous PDF page"
        :disabled="page <= 1"
        @click="page--"
      >
        <span class="i-carbon-chevron-left" aria-hidden="true" />
      </button>
      <input
        aria-label="PDF page"
        type="number"
        min="1"
        :max="pages"
        :value="page"
        @change="setPage"
      /><span>/ {{ pages || "—" }}</span>
      <button
        type="button"
        aria-label="Next PDF page"
        :disabled="page >= pages"
        @click="page++"
      >
        <span class="i-carbon-chevron-right" aria-hidden="true" />
      </button>
      <span class="pdf-toolbar-spacer" />
      <button
        type="button"
        aria-label="Zoom out PDF"
        :disabled="zoom <= 0.5"
        @click="zoom = Math.max(0.5, zoom - 0.25)"
      >
        <span class="i-carbon-subtract" aria-hidden="true" /></button
      ><span>{{ Math.round(zoom * 100) }}%</span>
      <button
        type="button"
        aria-label="Zoom in PDF"
        :disabled="zoom >= 3"
        @click="zoom = Math.min(3, zoom + 0.25)"
      >
        <span class="i-carbon-add" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" role="alert" class="pdf-message">{{ error }}</p>
    <div class="pdf-page-area" :aria-busy="loading">
      <span v-if="loading" role="status" class="pdf-loading">Loading PDF…</span
      ><canvas
        ref="canvas"
        :aria-label="`${filename}, page ${page}`"
        :style="{ width: `${displayWidth}px`, height: `${displayHeight}px` }"
        :class="{ 'is-unavailable': error }"
      />
    </div>
  </section>
</template>
<style scoped>
.repository-pdf-preview {
  border: 1px solid var(--site-border);
  border-radius: 6px;
  overflow: hidden;
  min-height: 300px;
  background: var(--site-card);
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--site-border);
  font-size: 14px;
  color: var(--site-card-text);
}
.pdf-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 4px;
}
.pdf-toolbar button:hover {
  background: var(--site-bg);
}
.pdf-toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}
.pdf-toolbar input {
  width: 58px;
  padding: 3px 5px;
  border: 1px solid var(--site-border);
  border-radius: 4px;
  background: var(--site-card);
  color: inherit;
}
.pdf-toolbar-spacer {
  flex: 1;
}
.pdf-page-area {
  position: relative;
  overflow: auto;
  max-height: 800px;
  min-height: 260px;
  padding: 16px;
  background: var(--site-bg);
  text-align: center;
}
.pdf-page-area canvas {
  display: block;
  margin: 0 auto;
  background: white;
  box-shadow: 0 1px 8px #0002;
  max-width: none;
}
.pdf-loading {
  position: absolute;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--site-card);
  font-size: 13px;
}
.pdf-message {
  padding: 12px;
  color: var(--site-muted);
}
.is-unavailable {
  visibility: hidden;
}
</style>
