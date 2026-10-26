<script setup>
import { computed } from "vue";
import { repoChips } from "@/utils/repo-chips";

// The chips of a repository card: the task, the library or SDK, the license, then free tags, in the
// colours and icons of the repository header. Each is a link to the discovery page filtered by it
// and sits above the card's own link (.stretched-link-above); the count of the rest is plain text,
// so a click on it opens the repository like a click anywhere else on the card.
const props = defineProps({
  repo: { type: Object, required: true },
  type: { type: String, required: true },
  max: { type: Number, default: 3 },
});

const all = computed(() => repoChips(props.repo, props.type));
const shown = computed(() => all.value.slice(0, props.max));
const hidden = computed(() => all.value.slice(props.max));
const hiddenTitle = computed(
  () =>
    `${hidden.value.length} more: ${hidden.value.map((chip) => chip.label).join(", ")}`,
);
</script>

<template>
  <div v-if="shown.length" class="repo-chips flex gap-1 flex-wrap">
    <RouterLink
      v-for="chip in shown"
      :key="chip.id"
      class="stretched-link-above"
      :to="{ path: `/${type}s`, query: chip.query }"
    >
      <el-tag
        :type="chip.tone"
        size="small"
        :effect="chip.plain ? 'plain' : undefined"
      >
        <div v-if="chip.icon" :class="chip.icon" class="inline-block mr-1" />
        {{ chip.label }}
      </el-tag>
    </RouterLink>
    <el-tag
      v-if="hidden.length"
      class="repo-chips-more"
      size="small"
      effect="plain"
      :title="hiddenTitle"
      >+{{ hidden.length }}</el-tag
    >
  </div>
</template>
