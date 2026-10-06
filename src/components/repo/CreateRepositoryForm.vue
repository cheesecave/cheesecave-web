<template>
  <el-form
    ref="formRef"
    :model="form"
    :rules="rules"
    label-position="top"
    @submit.prevent="handleSubmit"
  >
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
        Use letters, numbers, hyphens, underscores, and dots only
      </div>
    </el-form-item>

    <!-- Visibility -->
    <el-form-item label="Visibility">
      <el-checkbox v-model="form.private"
        >Make this {{ form.type }} private</el-checkbox
      >
      <p class="text-xs text-gray-600 dark:text-gray-400">
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
import { notifyError } from "@/errors";
import { REPOSITORY_TYPES, isRepositoryType } from "@/utils/repository-types";
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
      if (!disposed && sequence === organizationSequence)
        console.error("Failed to load organizations:", error);
    }
  },
  { immediate: true, flush: "sync" },
);
async function handleSubmit() {
  if (!formRef.value || creating.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid || creating.value) return;
    const sequence = ++createSequence;
    const payload = {
      type: form.type,
      name: form.name,
      organization: form.owner !== currentUser.value ? form.owner : null,
      private: form.private,
    };
    const owner = form.owner;
    creating.value = true;
    try {
      const { data } = await repoAPI.create(payload);
      if (disposed || sequence !== createSequence) return;
      ElMessage.success(`${typeLabel.value} created successfully`);
      const repoId = data.repo_id || `${owner}/${payload.name}`;
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
onBeforeUnmount(() => {
  disposed = true;
  organizationSequence++;
  createSequence++;
});
</script>
