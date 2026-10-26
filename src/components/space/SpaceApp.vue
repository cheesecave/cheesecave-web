<script setup>
import {
  computed,
  defineAsyncComponent,
  onActivated,
  onDeactivated,
  ref,
} from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAsyncResource } from "@/composables/useAsyncResource";
import { useErrorContext } from "@/composables/useErrorContext";
import {
  canEditOnnxSpace,
  loadOnnxSpace,
  onnxEditorLocation,
} from "@/utils/onnx-space";
import ErrorState from "@/components/common/ErrorState.vue";
import LinkButton from "@/components/common/LinkButton.vue";

const OnnxDemo = defineAsyncComponent(() => import("@/onnx/OnnxDemo.vue"));
const props = defineProps({
  context: { type: Object, required: true },
  isExternal: Boolean,
});
const auth = useAuthStore();
const errorContext = useErrorContext();
const active = ref(true);
const canEdit = computed(() =>
  canEditOnnxSpace(auth, props.context.id.split("/")[0], props.isExternal),
);
const resource = useAsyncResource(
  ({ signal }) =>
    props.isExternal
      ? { config: { version: 1, enabled: false, document: null }, commit: null }
      : loadOnnxSpace(props.context, { signal }),
  {
    autoRetry: false,
    watch: [
      () => props.context.id,
      () => props.context.revision,
      () => props.isExternal,
    ],
  },
);
const config = computed(() => resource.data.value?.config);
let hidden = false;
onDeactivated(() => {
  hidden = true;
  active.value = false;
  resource.stop();
});
onActivated(() => {
  active.value = true;
  if (hidden) {
    hidden = false;
    resource.reload();
  }
});
</script>

<template>
  <slot v-if="isExternal" name="fallback" />
  <div
    v-else-if="resource.loading.value"
    class="py-8 text-center"
    role="status"
  >
    Loading App…
  </div>
  <ErrorState
    v-else-if="resource.failed.value"
    :error="resource.error.value"
    :context="errorContext('ONNX configuration')"
    mode="inline-panel"
    :retry="resource.reload"
  />
  <template v-else-if="resource.ready.value">
    <slot v-if="!config.enabled" name="fallback" />
    <section v-else class="space-onnx-app" aria-label="Browser ONNX App">
      <div v-if="canEdit" class="flex justify-end mb-4">
        <LinkButton
          :to="onnxEditorLocation(context)"
          size="small"
          data-testid="edit-onnx-app"
          >Edit demo</LinkButton
        >
      </div>
      <OnnxDemo
        v-if="config.document && active"
        :document="config.document"
        :context="context"
      />
      <div v-else-if="!config.document" class="py-10 text-center">
        <p>This browser demo has not been configured yet.</p>
      </div>
    </section>
  </template>
</template>
