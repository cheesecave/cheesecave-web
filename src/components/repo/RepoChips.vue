<script setup>
import { computed, ref } from "vue";
import { repoChips } from "@/utils/repo-chips";

// The chips of a repository card: the task, the library or SDK, the license, then free tags, in the
// colours and icons of the repository header. Each is a link to the discovery page filtered by it
// and sits above the card's own link (.stretched-link-above). The count of the rest is a button that
// opens a popover listing them, so the card keeps its size; the popover is not kept in the page
// while closed (a list page holds hundreds of cards), and holds long lists in a scrolling box.
const props = defineProps({
  repo: { type: Object, required: true },
  type: { type: String, required: true },
  max: { type: Number, default: 3 },
});

const all = computed(() => repoChips(props.repo, props.type));
const shown = computed(() => all.value.slice(0, props.max));
const hidden = computed(() => all.value.slice(props.max));

// Escape closes the popover, whether the focus is still on the button or has moved into the list
const popover = ref(null);
const close = () => popover.value?.hide();
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

    <el-popover
      v-if="hidden.length"
      ref="popover"
      trigger="click"
      placement="bottom-start"
      :width="300"
      :persistent="false"
      popper-class="repo-chips-popover"
    >
      <template #reference>
        <button
          type="button"
          class="repo-chips-more stretched-link-above"
          :aria-label="`Show ${hidden.length} more`"
          @keydown.esc="close"
        >
          <el-tag size="small" effect="plain">+{{ hidden.length }}</el-tag>
        </button>
      </template>
      <div
        class="repo-chips-popover-list flex gap-1 flex-wrap"
        @keydown.esc="close"
      >
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
  </div>
</template>

<style scoped>
.repo-chips-more {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
}
.repo-chips-more:hover :deep(.el-tag) {
  border-color: var(--site-primary, #c28b37);
  color: var(--site-link, #94621f);
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
