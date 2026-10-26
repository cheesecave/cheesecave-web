<script setup>
import { computed, reactive } from "vue";
import {
  getLicenseName,
  getPipelineTagName,
  getLanguageName,
} from "@/utils/metadata-helpers";

import { SPACE_SDKS } from "@/utils/repository-types";

const props = defineProps({
  metadata: {
    type: Object,
    required: true,
  },
  repoType: {
    type: String,
    required: true,
  },
  // What the API knows (see `splitTags`): the libraries and frameworks, the free tags, the papers
  libraries: { type: Array, default: () => [] },
  others: { type: Array, default: () => [] },
  arxiv: { type: Array, default: () => [] },
});

const emit = defineEmits(["navigate-to-metadata"]);

const MAX_OTHERS = 6;
const MAX_PAPERS = 2;

// A "+N more" unfolds what it counts right here, and "Show less" folds it back. An open header
// could hold thousands of chips (fineweb-2 lists 1813 languages), so it is held to a scrolling box
// (.metadata-header-open); the way to the Metadata tab, which a "+N more" used to take, is the link
// under the box while anything is open.
const open = reactive({
  languages: false,
  others: false,
  tasks: false,
  papers: false,
});
// What is folded behind a count, listed only while its group is open and placed right after the
// count's own button, so that "Show less" stays where "+N more" was and never scrolls out of sight
const rest = (list, max, key) => (open[key] ? list.slice(max) : []);
const anyOpen = computed(() => Object.values(open).some(Boolean));
const toggle = (key) => {
  open[key] = !open[key];
};
const moreLabel = (key, count) => (open[key] ? "Show less" : `+${count} more`);

// Every chip leads to the discovery page of this kind of repository, filtered by it
const discoverPath = computed(() => `/${props.repoType}s`);
const to = (query) => ({ path: discoverPath.value, query });

// An older backend gives no groups: the library the README names is then the only one
const shownLibraries = computed(() => {
  if (props.libraries.length) return props.libraries;
  const name = props.metadata.library_name;
  return name ? [{ id: name, label: name, query: { library: name } }] : [];
});

const shownOthers = computed(() => props.others.slice(0, MAX_OTHERS));
const restOthers = computed(() => rest(props.others, MAX_OTHERS, "others"));
const moreOthers = computed(() =>
  Math.max(0, props.others.length - MAX_OTHERS),
);
const shownPapers = computed(() => props.arxiv.slice(0, MAX_PAPERS));
const restPapers = computed(() => rest(props.arxiv, MAX_PAPERS, "papers"));
const morePapers = computed(() => Math.max(0, props.arxiv.length - MAX_PAPERS));

// A card may write the license as a list; the first one is the one shown
const license = computed(() => {
  const value = Array.isArray(props.metadata.license)
    ? props.metadata.license[0]
    : props.metadata.license;
  return typeof value === "string" && value ? value : null;
});
const licenseName = computed(() =>
  license.value ? getLicenseName(license.value) : null,
);
// only used where there is a license
const licenseId = computed(() => String(license.value).toLowerCase());

const sdkName = computed(() => {
  const sdk = props.metadata.sdk;
  return SPACE_SDKS.find((item) => item.value === sdk)?.label || sdk;
});

// A card writes some values as one string, some as a list
const asList = (value) => (value ? [].concat(value) : []);

const languages = computed(() => asList(props.metadata.language).slice(0, 3)); // max 3 in the header
const restLanguages = computed(() =>
  rest(asList(props.metadata.language), 3, "languages"),
);
const moreLanguages = computed(() =>
  Math.max(0, asList(props.metadata.language).length - 3),
);

const pipelineTag = computed(() => {
  return props.metadata.pipeline_tag
    ? getPipelineTagName(props.metadata.pipeline_tag)
    : null;
});

const taskCategories = computed(() =>
  asList(props.metadata.task_categories).slice(0, 2),
); // max 2 tasks
const restTasks = computed(() =>
  rest(asList(props.metadata.task_categories), 2, "tasks"),
);
const moreTasks = computed(() =>
  Math.max(0, asList(props.metadata.task_categories).length - 2),
);

const sizeCategory = computed(
  () => asList(props.metadata.size_categories)[0] ?? null,
);
</script>

<template>
  <div
    class="metadata-header bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4"
  >
    <div
      class="flex flex-wrap items-center gap-2"
      :class="{ 'metadata-header-open': anyOpen }"
    >
      <!-- Pipeline Tag (Models) -->
      <RouterLink
        v-if="repoType === 'model' && pipelineTag"
        :to="to({ task: metadata.pipeline_tag })"
      >
        <el-tag type="warning" size="small">
          <div class="i-carbon-task inline-block mr-1" />
          {{ pipelineTag }}
        </el-tag>
      </RouterLink>

      <!-- Libraries and frameworks (Models) -->
      <RouterLink
        v-for="library in repoType === 'model' ? shownLibraries : []"
        :key="library.id"
        :to="to(library.query)"
      >
        <el-tag type="success" size="small">
          <div class="i-carbon-cube inline-block mr-1" />
          {{ library.label }}
        </el-tag>
      </RouterLink>

      <!-- SDK (Spaces) -->
      <RouterLink
        v-if="repoType === 'space' && metadata.sdk"
        :to="to({ sdk: metadata.sdk })"
      >
        <el-tag type="success" size="small">
          <div class="i-carbon-application inline-block mr-1" />
          {{ sdkName }}
        </el-tag>
      </RouterLink>

      <!-- License -->
      <RouterLink v-if="licenseName" :to="to({ license: licenseId })">
        <el-tag type="info" size="small">
          <div class="i-carbon-document inline-block mr-1" />
          {{ licenseName }}
        </el-tag>
      </RouterLink>

      <!-- Languages -->
      <RouterLink
        v-for="lang in languages"
        :key="lang"
        :to="to({ language: String(lang).toLowerCase() })"
      >
        <el-tag type="primary" size="small" effect="plain">
          <div class="i-carbon-language inline-block mr-1" />
          {{ getLanguageName(lang) }}
        </el-tag>
      </RouterLink>
      <el-tag
        v-if="moreLanguages > 0"
        size="small"
        effect="plain"
        class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
        @click="toggle('languages')"
      >
        {{ moreLabel("languages", moreLanguages) }}
      </el-tag>
      <RouterLink
        v-for="lang in restLanguages"
        :key="lang"
        :to="to({ language: String(lang).toLowerCase() })"
      >
        <el-tag type="primary" size="small" effect="plain">
          <div class="i-carbon-language inline-block mr-1" />
          {{ getLanguageName(lang) }}
        </el-tag>
      </RouterLink>

      <!-- Free tags (Models) -->
      <RouterLink
        v-for="tag in repoType === 'model' ? shownOthers : []"
        :key="tag.id"
        :to="to(tag.query)"
      >
        <el-tag size="small" effect="plain">{{ tag.label }}</el-tag>
      </RouterLink>
      <el-tag
        v-if="repoType === 'model' && moreOthers > 0"
        size="small"
        effect="plain"
        class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
        @click="toggle('others')"
      >
        {{ moreLabel("others", moreOthers) }}
      </el-tag>
      <RouterLink
        v-for="tag in repoType === 'model' ? restOthers : []"
        :key="tag.id"
        :to="to(tag.query)"
      >
        <el-tag size="small" effect="plain">{{ tag.label }}</el-tag>
      </RouterLink>

      <!-- Papers (Models): away from the site -->
      <a
        v-for="paper in repoType === 'model' ? shownPapers : []"
        :key="paper.id"
        :href="paper.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <el-tag size="small" effect="plain">
          <div class="i-carbon-document-attachment inline-block mr-1" />
          {{ paper.label }}
        </el-tag>
      </a>
      <el-tag
        v-if="repoType === 'model' && morePapers > 0"
        size="small"
        effect="plain"
        class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
        @click="toggle('papers')"
      >
        {{ moreLabel("papers", morePapers) }}
      </el-tag>
      <a
        v-for="paper in repoType === 'model' ? restPapers : []"
        :key="paper.id"
        :href="paper.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <el-tag size="small" effect="plain">
          <div class="i-carbon-document-attachment inline-block mr-1" />
          {{ paper.label }}
        </el-tag>
      </a>

      <!-- Size (Datasets) - IMPORTANT INFO -->
      <el-tag
        v-if="repoType === 'dataset' && sizeCategory"
        type="danger"
        size="small"
      >
        <div class="i-carbon-data-volume inline-block mr-1" />
        {{ sizeCategory }}
      </el-tag>

      <!-- Task Categories (Datasets) -->
      <el-tag
        v-for="task in repoType === 'dataset' ? taskCategories : []"
        :key="task"
        type="success"
        size="small"
      >
        <div class="i-carbon-checkbox-checked inline-block mr-1" />
        {{ task }}
      </el-tag>
      <el-tag
        v-if="moreTasks > 0"
        size="small"
        effect="plain"
        class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
        @click="toggle('tasks')"
      >
        {{ moreLabel("tasks", moreTasks) }}
      </el-tag>
      <el-tag
        v-for="task in repoType === 'dataset' ? restTasks : []"
        :key="task"
        type="success"
        size="small"
      >
        <div class="i-carbon-checkbox-checked inline-block mr-1" />
        {{ task }}
      </el-tag>
    </div>

    <!-- Outside the scrolling box, so it is in sight whenever something is open -->
    <div v-if="anyOpen" class="mt-2 text-right text-xs">
      <button
        type="button"
        class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer bg-transparent border-0"
        @click="emit('navigate-to-metadata')"
      >
        All metadata →
      </button>
    </div>
  </div>
</template>

<style scoped>
.metadata-header {
  border: 1px solid var(--el-border-color-lighter);
}
.metadata-header-open {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
