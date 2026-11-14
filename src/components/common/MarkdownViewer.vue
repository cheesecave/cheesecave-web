<!-- src/kohaku-hub-ui/src/components/common/MarkdownViewer.vue -->
<template>
  <div
    ref="markdownContainer"
    class="markdown-body markdown-container"
    :class="[styleClasses, { 'mdx-loading': !styleReady }]"
    v-html="renderedHTML"
    @click="onClick"
  />
</template>

<script setup>
import { HEADING_ID_PREFIX, renderMarkdown } from "@/utils/markdown";
import { useThemeStore } from "@/stores/theme";
import mermaid from "mermaid";
import Panzoom from "panzoom";
import "katex/dist/katex.min.css";
import "@/markdown-styles/base.css";
import {
  loadMarkdownStyle,
  markdownStyleClasses,
} from "@/markdown-styles/registry";
import { useMarkdownStyleStore } from "@/stores/markdownStyle";

const themeStore = useThemeStore();
const styleStore = useMarkdownStyleStore();

/**
 * @typedef {Object} Props
 * @property {string} content - Markdown content to render
 * @property {boolean} stripFrontmatter - Strip YAML frontmatter (default: true for repo cards)
 * @property {string} repoType - Repository type (model/dataset/space) for image path resolution
 * @property {string} namespace - Repository namespace for image path resolution
 * @property {string} name - Repository name for image path resolution
 * @property {string} branch - Repository branch for image path resolution (default: 'main')
 */
const props = defineProps({
  content: {
    type: String,
    default: "",
  },
  stripFrontmatter: {
    type: Boolean,
    default: true,
  },
  repoType: {
    type: String,
    default: "",
  },
  namespace: {
    type: String,
    default: "",
  },
  name: {
    type: String,
    default: "",
  },
  branch: {
    type: String,
    default: "main",
  },
  controlledSource: { type: Object, default: null },
  filePath: { type: String, default: "README.md" },
  // Levels to move the headings down, for a page that has its own <h1>
  headingOffset: {
    type: Number,
    default: 0,
  },
});

const markdownContainer = ref(null);

const renderedHTML = computed(() => {
  return renderMarkdown(props.content, {
    stripFrontmatter: props.stripFrontmatter,
    headingOffset: props.headingOffset,
    controlledResources: props.controlledSource
      ? { filePath: props.filePath }
      : null,
    repoContext:
      props.repoType && props.namespace && props.name
        ? {
            repoType: props.repoType,
            namespace: props.namespace,
            name: props.name,
            branch: props.branch,
          }
        : null,
  });
});

// The style in force (the reader's own, else the site's): its stylesheet is loaded on demand, and the content
// stays hidden until it is, so it never shows unstyled
const styleClasses = computed(() => markdownStyleClasses(styleStore.resolved));
const styleReady = ref(false);
watch(
  () => styleStore.resolved,
  async (id) => {
    styleReady.value = false;
    try {
      await loadMarkdownStyle(id);
    } catch (error) {
      console.error("Markdown style failed to load:", error);
    }
    if (id === styleStore.resolved) styleReady.value = true;
  },
  { immediate: true },
);

// A fenced code block arrives with its language label; the copy button is added here, after sanitizing, since
// the sanitizer refuses <button> and inline handlers
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/></svg>';
function addCopyButtons() {
  if (!markdownContainer.value) return;
  for (const bar of markdownContainer.value.querySelectorAll(
    ".code-block .code-bar",
  )) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = COPY_ICON;
    bar.appendChild(button);
  }
}
async function onClick(event) {
  const link = event.target.closest?.("a[data-guest-path]");
  if (
    props.controlledSource?.openFile &&
    link &&
    !event.button &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    props.controlledSource.openFile(link.dataset.guestPath);
    return;
  }
  const button = event.target.closest?.(".copy-code");
  if (!button) return;
  const code = button.closest(".code-block")?.querySelector("pre code");
  try {
    await navigator.clipboard.writeText(code?.textContent ?? "");
    button.classList.add("copied");
    button.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      button.classList.remove("copied");
      button.setAttribute("aria-label", "Copy code");
    }, 1500);
  } catch {
    /* Clipboard access can be refused; nothing to undo. */
  }
}
watch(renderedHTML, () => nextTick(addCopyButtons), { immediate: true });

// The parser emits inert image placeholders. Only these vetted server-produced
// raster thumbnails acquire a src, and an old repository/content cannot finish
// loading images into a newly rendered document.
let thumbnailGeneration = 0;
function previewDenied(error) {
  const status = error?.response?.status ?? error?.status;
  const headers = error?.response?.headers;
  const code =
    headers?.get?.("x-error-code") ||
    headers?.["x-error-code"] ||
    headers?.["X-Error-Code"];
  return (
    [401, 403].includes(status) || (status === 404 && code === "RepoNotFound")
  );
}
watch(
  [
    renderedHTML,
    () => props.controlledSource,
    () => props.repoType,
    () => props.namespace,
    () => props.name,
    () => props.branch,
    () => props.filePath,
  ],
  async () => {
    const owner = ++thumbnailGeneration;
    const source = props.controlledSource;
    for (const placeholder of markdownContainer.value?.querySelectorAll(
      "[data-guest-image]",
    ) || []) {
      placeholder.textContent = placeholder.dataset.imageAlt || "";
    }
    if (!source) return;
    await nextTick();
    if (owner !== thumbnailGeneration || !markdownContainer.value) return;
    const placeholders = [
      ...markdownContainer.value.querySelectorAll("[data-guest-image]"),
    ];
    const paths = [
      ...new Set(placeholders.map((el) => el.dataset.guestImage)),
    ].slice(0, 16);
    async function worker() {
      while (paths.length && owner === thumbnailGeneration) {
        const path = paths.shift();
        try {
          const response = await source.loadThumbnail?.(path);
          if (owner !== thumbnailGeneration) return;
          const data = response?.data || response;
          if (
            data?.kind !== "image" ||
            typeof data.data_url !== "string" ||
            data.data_url.length > 2 * 1024 * 1024 ||
            !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
              data.data_url,
            )
          )
            continue;
          for (const placeholder of placeholders.filter(
            (el) => el.dataset.guestImage === path,
          )) {
            if (!markdownContainer.value?.contains(placeholder)) continue;
            const image = document.createElement("img");
            image.src = data.data_url;
            image.alt = placeholder.dataset.imageAlt || "";
            image.loading = "lazy";
            placeholder.replaceChildren(image);
          }
        } catch (error) {
          if (owner !== thumbnailGeneration) return;
          if (previewDenied(error)) {
            thumbnailGeneration++;
            for (const image of markdownContainer.value?.querySelectorAll(
              "[data-guest-image] img",
            ) || [])
              image.remove();
            source.onAccessDenied?.(error);
            return;
          }
        }
      }
    }
    const workers = Math.min(3, paths.length);
    for (let index = 0; index < workers; index++) worker();
  },
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => thumbnailGeneration++);

// `#images` should reach the heading whose id is `user-content-images`
function scrollToHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id || !markdownContainer.value) return;
  const byId = new Map(
    [...markdownContainer.value.querySelectorAll("[id]")].map((el) => [
      el.id,
      el,
    ]),
  );
  (byId.get(id) ?? byId.get(HEADING_ID_PREFIX + id))?.scrollIntoView();
}
onMounted(() => {
  window.addEventListener("hashchange", scrollToHash);
  nextTick(scrollToHash);
});
onBeforeUnmount(() => window.removeEventListener("hashchange", scrollToHash));

// Get theme from store (reactive)
const isDark = computed(() => themeStore.isDark);

// Use Mermaid's built-in themes - they're designed properly
const getMermaidConfig = (dark) => ({
  startOnLoad: false,
  securityLevel: "loose",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  theme: dark ? "dark" : "default",
  logLevel: "fatal", // Only log fatal errors, suppress warnings
});

// Initialize Mermaid
if (!props.controlledSource) mermaid.initialize(getMermaidConfig(isDark.value));

// Render mermaid diagrams after content updates
async function renderMermaidDiagrams() {
  if (props.controlledSource) return;
  await nextTick();
  if (props.controlledSource) return;

  if (!markdownContainer.value) return;

  // Re-initialize with current theme before rendering
  if (!props.controlledSource)
    mermaid.initialize(getMermaidConfig(isDark.value));

  // Check if this is initial render or theme change
  const mermaidBlocks = markdownContainer.value.querySelectorAll(
    "pre code.language-mermaid",
  );
  const existingWrappers =
    markdownContainer.value.querySelectorAll(".mermaid-wrapper");

  if (mermaidBlocks.length > 0) {
    // Initial render: convert code blocks to wrappers
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      const code = block.textContent;
      const pre = block.parentElement;

      try {
        // Create wrapper for diagram + controls
        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-wrapper";
        wrapper.setAttribute("data-mermaid-code", code); // Store code for re-rendering

        // Replace immediately
        pre.replaceWith(wrapper);

        // Render diagram into wrapper
        await renderSingleDiagram(wrapper, code, i);
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        const errorDiv = document.createElement("div");
        errorDiv.className = "mermaid-error";
        errorDiv.innerHTML = `
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 text-sm">
            <div class="font-semibold text-red-600 dark:text-red-400 mb-2">Mermaid Rendering Error</div>
            <div class="text-red-700 dark:text-red-300">${err.message}</div>
          </div>
        `;
        pre.parentElement?.insertBefore(errorDiv, pre);
      }
    }
  } else if (existingWrappers.length > 0) {
    // Theme change: re-render existing diagrams
    for (let i = 0; i < existingWrappers.length; i++) {
      const wrapper = existingWrappers[i];
      const code = wrapper.getAttribute("data-mermaid-code");
      if (code) {
        // Remove old diagram and controls
        wrapper
          .querySelectorAll(".mermaid-diagram, .mermaid-controls")
          .forEach((el) => el.remove());
        // Re-render with new theme
        await renderSingleDiagram(wrapper, code, i);
      }
    }
  }
}

// Helper function to render a single diagram
async function renderSingleDiagram(wrapper, code, index) {
  // Create container for mermaid diagram
  const id = `mermaid-${Date.now()}-${index}`;
  const container = document.createElement("div");
  container.className = "mermaid-diagram";
  container.id = id;

  // Render mermaid with current theme
  let svg;
  try {
    const result = await mermaid.render(id, code);
    if (props.controlledSource) return;
    svg = result.svg;
  } catch (err) {
    // Don't show Mermaid's error diagram, show our own error message
    console.error("Mermaid render error:", err);
    container.innerHTML = `
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 text-sm">
        <div class="font-semibold text-red-600 dark:text-red-400 mb-2">Diagram Syntax Error</div>
        <div class="text-red-700 dark:text-red-300 text-xs">This diagram has a syntax error and cannot be rendered.</div>
      </div>
    `;
    wrapper.appendChild(container);
    return; // Exit early
  }

  container.innerHTML = svg;

  // Get SVG element
  const svgElement = container.querySelector("svg");

  if (svgElement) {
    // Remove any inline background from Mermaid
    svgElement.style.backgroundColor = "transparent";
  }

  // Create zoom controls
  const controls = document.createElement("div");
  controls.className = "mermaid-controls";
  controls.innerHTML = `
    <button class="mermaid-zoom-btn mermaid-zoom-in" title="Zoom In">
      <div class="i-carbon-zoom-in"></div>
    </button>
    <button class="mermaid-zoom-btn mermaid-zoom-out" title="Zoom Out">
      <div class="i-carbon-zoom-out"></div>
    </button>
    <button class="mermaid-zoom-btn mermaid-zoom-reset" title="Reset Zoom">
      <div class="i-carbon-zoom-reset"></div>
    </button>
    <button class="mermaid-zoom-btn mermaid-fullscreen" title="Fullscreen">
      <div class="i-carbon-maximize"></div>
    </button>
  `;

  // Initialize panzoom on SVG element
  let panzoomInstance = null;
  if (svgElement) {
    panzoomInstance = Panzoom(svgElement, {
      maxZoom: 3,
      minZoom: 0.3,
      bounds: false,
      boundsPadding: 0.1,
    });

    // Enable mouse wheel zoom on container
    container.addEventListener("wheel", (e) =>
      panzoomInstance.zoomWithWheel(e),
    );
  }

  // Zoom button handlers
  controls.querySelector(".mermaid-zoom-in").addEventListener("click", (e) => {
    e.stopPropagation();
    if (panzoomInstance) panzoomInstance.zoomIn();
  });

  controls.querySelector(".mermaid-zoom-out").addEventListener("click", (e) => {
    e.stopPropagation();
    if (panzoomInstance) panzoomInstance.zoomOut();
  });

  controls
    .querySelector(".mermaid-zoom-reset")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (panzoomInstance) {
        panzoomInstance.moveTo(0, 0);
        panzoomInstance.zoomAbs(0, 0, 1);
      }
    });

  controls
    .querySelector(".mermaid-fullscreen")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (!document.fullscreenElement) {
        wrapper.requestFullscreen?.() || wrapper.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      }
    });

  // Assemble and insert
  wrapper.appendChild(controls);
  wrapper.appendChild(container);
}

// Watch for content changes and re-render mermaid
watch(
  () => [props.content, Boolean(props.controlledSource)],
  async () => {
    await nextTick();
    await renderMermaidDiagrams();
  },
  { flush: "post" },
);

// Watch for theme changes and re-initialize mermaid
watch(isDark, (newValue) => {
  if (props.controlledSource) return;
  mermaid.initialize(getMermaidConfig(newValue));
  // Re-render diagrams when theme changes
  renderMermaidDiagrams();
});

onMounted(() => {
  renderMermaidDiagrams();
});
</script>
