<template>
  <section class="md-picker" data-testid="markdown-style-picker">
    <p class="md-picker-intro">
      How README files and other Markdown look to you. The choice is saved with
      your account, so it follows you to every browser.
    </p>
    <div class="md-picker-options" role="radiogroup" aria-label="README style">
      <label
        class="md-option"
        :class="{ active: store.userChoice === null }"
        data-testid="style-option-default"
      >
        <input
          type="radio"
          class="sr-only"
          name="markdown-style"
          :checked="store.userChoice === null"
          @change="choose(null)"
        />
        <span class="md-option-name">Follow the site default</span>
        <span class="md-option-summary"
          >Currently {{ siteDefaultName }}. It changes when the site's default
          does.</span
        >
      </label>
      <label
        v-for="style in MARKDOWN_STYLES"
        :key="style.id"
        class="md-option"
        :class="{ active: store.userChoice === style.id }"
        :data-testid="`style-option-${style.id}`"
      >
        <input
          type="radio"
          class="sr-only"
          name="markdown-style"
          :value="style.id"
          :checked="store.userChoice === style.id"
          @change="choose(style.id)"
        />
        <span class="md-option-name">
          {{ style.name }}
          <el-tag v-if="style.id === store.siteDefault" size="small"
            >Site default</el-tag
          >
        </span>
        <span class="md-option-summary">{{ style.summary }}</span>
        <div
          class="md-option-preview"
          :class="[markdownStyleClasses(style.id), { 'mdx-loading': !ready }]"
          aria-hidden="true"
          v-html="sampleHtml"
        />
      </label>
    </div>
  </section>
</template>

<script setup>
import { ElMessage } from "element-plus";
import "katex/dist/katex.min.css";
import "@/markdown-styles/base.css";
import { notifyError } from "@/errors";
import {
  loadMarkdownStyle,
  MARKDOWN_STYLES,
  markdownStyleClasses,
} from "@/markdown-styles/registry";
import { useMarkdownStyleStore } from "@/stores/markdownStyle";
import { renderMarkdown } from "@/utils/markdown";

const SAMPLE = `## A model card

Fine-tuned from \`base\`, see the [paper](https://example.com).

> [!NOTE]
> Weights are released under Apache-2.0.

\`\`\`python
model = load("example")
\`\`\`

| Split | Images |
|---|---:|
| train | 1.2M |
`;

const store = useMarkdownStyleStore();
const sampleHtml = renderMarkdown(SAMPLE);
const ready = ref(false);
const siteDefaultName = computed(
  () =>
    MARKDOWN_STYLES.find((style) => style.id === store.siteDefault)?.name ??
    store.siteDefault,
);

// Every style is scoped to its own class, so all of them can be on the page at once
onMounted(async () => {
  await Promise.allSettled(
    MARKDOWN_STYLES.map((style) => loadMarkdownStyle(style.id)),
  );
  ready.value = true;
});

async function choose(id) {
  try {
    await store.choose(id);
    ElMessage.success("README style saved");
  } catch (error) {
    notifyError(error, { fallback: "Failed to save README style" });
  }
}
</script>

<style scoped>
.md-picker-intro {
  margin-bottom: 16px;
  color: var(--site-card-text, inherit);
  opacity: 0.8;
}
.md-picker-options {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
.md-option {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--site-border, #d9d9d2);
  border-radius: 10px;
  background: var(--site-card, transparent);
  cursor: pointer;
}
.md-option:focus-within {
  outline: 2px solid var(--site-primary, #94621f);
  outline-offset: 2px;
}
.md-option.active {
  border-color: var(--site-primary, #94621f);
  box-shadow: 0 0 0 1px var(--site-primary, #94621f);
}
.md-option-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.md-option-summary {
  font-size: 13px;
  opacity: 0.75;
}
.md-option-preview {
  position: relative;
  max-height: 230px;
  overflow: hidden;
  margin-top: 6px;
  padding: 10px 10px 10px 2.2em !important;
  border: 1px solid var(--site-border, #d9d9d2);
  border-radius: 8px;
  font-size: 13px !important;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(#000 75%, transparent);
  mask-image: linear-gradient(#000 75%, transparent);
}
</style>
