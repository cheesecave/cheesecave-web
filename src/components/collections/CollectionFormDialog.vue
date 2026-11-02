<script setup>
import { computed, reactive, ref, watch } from "vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import {
  COLLECTION_THEMES,
  DESCRIPTION_MAX,
  TITLE_MAX,
  writableOwners,
} from "@/utils/collections";

// Create a collection (the owner is the user or one of their organizations) or edit the title, description,
// visibility and colour of one. The slug follows the title; the id at its end never changes.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  collection: { type: Object, default: null },
  // an item to put in the new collection (the "+ New collection" of the add-to-collection menu)
  firstItem: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "saved"]);

const auth = useAuthStore();
const form = reactive({ title: "", description: "", private: false, theme: "green", namespace: "" });
const saving = ref(false);
const failure = ref("");

const editing = computed(() => !!props.collection);
const owners = computed(() => writableOwners(auth));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    failure.value = "";
    form.title = props.collection?.title || "";
    form.description = props.collection?.description || "";
    form.private = props.collection?.private || false;
    form.theme = props.collection?.theme || "green";
    form.namespace = auth.username;
  },
  { immediate: true },
);

function problem(err) {
  return err?.response?.data?.error || err?.appError?.message || err?.message || "Something went wrong";
}

async function save() {
  if (!form.title.trim()) {
    failure.value = "A collection needs a title";
    return;
  }
  saving.value = true;
  failure.value = "";
  try {
    let saved;
    if (editing.value) {
      const { data } = await collectionsAPI.update(props.collection.slug, {
        title: form.title.trim(),
        description: form.description,
        private: form.private,
        theme: form.theme,
      });
      saved = data.data;
    } else {
      const { data } = await collectionsAPI.create({
        title: form.title.trim(),
        namespace: form.namespace,
        description: form.description || undefined,
        private: form.private,
        ...(props.firstItem ? { item: props.firstItem } : {}),
      });
      saved = data;
    }
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
    :model-value="modelValue"
    :title="editing ? 'Edit the collection' : 'New collection'"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item v-if="!editing && owners.length > 1" label="Owner">
        <el-select v-model="form.namespace" aria-label="Owner">
          <el-option v-for="name in owners" :key="name" :label="name" :value="name" />
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
      <el-form-item v-if="editing" label="Colour">
        <div class="theme-row" role="radiogroup" aria-label="Colour">
          <button
            v-for="(color, name) in COLLECTION_THEMES"
            :key="name"
            type="button"
            role="radio"
            :aria-checked="form.theme === name"
            :aria-label="name"
            class="theme-dot"
            :class="{ active: form.theme === name }"
            :style="{ background: color }"
            @click="form.theme = name"
          />
        </div>
      </el-form-item>
      <el-alert v-if="failure" :title="failure" type="error" show-icon :closable="false" />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="save">
        {{ editing ? "Save" : "Create collection" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.theme-row {
  display: flex;
  gap: 0.5rem;
}
.theme-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.theme-dot.active {
  border-color: currentColor;
  box-shadow: 0 0 0 2px var(--el-bg-color, #fff) inset;
}
</style>
