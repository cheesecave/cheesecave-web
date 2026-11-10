<script setup>
import { computed } from "vue";
import { ElMessage } from "element-plus";
import RepositoryHeader from "./RepositoryHeader.vue";
import { copyToClipboard } from "@/utils/clipboard";
import { guestRepositoryTabs } from "@/utils/repository-access";

const props = defineProps({
  repository: { type: Object, required: true },
  access: { type: Object, default: () => ({}) },
  preview: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  view: { type: String, default: "card" },
});
// Only route identity and the access preflight are public here. In particular,
// rendering the shared header must never request normal repository metadata.
const visibility = computed(() =>
  props.access.visibility === "private" ? "private" : "invite",
);
const tabs = computed(() => {
  const path = `/${props.repository.type}s/${props.repository.namespace}/${props.repository.name}`;
  const locked = "Repository access is required";
  return props.preview
    ? guestRepositoryTabs(props.repository)
    : [
        { key: "card", label: "Invitation", to: path },
        { key: "files", label: "Files", disabledReason: locked },
        { key: "metadata", label: "Metadata", disabledReason: locked },
      ];
});
async function copyRepoId() {
  const copied = await copyToClipboard(
    `${props.repository.namespace}/${props.repository.name}`,
  );
  if (copied) ElMessage.success("Repository ID copied to clipboard");
  else ElMessage.error("Failed to copy repository ID");
}
</script>

<template>
  <section class="repository-access-page">
    <RepositoryHeader
      v-if="!embedded"
      :repo-type="repository.type"
      :namespace="repository.namespace"
      :name="repository.name"
      :namespace-link="`/${repository.namespace}`"
      :visibility="visibility"
      :tabs="tabs"
      :active-tab="preview ? view : 'card'"
      @copy="copyRepoId"
    >
      <template v-if="$slots.actions" #actions
        ><slot name="actions"
      /></template>
    </RepositoryHeader>
    <div
      class="repository-access-content"
      :class="{ 'has-sidebar': $slots.aside }"
    >
      <main class="repository-access-main"><slot /></main>
      <aside v-if="$slots.aside" aria-label="Repository access">
        <slot name="aside" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.repository-access-page,
.repository-access-main,
aside {
  min-width: 0;
}
.repository-access-content {
  width: 100%;
  padding: 24px;
}
.repository-access-content.has-sidebar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
aside {
  display: grid;
  gap: 24px;
}
@media (max-width: 1023px) {
  .repository-access-content.has-sidebar {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .repository-access-content {
    padding: 20px 16px;
  }
}
</style>
