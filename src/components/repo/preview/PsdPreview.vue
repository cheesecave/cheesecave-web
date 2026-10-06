<!--
  PsdPreview.vue

  A read-only picture of a PSD: the flattened image Photoshop saves at the
  end of the file, read with Range requests (an indexed tar member) or out
  of the member's bytes (a zip member), never the whole file's layers. The
  blob page shows it for a .psd, the tar/zip browser for a member that is
  one. No limit on the size: this is the page the user asked to open.

  `source` is `{ size, read(offset, length) }`, see utils/psd-preview.
-->

<script setup>
import { onBeforeUnmount, ref, watch } from "vue";
import {
  DETAIL_PREVIEW_SIDE,
  readPsdPreview,
  rgbaToBlob,
} from "@/utils/psd-preview";

const props = defineProps({
  source: { type: Object, required: true },
  filename: { type: String, required: true },
  maxSide: { type: Number, default: DETAIL_PREVIEW_SIDE },
});

const state = ref("loading"); // loading | ready | error
const imageUrl = ref("");
const info = ref(null);
const message = ref("");
let controller = null;
let requestId = 0;

function release() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = "";
}

async function load() {
  if (controller) controller.abort();
  release();
  const id = ++requestId;
  controller = new AbortController();
  state.value = "loading";
  try {
    const out = await readPsdPreview(props.source, {
      maxSide: props.maxSide,
      // The page is for looking at: the full composite, the thumbnail only
      // when the composite cannot be decoded
      minThumbSide: Infinity,
      signal: controller.signal,
    });
    let blob = null;
    if (out.kind === "composite") {
      blob = await rgbaToBlob(out.rgba, out.width, out.height);
    } else if (out.kind === "thumbnail") {
      blob = new Blob([out.jpeg], { type: "image/jpeg" });
    }
    if (id !== requestId) return;
    if (!blob) {
      message.value = `This PSD cannot be previewed (${out.reason}).`;
      state.value = "error";
      return;
    }
    info.value = out;
    imageUrl.value = URL.createObjectURL(blob);
    state.value = "ready";
  } catch (err) {
    if (id !== requestId || err?.name === "AbortError") return;
    message.value = `Cannot read this PSD: ${err.message}`;
    state.value = "error";
  }
}

watch(() => props.source, load, { immediate: true });

onBeforeUnmount(() => {
  if (controller) controller.abort();
  release();
});
</script>

<template>
  <div>
    <div v-if="state === 'loading'" class="py-16 flex flex-col items-center">
      <el-icon class="is-loading" :size="32">
        <div class="i-carbon-loading" />
      </el-icon>
      <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
        Reading the preview from the PSD…
      </p>
      <p
        class="mt-1 text-xs text-gray-400 dark:text-gray-500 max-w-md text-center"
      >
        Only the flattened image at the end of the file is read, not its layers.
      </p>
    </div>

    <div
      v-else-if="state === 'error'"
      class="py-10 text-center"
      data-testid="psd-preview-error"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ message }}</p>
      <slot name="error-actions" />
    </div>

    <div v-else class="text-center" data-testid="psd-preview">
      <img
        :src="imageUrl"
        :alt="filename"
        class="max-w-full h-auto mx-auto"
        style="max-height: 800px"
        data-testid="psd-preview-image"
      />
      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {{ info.docWidth }}×{{ info.docHeight }} px ·
        <template v-if="info.kind === 'composite'">
          the flattened image saved in the file; layers are not shown
        </template>
        <template v-else>
          the low-resolution thumbnail saved in the file
        </template>
      </p>
    </div>
  </div>
</template>
