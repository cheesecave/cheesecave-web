<script setup>
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { decodeError } from "@/errors";
import {
  canEditOnnxSpace,
  loadOnnxSpace,
  onnxEditorLocation,
  saveOnnxSpace,
} from "@/utils/onnx-space";
import ErrorState from "@/components/common/ErrorState.vue";
import LinkButton from "@/components/common/LinkButton.vue";

const props = defineProps({
  context: { type: Object, required: true },
  isExternal: Boolean,
});
const auth = useAuthStore();
const errorContext = useErrorContext();
const canEdit = computed(() =>
  canEditOnnxSpace(auth, props.context.id.split("/")[0], props.isExternal),
);
const enabled = ref(false),
  saving = ref(false),
  saveError = ref(null);
const resource = useAsyncResource(
  ({ signal }) => loadOnnxSpace(props.context, { signal }),
  {
    autoRetry: false,
    watch: [() => props.context.id, () => props.context.revision],
  },
);
watch(resource.data, (value) => {
  enabled.value = Boolean(value?.config.enabled);
  saveError.value = null;
});
async function save() {
  if (!canEdit.value || !resource.ready.value || saving.value) return;
  const context = { ...props.context };
  const previous = resource.data.value;
  saving.value = true;
  saveError.value = null;
  try {
    const result = await saveOnnxSpace(
      context,
      { ...previous.config, enabled: enabled.value },
      {
        parentCommit: previous.commit,
        message: enabled.value
          ? "Enable browser ONNX demo"
          : "Disable browser ONNX demo",
      },
    );
    if (
      context.id !== props.context.id ||
      context.revision !== props.context.revision
    )
      return;
    resource.data.value = result;
    ElMessage.success("Browser ONNX settings saved");
  } catch (error) {
    if (
      context.id === props.context.id &&
      context.revision === props.context.revision
    )
      saveError.value = decodeError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card" aria-labelledby="onnx-settings-heading">
    <h2 id="onnx-settings-heading" class="text-xl font-semibold mb-4">
      Browser ONNX demo
    </h2>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      Run an ONNX model in the App tab using the visitor’s browser.
    </p>
    <p v-if="resource.loading.value" role="status">Loading ONNX settings…</p>
    <ErrorState
      v-else-if="resource.failed.value"
      :error="resource.error.value"
      :context="errorContext('ONNX settings')"
      mode="inline-panel"
      :retry="resource.reload"
    />
    <template v-else-if="resource.ready.value">
      <p v-if="!canEdit" class="text-sm text-gray-600 dark:text-gray-400">
        Write access is required to change this setting.
      </p>
      <template v-else>
        <el-checkbox
          v-model="enabled"
          :disabled="saving"
          data-testid="onnx-enabled"
          >Enable browser ONNX</el-checkbox
        >
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Turning it off keeps the saved demo configuration.
        </p>
        <ErrorState
          v-if="saveError"
          :error="saveError"
          :context="errorContext('ONNX settings')"
          mode="inline-panel"
          :retry="save"
        />
        <div class="flex flex-wrap gap-3 mt-4">
          <el-button
            type="primary"
            :loading="saving"
            data-testid="save-onnx-settings"
            @click="save"
            >Save ONNX settings</el-button
          >
          <LinkButton
            v-if="resource.data.value.config.enabled"
            :to="onnxEditorLocation(context)"
            data-testid="edit-onnx-settings"
            >Edit demo</LinkButton
          >
          <el-button v-if="saveError" @click="resource.reload"
            >Reload saved settings</el-button
          >
        </div>
      </template>
    </template>
  </section>
</template>
