<script setup>
import { computed, defineAsyncComponent, onScopeDispose, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import { AppError, KIND } from "@/errors";
import {
  canEditOnnxSpace,
  loadOnnxSpace,
  onnxAppLocation,
  saveOnnxSpace,
} from "@/utils/onnx-space";
import ErrorState from "@/components/common/ErrorState.vue";
import LinkButton from "@/components/common/LinkButton.vue";

const SpaceStudio = defineAsyncComponent(
  () => import("@/onnx/SpaceStudio.vue"),
);
const route = useRoute();
const auth = useAuthStore();
const errorContext = useErrorContext();
const context = computed(() => ({
  id: `${route.params.namespace}/${route.params.name}`,
  revision: route.params.branch || "main",
}));
const canEdit = computed(
  () =>
    route.params.type === "space" &&
    canEditOnnxSpace(auth, route.params.namespace, false),
);
const denied = computed(
  () =>
    new AppError({
      kind:
        route.params.type !== "space"
          ? KIND.NOT_FOUND
          : auth.isAuthenticated
            ? KIND.FORBIDDEN
            : KIND.AUTH_REQUIRED,
    }),
);
const resource = useAsyncResource(
  ({ signal }) => {
    if (!canEdit.value) throw denied.value;
    return loadOnnxSpace(context.value, { signal });
  },
  {
    autoRetry: false,
    watch: [() => context.value.id, () => context.value.revision, canEdit],
  },
);
const settingsTo = computed(() => ({
  path: `/spaces/${context.value.id.split("/").map(encodeURIComponent).join("/")}/settings`,
  query: { revision: context.value.revision },
}));
let reloadController;
const cancelReload = () => reloadController?.abort();
watch(
  [() => context.value.id, () => context.value.revision, canEdit],
  cancelReload,
);
onScopeDispose(cancelReload);
async function saveDocument(document) {
  if (!canEdit.value) throw denied.value;
  if (!resource.ready.value || !resource.data.value?.config.enabled)
    throw new AppError({
      kind: KIND.CONFLICT,
      serverMessage: "Enable browser ONNX in Space settings before saving.",
    });
  const snapshot = { ...context.value },
    current = resource.data.value;
  const result = await saveOnnxSpace(
    snapshot,
    { ...current.config, document },
    { parentCommit: current.commit, message: "Update browser ONNX demo" },
  );
  if (
    snapshot.id === context.value.id &&
    snapshot.revision === context.value.revision
  )
    resource.data.value = result;
  return result.config.document;
}
async function reloadDocument() {
  if (!canEdit.value) throw denied.value;
  cancelReload();
  const controller = (reloadController = new AbortController());
  const snapshot = { ...context.value };
  // Keep the current editor mounted so a failed reload does not discard its draft.
  const result = await loadOnnxSpace(snapshot, { signal: controller.signal });
  if (
    controller.signal.aborted ||
    snapshot.id !== context.value.id ||
    snapshot.revision !== context.value.revision
  )
    throw new AppError({ kind: KIND.CANCELLED });
  resource.data.value = result;
  if (!result.config.enabled)
    throw new AppError({
      kind: KIND.CONFLICT,
      serverMessage: "Browser ONNX is disabled in Space settings.",
    });
  return result.config.document;
}
</script>

<template>
  <section class="onnx-editor-page" aria-label="ONNX demo editor">
    <ErrorState
      v-if="!canEdit"
      :error="denied"
      :context="errorContext('ONNX editor')"
    />
    <p v-else-if="resource.loading.value" class="p-6" role="status">
      Loading demo editor…
    </p>
    <ErrorState
      v-else-if="resource.failed.value"
      :error="resource.error.value"
      :context="errorContext('ONNX configuration')"
      :retry="resource.reload"
    />
    <template v-else-if="resource.ready.value">
      <SpaceStudio
        v-if="resource.data.value.config.enabled"
        :context="context"
        :document="resource.data.value.config.document"
        :save-document="saveDocument"
        :reload-document="reloadDocument"
        :preview-to="onnxAppLocation(context)"
      />
      <div v-else class="p-6">
        <h1 class="text-xl font-semibold mb-3">Enable browser ONNX</h1>
        <p class="mb-4">
          Enable this demo in Space settings before editing it.
        </p>
        <LinkButton :to="settingsTo" type="primary"
          >Open Space settings</LinkButton
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.onnx-editor-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
