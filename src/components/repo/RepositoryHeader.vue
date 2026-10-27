<script setup>
import { computed } from "vue";
import LinkButton from "@/components/common/LinkButton.vue";
import { externalRepoUrl } from "@/utils/external-repo";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  namespaceLink: { type: String, required: true },
  repoInfo: { type: Object, default: null },
  signedIn: { type: Boolean, default: false },
  isOwner: { type: Boolean, default: false },
  liked: { type: Boolean, default: false },
  likesCount: { type: Number, default: 0 },
  liking: { type: Boolean, default: false },
  tabs: { type: Array, required: true },
  activeTab: { type: String, required: true },
});
defineEmits(["copy", "clone", "download", "like"]);
const repoPath = computed(
  () => `/${props.repoType}s/${props.namespace}/${props.name}`,
);
const sourceUrl = computed(() =>
  props.repoInfo
    ? externalRepoUrl(
        { ...props.repoInfo, id: `${props.namespace}/${props.name}` },
        props.repoType,
      )
    : null,
);
const typeLabel = computed(() =>
  props.repoType === "model" ? "Model" : "Dataset",
);
const tabIcons = {
  card: "i-carbon-document",
  files: "i-carbon-folder",
  commits: "i-carbon-change-catalog",
  metadata: "i-carbon-information",
};
</script>

<template>
  <header class="repo-composite-header" aria-label="Repository header">
    <div class="repository-header-inner">
      <div class="repository-heading-row">
        <div class="repository-identity">
          <span
            :class="
              repoType === 'model'
                ? 'i-carbon-machine-learning-model'
                : 'i-carbon-data-table'
            "
            class="repository-type-icon"
            aria-hidden="true"
          />
          <div class="repository-title-group">
            <h1>
              <RouterLink :to="`/${repoType}s`" class="repository-title-type"
                >{{ typeLabel }}:</RouterLink
              >
              <RouterLink :to="namespaceLink" class="repository-owner">{{
                namespace
              }}</RouterLink>
              <span class="repository-slash" aria-hidden="true">/</span>
              <RouterLink :to="repoPath" class="repository-name">{{
                name
              }}</RouterLink>
            </h1>
            <template v-if="repoInfo">
              <span
                v-if="repoInfo.private"
                class="repository-visibility"
                aria-label="Private repository"
              >
                <span class="i-carbon-locked" aria-hidden="true" /> Private
              </span>
              <button
                v-else-if="signedIn"
                type="button"
                class="repository-like"
                :class="{ 'is-liked': liked }"
                :aria-label="liked ? 'Unlike repository' : 'Like repository'"
                :aria-pressed="liked"
                :disabled="liking"
                @click="$emit('like')"
              >
                <span
                  :class="
                    liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'
                  "
                  aria-hidden="true"
                />
                <span>Like</span
                ><span class="repository-like-count">{{ likesCount }}</span>
              </button>
              <span
                v-else
                class="repository-like"
                aria-label="Repository likes"
              >
                <span class="i-carbon-favorite" aria-hidden="true" />
                <span>{{ likesCount }} likes</span>
              </span>
            </template>
            <button
              type="button"
              class="repository-copy"
              title="Copy repository ID"
              aria-label="Copy repository ID"
              @click="$emit('copy')"
            >
              <span class="i-carbon-copy" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          v-if="repoInfo"
          class="repository-actions"
          aria-label="Repository actions"
        >
          <el-button @click="$emit('download')">
            <span class="i-carbon-document-download" aria-hidden="true" />
            Download
          </el-button>
          <LinkButton v-if="isOwner" :to="`${repoPath}/settings`">
            <span class="i-carbon-settings" aria-hidden="true" /> Settings
          </LinkButton>
          <el-button type="primary" @click="$emit('clone')">
            <span class="i-carbon-code" aria-hidden="true" /> Clone
          </el-button>
        </div>
      </div>
      <div
        v-if="repoInfo?._source && repoInfo._source !== 'local'"
        class="repository-summary"
      >
        <a
          v-if="repoInfo._source_url"
          :href="sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="repository-source"
          >View on {{ repoInfo._source }}
          <span class="i-carbon-launch" aria-hidden="true"
        /></a>
        <span v-else class="repository-source">{{ repoInfo._source }}</span>
      </div>
      <div class="repository-metadata">
        <slot name="metadata" />
      </div>
      <nav
        class="repo-tabs repository-navigation"
        aria-label="Repository sections"
      >
        <template v-for="item in tabs" :key="item.key">
          <span
            v-if="item.disabledReason"
            class="repository-tab"
            aria-disabled="true"
            :title="item.disabledReason"
          >
            <span :class="tabIcons[item.key]" aria-hidden="true" />{{
              item.label
            }}
          </span>
          <RouterLink
            v-else
            :to="item.to"
            class="repository-tab"
            :aria-current="activeTab === item.key ? 'page' : undefined"
            ><span :class="tabIcons[item.key]" aria-hidden="true" />{{
              item.label
            }}</RouterLink
          >
        </template>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.repo-composite-header {
  --repository-tag-height: 24px;
  background: var(--site-card);
  color: var(--site-card-text);
  border-bottom: 1px solid var(--site-border);
}
.repository-header-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: none;
  margin: 0 auto;
  padding: 24px 24px 0;
}
.repository-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}
.repository-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.repository-title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}
.repository-type-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  font-size: 28px;
  color: var(--site-muted);
}
h1 {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.repository-owner {
  color: var(--site-link);
  font-weight: 400;
}
.repository-title-type {
  color: var(--site-muted);
  font-weight: 400;
  white-space: nowrap;
}
.repository-name {
  color: var(--site-card-text);
}
.repository-slash {
  color: var(--site-muted);
  font-weight: 400;
}
h1 a:hover,
.repository-source:hover {
  text-decoration: underline;
}
.repository-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--site-muted);
  cursor: pointer;
}
.repository-copy:hover {
  background: var(--site-hover);
  color: var(--site-link);
}
.repository-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.repository-actions :deep(.el-button),
.repository-like,
.repository-visibility {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 34px;
  margin: 0;
  padding: 7px 12px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
}
.repository-actions :deep(.el-button > span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.repository-actions :deep(.el-button:not(.el-button--primary)),
.repository-like,
.repository-visibility {
  background: var(--site-card);
  color: var(--site-card-text);
}
button.repository-like {
  cursor: pointer;
}
button.repository-like:hover {
  background: var(--site-hover);
}
.repository-like.is-liked {
  color: var(--el-color-danger);
}
.repository-like:disabled {
  cursor: wait;
  opacity: 0.6;
}
.repository-like-count {
  padding-left: 8px;
  border-left: 1px solid var(--site-border);
  font-variant-numeric: tabular-nums;
}
.repository-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin: 0;
  color: var(--site-muted);
  font-size: 13px;
}
.repository-source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.repository-visibility {
  color: var(--site-muted);
}
.repository-metadata {
  min-height: var(--repository-tag-height);
}
.repository-header-inner :deep(.metadata-header) {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  margin: 0;
}
.repository-navigation {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}
.repository-tab {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 2px solid transparent;
  color: var(--site-muted);
  font-size: 14px;
  font-weight: 500;
}
.repository-tab:hover {
  color: var(--site-link);
  background: var(--site-hover);
}
.repository-tab[aria-current="page"] {
  color: var(--site-card-text);
  border-bottom-color: var(--site-primary);
}
.repository-tab[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.5;
}
a:focus-visible,
button:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
@media (max-width: 767px) {
  .repository-header-inner {
    padding: 20px 16px 0;
  }
  h1 {
    font-size: 20px;
  }
  .repository-identity {
    align-items: flex-start;
    gap: 8px;
  }
  .repository-type-icon {
    width: 24px;
    height: 24px;
    margin-top: 2px;
    font-size: 24px;
  }
  .repository-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 6px;
  }
  .repository-actions > * {
    justify-content: center;
  }
  .repository-actions :deep(.el-button),
  .repository-like,
  .repository-visibility {
    min-height: 40px;
  }
  .repository-actions > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  .repository-tab {
    padding: 12px 10px;
  }
}
</style>
