<script setup>
import { computed, reactive, ref, watch } from "vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  writableOwners,
} from "@/utils/collections";

// Create a collection: the owner is the user or one of their organizations. An existing one is changed where it is shown
// (the page of the collection), not here.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // an item to put in the new collection (the "+ New collection" of the add-to-collection menu)
  firstItem: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "saved"]);

const auth = useAuthStore();
const form = reactive({
  title: "",
  description: "",
  private: false,
  namespace: "",
});
const saving = ref(false);
const failure = ref("");

const owners = computed(() => writableOwners(auth));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    failure.value = "";
    form.title = "";
    form.description = "";
    form.private = false;
    form.namespace = auth.username;
  },
  { immediate: true },
);

function problem(err) {
  return (
    err?.response?.data?.error ||
    err?.appError?.message ||
    err?.message ||
    "Something went wrong"
  );
}

async function save() {
  if (!form.title.trim()) {
    failure.value = "A collection needs a title";
    return;
  }
  saving.value = true;
  failure.value = "";
  try {
    const { data: saved } = await collectionsAPI.create({
      title: form.title.trim(),
      namespace: form.namespace,
      description: form.description || undefined,
      private: form.private,
      ...(props.firstItem ? { item: props.firstItem } : {}),
    });
    emit("saved", saved);
    emit("update:modelValue", false);
  } catch (err) {
    failure.value =
      err?.response?.status === 409
        ? "You already have a collection with this title"
        : problem(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    title="New collection"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item v-if="owners.length > 1" label="Owner">
        <el-select v-model="form.namespace" aria-label="Owner">
          <el-option
            v-for="name in owners"
            :key="name"
            :label="name"
            :value="name"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Title">
        <el-input
          v-model="form.title"
          :maxlength="TITLE_MAX"
          show-word-limit
          placeholder="For example: ICCV 2026"
          aria-label="Title"
        />
      </el-form-item>
      <el-form-item label="Description (optional)">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          :maxlength="DESCRIPTION_MAX"
          show-word-limit
          aria-label="Description"
        />
      </el-form-item>
      <el-form-item label="Visibility">
        <el-radio-group v-model="form.private" aria-label="Visibility">
          <el-radio :value="false">Public</el-radio>
          <el-radio :value="true">Private</el-radio>
        </el-radio-group>
        <div class="text-xs text-gray-500 mt-1 w-full">
          {{
            form.private
              ? "Only you (or the members of the organization) can see it, and it is not listed on the profile."
              : "Anyone can see it, and it is listed on the profile."
          }}
        </div>
      </el-form-item>
      <el-alert
        v-if="failure"
        :title="failure"
        type="error"
        show-icon
        :closable="false"
      />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="save">
        Create collection
      </el-button>
    </template>
  </el-dialog>
</template>
