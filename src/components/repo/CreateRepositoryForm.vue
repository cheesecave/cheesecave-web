<template>
  <el-form
    ref="formRef"
    :model="form"
    :rules="rules"
    label-position="top"
    @submit.prevent="handleSubmit"
  >
    <div v-if="createdSpace" data-testid="created-space-onnx" class="py-4">
      <h2 class="text-lg font-semibold">Space created</h2>
      <p class="mt-2">
        {{ createdSpace.id }} is ready. Browser ONNX has not been enabled yet.
      </p>
      <ErrorState v-if="enableError" :error="enableError" mode="inline-panel" />
      <div class="flex flex-wrap gap-3 mt-4">
        <el-button
          type="primary"
          :loading="creating"
          data-testid="retry-enable-onnx"
          @click="enableCreatedSpace(++createSequence)"
          >Retry enabling ONNX</el-button
        >
        <LinkButton
          :to="`/spaces/${createdSpace.id.split('/').map(encodeURIComponent).join('/')}`"
          >Open Space</LinkButton
        >
      </div>
    </div>
    <template v-else>
      <!-- Repository Type -->
      <el-form-item v-if="!fixedType" label="Repository Type" prop="type">
        <div class="w-full">
          <el-radio-group
            v-model="form.type"
            size="large"
            class="w-full grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            <el-radio-button
              v-for="item in REPOSITORY_TYPES"
              :key="item.type"
              :value="item.type"
            >
              <div class="flex items-center justify-center gap-2 py-2">
                <div :class="item.icon" class="text-xl" />
                <span>{{ item.label }}</span>
              </div>
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {{ repositoryType?.creationDescription || "" }}
        </div>
      </el-form-item>

      <!-- Owner -->
      <el-form-item label="Owner" prop="owner">
        <el-select
          v-model="form.owner"
          placeholder="Select owner"
          size="large"
          class="w-full"
        >
          <el-option :label="currentUser" :value="currentUser">
            <div class="flex items-center gap-2">
              <div class="i-carbon-user-avatar" />
              <span>{{ currentUser }}</span>
              <span class="text-xs text-gray-500">(Personal)</span>
            </div>
          </el-option>
          <el-option
            v-for="org in userOrgs"
            :key="org.name"
            :label="org.name"
            :value="org.name"
          >
            <div class="flex items-center gap-2">
              <div class="i-carbon-enterprise" />
              <span>{{ org.name }}</span>
              <span class="text-xs text-gray-500">(Organization)</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- Repository Name -->
      <el-form-item :label="`${typeLabel} Name`" prop="name">
        <el-input
          v-model="form.name"
          :placeholder="compact ? `my-${form.type}` : `my-awesome-${form.type}`"
          size="large"
        >
          <template #prepend>
            <span class="text-gray-600">{{ form.owner }}/</span>
          </template>
        </el-input>
        <div class="text-xs text-gray-500 mt-1">
          <div class="i-carbon-information inline-block mr-1" />
          1 to 96 letters, numbers, hyphens, underscores and dots; no -- or ..,
          no hyphen or dot at either end, not ending in .git
        </div>
      </el-form-item>

      <!-- SDK (Spaces) -->
      <el-form-item v-if="form.type === 'space'" label="SDK">
        <el-select
          v-model="form.sdk"
          placeholder="Select SDK"
          size="large"
          class="w-full"
        >
          <el-option
            v-for="sdk in SPACE_SDKS"
            :key="sdk.value"
            :label="sdk.label"
            :value="sdk.value"
          />
        </el-select>
        <div class="text-xs text-gray-500 mt-1">
          <div class="i-carbon-information inline-block mr-1" />
          The Space starts with a README.md that names it
        </div>
      </el-form-item>

      <el-form-item v-if="form.type === 'space'" label="Browser demo">
        <el-checkbox
          v-model="form.onnxEnabled"
          data-testid="create-onnx-enabled"
          >Enable browser ONNX</el-checkbox
        >
      </el-form-item>

      <!-- Visibility -->
      <el-form-item label="Visibility">
        <el-checkbox v-model="form.private"
          >Make this {{ form.type }} private</el-checkbox
        >
        <p class="w-full mt-1 text-xs text-gray-600 dark:text-gray-400">
          {{
            form.private
              ? "You choose who can see and commit to this repository"
              : "Anyone on the internet can see this repository"
          }}
        </p>
      </el-form-item>

      <!-- Actions -->
      <div
        class="flex flex-col-reverse sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700"
      >
        <el-button size="large" @click="cancel" class="w-full sm:w-auto">
          Cancel
        </el-button>
        <el-button
          type="primary"
          size="large"
          :loading="creating"
          @click="handleSubmit"
          class="w-full sm:w-auto"
        >
          <div class="i-carbon-add inline-block mr-1" />
          Create {{ typeLabel }}
        </el-button>
      </div>
    </template>
  </el-form>
</template>

<script setup>
import { computed, ref, reactive, watch, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { repoAPI, orgAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { ElMessage } from "element-plus";
import { createRepositoryNameRules } from "@/utils/repo-creation";
import { decodeError, notifyError } from "@/errors";
import {
  loadOnnxSpace,
  onnxEditorLocation,
  saveOnnxSpace,
} from "@/utils/onnx-space";
import ErrorState from "@/components/common/ErrorState.vue";
import LinkButton from "@/components/common/LinkButton.vue";
import {
  DEFAULT_SPACE_SDK,
  REPOSITORY_TYPES,
  SPACE_SDKS,
  isRepositoryType,
} from "@/utils/repository-types";
const props = defineProps({
  fixedType: String,
  initialType: { type: String, default: "model" },
  compact: Boolean,
});
const emit = defineEmits(["cancel", "created"]);
const router = useRouter();
const { username: currentUser, organizations } = storeToRefs(useAuthStore());
const formRef = ref(null);
const creating = ref(false);
const createdSpace = ref(null);
const enableError = ref(null);
const loadedOrgs = ref([...organizations.value]);
let initialOwner = true;
let organizationSequence = 0;
let createSequence = 0;
let disposed = false;
const userOrgs = computed(() => [
  ...new Map(loadedOrgs.value.map((org) => [org.name, org])).values(),
]);
const form = reactive({
  type: props.fixedType || props.initialType,
  owner: currentUser.value,
  name: "",
  private: false,
  sdk: DEFAULT_SPACE_SDK,
  onnxEnabled: false,
});
const rules = {
  type: [
    {
      required: true,
      message: "Please select repository type",
      trigger: "change",
    },
  ],
  owner: [
    { required: true, message: "Please select owner", trigger: "change" },
  ],
  name: createRepositoryNameRules(),
};
const repositoryType = computed(() =>
  REPOSITORY_TYPES.find((item) => item.type === form.type),
);
const typeLabel = computed(() => repositoryType.value?.label || "Repository");
function reset() {
  form.name = "";
  form.owner = currentUser.value;
  form.private = false;
  form.sdk = DEFAULT_SPACE_SDK;
  form.onnxEnabled = false;
  createdSpace.value = null;
  enableError.value = null;
  formRef.value?.clearValidate?.();
}
function cancel() {
  createSequence++;
  creating.value = false;
  reset();
  emit("cancel");
}
watch(
  () => props.fixedType || props.initialType,
  (type) => {
    if (isRepositoryType(type)) form.type = type;
  },
);
watch(
  currentUser,
  async (username) => {
    const sequence = ++organizationSequence;
    createSequence++;
    creating.value = false;
    reset();
    if (!initialOwner) loadedOrgs.value = [];
    initialOwner = false;
    if (!username) {
      loadedOrgs.value = [];
      return;
    }
    try {
      const { data } = await orgAPI.getUserOrgs(username);
      if (!disposed && sequence === organizationSequence)
        loadedOrgs.value = data.organizations || [];
    } catch (error) {
      if (!disposed && sequence === organizationSequence) {
        console.error("Failed to load organizations:", error);
        notifyError(error, { fallback: "Failed to load your organizations" });
      }
    }
  },
  { immediate: true, flush: "sync" },
);
async function handleSubmit() {
  if (!formRef.value || creating.value || createdSpace.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid || creating.value) return;
    const sequence = ++createSequence;
    const payload = {
      type: form.type,
      name: form.name,
      organization: form.owner !== currentUser.value ? form.owner : null,
      private: form.private,
      // only a Space has one: the backend writes the card that names it
      ...(form.type === "space" ? { sdk: form.sdk } : {}),
    };
    const owner = form.owner;
    const enableOnnx = form.type === "space" && form.onnxEnabled;
    creating.value = true;
    try {
      const { data } = await repoAPI.create(payload);
      if (disposed || sequence !== createSequence) return;
      const repoId = data.repo_id || `${owner}/${payload.name}`;
      if (enableOnnx) {
        createdSpace.value = { id: repoId, revision: "main" };
        await enableCreatedSpace(sequence);
        return;
      }
      ElMessage.success(`${typeLabel.value} created successfully`);
      emit("created", { repoId, type: payload.type });
      router.push(`/${payload.type}s/${repoId}`);
    } catch (error) {
      if (!disposed && sequence === createSequence)
        notifyError(error, { fallback: `Failed to create ${payload.type}` });
    } finally {
      if (!disposed && sequence === createSequence) creating.value = false;
    }
  });
}
async function enableCreatedSpace(sequence) {
  const context = createdSpace.value;
  if (!context || disposed || sequence !== createSequence) return;
  creating.value = true;
  enableError.value = null;
  try {
    const current = await loadOnnxSpace(context);
    if (disposed || sequence !== createSequence) return;
    if (!current.config.enabled) {
      await saveOnnxSpace(
        context,
        { ...current.config, enabled: true },
        {
          parentCommit: current.commit,
          message: "Enable browser ONNX demo",
        },
      );
    }
    if (disposed || sequence !== createSequence) return;
    ElMessage.success("Space created with browser ONNX enabled");
    emit("created", { repoId: context.id, type: "space" });
    router.push(onnxEditorLocation(context));
  } catch (error) {
    if (!disposed && sequence === createSequence)
      enableError.value = decodeError(error);
  } finally {
    if (!disposed && sequence === createSequence) creating.value = false;
  }
}
onBeforeUnmount(() => {
  disposed = true;
  organizationSequence++;
  createSequence++;
});
</script>
