<template>
  <RepositoryAccessLayout :repository="repository" :access="access" preview>
    <template #actions
      ><el-button @click="leave">End temporary access</el-button></template
    >
    <template #aside>
      <div class="card space-y-3">
        <h2 class="font-semibold">Temporary preview</h2>
        <p>
          Original files and bulk downloads are unavailable. Displayed content
          can still be copied or saved.
        </p>
        <p class="text-sm text-gray-500">
          Text, thumbnails and limited data rows are supported. PDF, audio,
          video, archives, Parquet and browser model inference are unavailable
          in temporary previews. LFS files provide metadata only in this
          release.
        </p>
      </div>
    </template>
    <div class="space-y-4">
      <ErrorState
        v-if="error"
        :error="error"
        mode="inline-panel"
        :retry="() => loadTree(currentPath)"
      />
      <div v-if="loading" role="status">Loading controlled preview…</div>
      <div class="card space-y-2">
        <h2 class="font-semibold">{{ currentPath || "Repository files" }}</h2>
        <p v-if="treeMessage" class="text-sm text-gray-500">
          {{ treeMessage }}
        </p>
        <el-button
          v-if="currentPath"
          @click="loadTree(currentPath.split('/').slice(0, -1).join('/'))"
          >Parent folder</el-button
        >
        <div
          v-for="entry in entries"
          :key="entry.path"
          class="flex gap-2 items-center"
        >
          <el-button
            @click="
              entry.type === 'directory'
                ? loadTree(entry.path)
                : preview(entry.path)
            "
            >{{ entry.path }}</el-button
          >
          <span class="text-sm text-gray-500">{{
            entry.type === "directory"
              ? "Folder"
              : entry.preview_kind || "Preview unavailable"
          }}</span>
        </div>
      </div>
      <article
        v-if="content"
        class="card space-y-3"
        aria-label="Controlled file preview"
      >
        <h2 class="font-semibold">{{ selectedPath }}</h2>
        <pre
          v-if="content.kind === 'text'"
          class="whitespace-pre-wrap break-words"
          >{{ content.text }}</pre
        >
        <img
          v-else-if="content.kind === 'image' && safeImage"
          :src="safeImage"
          :alt="selectedPath"
          class="max-w-full"
        />
        <div v-else-if="content.kind === 'rows'" class="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th
                  v-for="column in content.columns"
                  :key="column"
                  class="p-2 text-left"
                >
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in content.rows" :key="index">
                <td
                  v-for="(column, j) in content.columns"
                  :key="column"
                  class="p-2"
                >
                  {{ Array.isArray(row) ? row[j] : row[column] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else>
          {{
            content.message ||
            "This file type is unavailable in temporary previews."
          }}
        </p>
        <p v-if="content.truncated" class="text-sm text-gray-500">
          This preview is limited. The complete original file is not available.
        </p>
      </article>
    </div>
  </RepositoryAccessLayout>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { repositoryAccessAPI } from "@/utils/api";
import { decodeError, notifyError } from "@/errors";
import ErrorState from "@/components/common/ErrorState.vue";
import RepositoryAccessLayout from "./RepositoryAccessLayout.vue";
const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["changed"]);
const entries = ref([]);
const currentPath = ref("");
const treeMessage = ref("");
const selectedPath = ref("");
const content = ref(null);
const error = ref(null);
const loading = ref(false);
let sequence = 0;
const safeImage = computed(() =>
  /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
    content.value?.data_url || "",
  )
    ? content.value.data_url
    : "",
);
async function loadTree(path = "") {
  const request = ++sequence;
  loading.value = true;
  content.value = null;
  error.value = null;
  try {
    const { data } = await repositoryAccessAPI.guestTree(
      props.repository,
      path,
    );
    if (request === sequence) {
      entries.value = data.entries;
      currentPath.value = data.path;
      treeMessage.value =
        data.message ||
        (data.has_more
          ? "Only the first 100 entries are available in this temporary preview."
          : "");
    }
  } catch (cause) {
    if (request === sequence) error.value = decodeError(cause);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
async function preview(path) {
  const request = ++sequence;
  content.value = null;
  error.value = null;
  loading.value = true;
  try {
    const { data } = await repositoryAccessAPI.guestPreview(
      props.repository,
      path,
    );
    if (request === sequence) {
      selectedPath.value = path;
      content.value = data;
    }
  } catch (cause) {
    if (request === sequence) error.value = decodeError(cause);
  } finally {
    if (request === sequence) loading.value = false;
  }
}
async function leave() {
  try {
    await repositoryAccessAPI.leaveGuest(props.repository);
    emit("changed");
  } catch (cause) {
    notifyError(cause, { fallback: "Could not end temporary access" });
  }
}
watch(
  () => JSON.stringify(props.repository),
  () => {
    entries.value = [];
    loadTree();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
});
</script>
