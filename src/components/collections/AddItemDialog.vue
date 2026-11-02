<script setup>
import { reactive, ref, watch } from "vue";
import { collectionsAPI } from "@/utils/api";
import { NOTE_MAX } from "@/utils/collections";

// Add a repository (or another collection) by its id; the server tells a missing or unreadable one (404), a duplicate (409).
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  slug: { type: String, required: true },
});
const emit = defineEmits(["update:modelValue", "added"]);

const form = reactive({ type: "model", id: "", note: "" });
const saving = ref(false);
const failure = ref("");

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.type = "model";
      form.id = "";
      form.note = "";
      failure.value = "";
    }
  },
);

const PLACEHOLDERS = {
  model: "owner/model-name",
  dataset: "owner/dataset-name",
  space: "owner/space-name",
  collection: "owner/title-0123456789abcdef01234567",
};

async function add() {
  if (!form.id.trim()) {
    failure.value = "Enter the id of the item";
    return;
  }
  saving.value = true;
  failure.value = "";
  try {
    const { data } = await collectionsAPI.addItem(
      props.slug,
      { type: form.type, id: form.id.trim() },
      form.note || undefined,
    );
    emit("added", data);
    emit("update:modelValue", false);
  } catch (err) {
    const status = err?.response?.status;
    failure.value =
      status === 404
        ? `No ${form.type} with this id, or you cannot see it`
        : status === 409
          ? "This is already in the collection"
          : err?.response?.data?.error || err?.appError?.message || "Something went wrong";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="Add to the collection"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" @submit.prevent="add">
      <el-form-item label="What">
        <el-radio-group v-model="form.type" aria-label="Type of the item">
          <el-radio-button value="model">Model</el-radio-button>
          <el-radio-button value="dataset">Dataset</el-radio-button>
          <el-radio-button value="space">Space</el-radio-button>
          <el-radio-button value="collection">Collection</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Id">
        <el-input v-model="form.id" :placeholder="PLACEHOLDERS[form.type]" aria-label="Id of the item" />
      </el-form-item>
      <el-form-item label="Note (optional)">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="3"
          :maxlength="NOTE_MAX"
          show-word-limit
          aria-label="Note"
        />
      </el-form-item>
      <el-alert v-if="failure" :title="failure" type="error" show-icon :closable="false" />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="add">Add</el-button>
    </template>
  </el-dialog>
</template>
