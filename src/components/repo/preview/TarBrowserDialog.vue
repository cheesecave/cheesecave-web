<!--
  TarBrowserDialog.vue

  Modal wrapper around <TarBrowserPanel> for the file-list icon
  shortcut. The same panel renders inline on the standalone blob
  page when the user navigates to a .tar that has a sibling .json
  or to a zip, so the listing UX, member preview and download paths
  stay identical across both surfaces.
-->

<script setup>
import { computed } from "vue";
import TarBrowserPanel from "@/components/repo/preview/TarBrowserPanel.vue";

const props = defineProps({
  visible: { type: Boolean, required: true },
  tarUrl: { type: String, default: "" },
  indexUrl: { type: String, default: "" },
  filename: { type: String, required: true },
  // Tree-API entry for the .tar — drives the hash banner.
  tarTreeEntry: { type: Object, default: null },
  // Zip mode: { repoType, namespace, name, branch, path }.
  zip: { type: Object, default: null },
});
const emit = defineEmits(["update:visible"]);

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`${zip ? 'Zip archive' : 'Indexed tar'} · ${filename}`"
    width="900px"
    top="6vh"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <TarBrowserPanel
      v-if="dialogVisible"
      :tar-url="tarUrl"
      :index-url="indexUrl"
      :filename="filename"
      :tar-tree-entry="tarTreeEntry"
      :zip="zip"
    />
    <template #footer>
      <el-button @click="dialogVisible = false">Close</el-button>
    </template>
  </el-dialog>
</template>
