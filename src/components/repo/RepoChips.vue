<script setup>
import { computed, ref } from "vue";
import { repoChips } from "@/utils/repo-chips";
import { protoVariant } from "@/utils/proto-variant";

// The chips of a repository card: the task, the library or SDK, the license, then free tags, in the
// colours and icons of the repository header. Each is a link to the discovery page filtered by it
// and sits above the card's own link (.stretched-link-above).
//
// PROTOTYPE of what the count of the rest does (`?chips=` in the address bar):
//   current  plain text; a click opens the repository like anywhere else on the card (main today)
//   inline   a button; the card grows to hold every chip, "Show less" folds it back
//   popover  a button; a floating panel lists the rest and the card keeps its size
const props = defineProps({
  repo: { type: Object, required: true },
  type: { type: String, required: true },
  max: { type: Number, default: 3 },
});

const variant = protoVariant("chips", ["current", "inline", "popover"], "current");
const expanded = ref(false);

const all = computed(() => repoChips(props.repo, props.type));
const shown = computed(() => all.value.slice(0, props.max));
const hidden = computed(() => all.value.slice(props.max));
// Listed after the button, so that "Show less" stays where "+N" was and never scrolls out of sight
const unfolded = computed(() =>
  variant === "inline" && expanded.value ? hidden.value : [],
);
const hiddenTitle = computed(
  () =>
    `${hidden.value.length} more: ${hidden.value.map((chip) => chip.label).join(", ")}`,
);
</script>

<template>
  <div
    v-if="all.length"
    class="repo-chips flex gap-1 flex-wrap"
    :class="{ 'repo-chips-open': variant === 'inline' && expanded }"
  >
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

    <template v-if="hidden.length">
      <el-tag
        v-if="variant === 'current'"
        class="repo-chips-more"
        size="small"
        effect="plain"
        :title="hiddenTitle"
        >+{{ hidden.length }}</el-tag
      >

      <el-popover
        v-else-if="variant === 'popover'"
        trigger="click"
        placement="bottom-start"
        :width="300"
        :persistent="false"
        popper-class="repo-chips-popover"
      >
        <template #reference>
          <button
            type="button"
            class="repo-chips-toggle stretched-link-above"
            :aria-label="`Show ${hidden.length} more tags`"
          >
            <el-tag size="small" effect="plain">+{{ hidden.length }}</el-tag>
          </button>
        </template>
        <div class="repo-chips-popover-list flex gap-1 flex-wrap">
          <RouterLink
            v-for="chip in hidden"
            :key="chip.id"
            :to="{ path: `/${type}s`, query: chip.query }"
          >
            <el-tag
              :type="chip.tone"
              size="small"
              :effect="chip.plain ? 'plain' : undefined"
            >
              <div
                v-if="chip.icon"
                :class="chip.icon"
                class="inline-block mr-1"
              />
              {{ chip.label }}
            </el-tag>
          </RouterLink>
        </div>
      </el-popover>

      <button
        v-else
        type="button"
        class="repo-chips-toggle stretched-link-above"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <el-tag size="small" effect="plain">{{
          expanded ? "Show less" : `+${hidden.length}`
        }}</el-tag>
      </button>
    </template>

    <RouterLink
      v-for="chip in unfolded"
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
  </div>
</template>

<style scoped>
.repo-chips-toggle {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
}
.repo-chips-toggle:hover :deep(.el-tag) {
  border-color: var(--site-primary, #c28b37);
  color: var(--site-link, #94621f);
}
.repo-chips-open {
  max-height: 9.5rem;
  overflow-y: auto;
}
</style>

<style>
.repo-chips-popover-list {
  max-height: 14rem;
  overflow-y: auto;
}
.repo-chips-popover-list a {
  max-width: 100%;
}
.repo-chips-popover-list .el-tag {
  max-width: 100%;
  height: auto;
  white-space: normal;
}
</style>
