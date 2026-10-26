<script setup>
import { computed, ref, watch } from "vue";
import { ElTabs } from "element-plus";

defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: [String, Number],
  formCreateInject: Object,
});
const emit = defineEmits(["update:modelValue"]);
const configured = computed(
  () => props.modelValue ?? props.formCreateInject?.rule?.value,
);
const selected = ref(configured.value);
watch(configured, (value) => {
  selected.value = value;
});

// Element Plus defaults to the name "0". Imported named panes need the same
// first-pane fallback in the author canvas and the independent renderer.
const paneNames = computed(() =>
  (props.formCreateInject?.rule?.children || [])
    .filter(
      (rule) =>
        rule.type === "elTabPane" && !rule.hidden && rule.display !== false,
    )
    .map((rule, index) => rule.props?.name ?? String(index)),
);
const activeName = computed(() =>
  !paneNames.value.length
    ? (selected.value ?? "0")
    : paneNames.value.includes(selected.value)
      ? selected.value
      : paneNames.value[0],
);
function select(value) {
  selected.value = value;
  emit("update:modelValue", value);
}
</script>

<template>
  <ElTabs v-bind="$attrs" :model-value="activeName" @update:model-value="select"
    ><slot
  /></ElTabs>
</template>
