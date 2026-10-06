<!--
  FilePreviewDialog.vue

  Modal around FileMetadataPanel: the file-list icon's metadata preview for
  .safetensors and .parquet files. The panel does the Range reads and the
  rendering; this only supplies the dialog chrome and its title.

  Implements surface A from issue #27 v4 — file-level preview only, no
  repo-aggregate badges.
-->

<script setup>
import { computed } from "vue";
import FileMetadataPanel from "@/components/repo/preview/FileMetadataPanel.vue";

const props = defineProps({
  visible: { type: Boolean, required: true },
  kind: { type: String, required: true }, // "safetensors" | "parquet"
  // One of resolveUrl OR bytes is required (see FileMetadataPanel)
  resolveUrl: { type: String, default: "" },
  bytes: { type: Object, default: null },
  filename: { type: String, required: true },
});
const emit = defineEmits(["update:visible"]);

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const title = computed(() => {
  if (props.kind === "safetensors") {
    return `Safetensors metadata · ${props.filename}`;
  }
  if (props.kind === "parquet") {
    return `Parquet metadata · ${props.filename}`;
  }
  return `Metadata · ${props.filename}`;
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="title"
    width="760px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <FileMetadataPanel
      :active="visible"
      :kind="kind"
      :resolve-url="resolveUrl"
      :bytes="bytes"
      :filename="filename"
    />

    <template #footer>
      <el-button @click="dialogVisible = false">Close</el-button>
    </template>
  </el-dialog>
</template>
