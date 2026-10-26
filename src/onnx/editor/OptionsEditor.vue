<script setup>
const props = defineProps({ modelValue: { type: Array, default: () => [] } });
const emit = defineEmits(["update:modelValue"]);
function update(index, key, value) {
  const next = props.modelValue.map((item) => ({ ...item }));
  next[index][key] = value;
  emit("update:modelValue", next);
}
function add() {
  emit("update:modelValue", [
    ...props.modelValue,
    { label: "新选项", value: `option_${props.modelValue.length + 1}` },
  ]);
}
</script>
<template>
  <div class="cc-options-editor">
    <div v-for="(item, index) in modelValue" :key="index" class="cc-option-row">
      <el-input
        :model-value="item.label"
        placeholder="显示名称"
        aria-label="选项名称"
        @update:model-value="update(index, 'label', $event)"
      />
      <el-input
        :model-value="String(item.value)"
        placeholder="值"
        aria-label="选项值"
        @update:model-value="update(index, 'value', $event)"
      />
      <el-button
        text
        aria-label="删除选项"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, i) => i !== index),
          )
        "
        >×</el-button
      >
    </div>
    <el-button text type="primary" @click="add">添加选项</el-button>
  </div>
</template>
<style scoped>
.cc-options-editor {
  width: 100%;
}
.cc-option-row {
  display: grid;
  grid-template-columns: 1fr 1fr 24px;
  gap: 4px;
  margin-bottom: 6px;
}
</style>
