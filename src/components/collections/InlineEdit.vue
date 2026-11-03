<!-- src/components/collections/InlineEdit.vue: a text that its owner changes in place, as the title and the description of a
     collection on Hugging Face: a pencil beside the text, the text becomes a field, Enter or the check saves, Esc cancels -->
<script setup>
import { nextTick, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  canEdit: { type: Boolean, default: false },
  // what the pencil and the field are called for a screen reader: "title", "description"
  label: { type: String, required: true },
  tag: { type: String, default: "span" },
  textClass: { type: String, default: "" },
  multiline: { type: Boolean, default: false },
  maxlength: { type: Number, default: 0 },
  // shown to the one who may edit while there is no text
  placeholder: { type: String, default: "" },
  required: { type: Boolean, default: false },
  // async (text) => true when saved (the field closes), false when not (it stays open; the caller says why)
  save: { type: Function, required: true },
});

const editing = ref(false);
const draft = ref("");
const saving = ref(false);
const field = ref(null);

async function start() {
  draft.value = props.modelValue;
  editing.value = true;
  await nextTick();
  field.value?.focus();
}

function cancel() {
  editing.value = false;
}

async function commit() {
  const text = draft.value.trim();
  if (props.required && !text) return;
  if (text === props.modelValue) return cancel();
  saving.value = true;
  try {
    if (await props.save(text)) editing.value = false;
  } finally {
    saving.value = false;
  }
}

function onKey(event) {
  if (event.key === "Escape") return cancel();
  if (
    event.key === "Enter" &&
    (!props.multiline || event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    commit();
  }
}
</script>

<template>
  <div class="inline-edit">
    <div v-if="!editing" class="inline-edit-view">
      <component
        :is="tag"
        v-if="modelValue"
        class="inline-edit-text"
        :class="textClass"
        >{{ modelValue }}</component
      >
      <span v-else-if="canEdit" class="inline-edit-empty">{{
        placeholder
      }}</span>
      <button
        v-if="canEdit"
        type="button"
        class="inline-edit-pencil"
        :aria-label="`Edit the ${label}`"
        :title="`Edit the ${label}`"
        @click="start"
      >
        <span class="i-carbon-edit" aria-hidden="true" />
      </button>
    </div>
    <div v-else class="inline-edit-form">
      <el-input
        ref="field"
        v-model="draft"
        :type="multiline ? 'textarea' : 'text'"
        :rows="3"
        :maxlength="maxlength || undefined"
        :show-word-limit="!!maxlength"
        :aria-label="label"
        :disabled="saving"
        @keydown="onKey"
      />
      <div class="inline-edit-actions">
        <el-button
          type="primary"
          size="small"
          :loading="saving"
          :disabled="required && !draft.trim()"
          @click="commit"
        >
          Save
        </el-button>
        <el-button size="small" :disabled="saving" @click="cancel"
          >Cancel</el-button
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-edit-view {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.inline-edit-empty {
  color: var(--el-text-color-placeholder, #9ca3af);
}
.inline-edit-pencil {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--el-text-color-secondary, #6b7280);
  cursor: pointer;
}
.inline-edit-pencil:hover,
.inline-edit-pencil:focus-visible {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.05));
}
.inline-edit-form {
  min-width: min(100%, 24rem);
}
.inline-edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
