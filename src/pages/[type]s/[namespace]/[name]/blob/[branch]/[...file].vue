<!-- src/kohaku-hub-ui/src/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue -->
<template>
  <div
    ref="fileWorkbench"
    :class="
      embedded
        ? ['repository-file-workbench', { 'is-sidebar-closed': !sidebarOpen }]
        : 'container-main'
    "
    :style="
      embedded ? { '--file-sidebar-height': `${sidebarHeight}px` } : undefined
    "
  >
    <aside
      v-if="embedded && sidebarOpen"
      class="file-detail-sidebar"
      aria-label="Repository files"
    >
      <RepositoryFileTree
        :repo-type="repoType"
        :namespace="namespace"
        :name="name"
        :branch="branch"
        :current-path="filePath"
        @collapse="sidebarOpen = false"
      />
    </aside>
    <div :class="{ 'file-detail-main': embedded }">
      <!-- Breadcrumb -->
      <el-breadcrumb
        v-if="!embedded"
        separator="/"
        class="mb-6 text-gray-700 dark:text-gray-300"
      >
        <el-breadcrumb-item>
          <RouterLink
            to="/"
            class="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Home
          </RouterLink>
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <RouterLink
            :to="`/${repoType}s`"
            class="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {{ repoTypeLabel }}
          </RouterLink>
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <RouterLink
            :to="`/${namespace}`"
            class="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {{ namespace }}
          </RouterLink>
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <RouterLink
            :to="`/${repoType}s/${namespace}/${name}`"
            class="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {{ name }}
          </RouterLink>
        </el-breadcrumb-item>
        <el-breadcrumb-item>{{ fileName }}</el-breadcrumb-item>
      </el-breadcrumb>

      <div
        v-if="embedded"
        class="file-detail-pathbar"
        :class="{ 'is-pinned': isPinned }"
      >
        <button
          v-if="!sidebarOpen"
          type="button"
          class="file-action file-action-icon"
          aria-label="Show file tree"
          title="Show file tree"
          @click="sidebarOpen = true"
        >
          <span class="i-carbon-side-panel-open" aria-hidden="true" />
        </button>
        <nav class="file-detail-breadcrumb" aria-label="File path">
          <RouterLink :to="repositoryTreePath">{{ name }}</RouterLink>
          <template v-for="(segment, idx) in pathSegments" :key="idx">
            <span class="file-path-separator" aria-hidden="true">/</span>
            <RouterLink
              v-if="idx < pathSegments.length - 1"
              :to="getFolderPath(pathSegments.slice(0, idx + 1).join('/'))"
              >{{ segment }}</RouterLink
            >
            <h2 v-else>{{ segment }}</h2>
          </template>
        </nav>
        <button
          type="button"
          class="file-action file-action-icon"
          aria-label="Copy path"
          title="Copy path"
          @click="copyFilePath"
        >
          <span class="i-carbon-copy" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="file-action file-top-button"
          @click="scrollToTop"
        >
          <span class="i-carbon-arrow-up" aria-hidden="true" /> Top
        </button>
      </div>

      <RepositoryFileMetadata
        v-if="embedded && fileFrontmatter?.source.trim()"
        class="file-detail-metadata"
        :source="fileFrontmatter.source"
      />

      <RepositoryFileCommit
        v-if="embedded"
        class="file-detail-commit"
        :repo-type="repoType"
        :namespace="namespace"
        :name="name"
        :branch="branch"
        :path="filePath"
      />

      <div
        v-if="embedded"
        class="file-detail-toolbar"
        role="toolbar"
        aria-label="File actions"
      >
        <div class="file-detail-view-controls">
          <div
            v-if="isMarkdown"
            class="file-detail-modes"
            role="tablist"
            aria-label="File view"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="markdownView === 'preview'"
              @click="markdownView = 'preview'"
            >
              Preview
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="markdownView === 'source'"
              @click="markdownView = 'source'"
            >
              Code
            </button>
          </div>
          <span v-else class="file-detail-mode">{{
            canPreviewText ? "Code" : "Preview"
          }}</span>
          <span v-if="!loading && !loadError" class="file-detail-stats">
            <template v-if="canPreviewText || isMarkdown"
              >{{ lineCount }} lines · </template
            >{{ formatSize(fileSize) }}
          </span>
        </div>
        <div class="file-detail-actions">
          <button
            v-if="
              isMarkdown && mdwOption === 'toggle' && markdownView === 'preview'
            "
            type="button"
            class="file-action mdw-toggle"
            :aria-pressed="mdwWide"
            @click="mdwWide = !mdwWide"
          >
            {{ mdwWide ? "Narrow" : "Wide" }}
          </button>
          <a
            :href="fileUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="file-action"
            >Raw</a
          >
          <button
            type="button"
            class="file-action file-action-icon"
            aria-label="Copy URL"
            title="Copy URL"
            @click="copyFileUrl"
          >
            <span class="i-carbon-link" aria-hidden="true" />
          </button>
          <button
            v-if="!loading && !loadError && (canPreviewText || isMarkdown)"
            type="button"
            class="file-action file-action-icon"
            aria-label="Copy file content"
            title="Copy file content"
            @click="copyContent"
          >
            <span class="i-carbon-copy" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="file-action file-action-icon"
            aria-label="Download"
            title="Download"
            @click="downloadFile"
          >
            <span class="i-carbon-download" aria-hidden="true" />
          </button>
          <RouterLink
            v-if="canEdit && !loading && !loadError"
            :to="editPath"
            class="file-action"
            aria-label="Edit"
            ><span class="i-carbon-edit" aria-hidden="true" /> Edit</RouterLink
          >
          <button
            v-if="canDelete && !loading && !loadError"
            type="button"
            class="file-action file-action-icon file-delete-action"
            aria-label="Delete file"
            title="Delete file"
            :disabled="deleting"
            @click="confirmDeleteFile"
          >
            <span class="i-carbon-trash-can" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-if="loading && !isSafetensors" class="text-center py-20">
        <el-icon class="is-loading" :size="40">
          <div class="i-carbon-circle-dash" />
        </el-icon>
      </div>

      <ErrorState
        v-else-if="loadError"
        :error="loadError"
        :context="errorContext('file')"
        mode="full-page"
        :retry="loadFile"
      />

      <div v-else :class="{ 'file-detail-body': embedded }">
        <!-- File Header -->
        <div v-if="!embedded" class="card mb-6">
          <div
            class="flex flex-col sm:flex-row items-start justify-between gap-4"
          >
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <div
                :class="getFileIcon(fileName)"
                class="text-2xl sm:text-3xl flex-shrink-0"
              />
              <div class="min-w-0 flex-1">
                <component
                  :is="embedded ? 'h2' : 'h1'"
                  class="text-lg sm:text-xl md:text-2xl font-bold break-words"
                >
                  {{ fileName }}
                </component>
                <div
                  class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1"
                >
                  {{ formatSize(fileSize) }}
                  <span v-if="fileSize !== null" class="mx-2">•</span>
                  <span>{{ fileExtension || "No extension" }}</span>
                </div>
              </div>
            </div>

            <div
              class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto"
            >
              <LinkButton
                v-if="canEdit"
                :to="editPath"
                size="small"
                class="flex-1 sm:flex-initial"
              >
                <div class="i-carbon-edit inline-block mr-1" />
                <span class="hidden sm:inline">Edit</span>
                <span class="sm:hidden">Edit</span>
              </LinkButton>
              <el-button
                @click="copyFileUrl"
                size="small"
                class="flex-1 sm:flex-initial"
              >
                <div class="i-carbon-link inline-block mr-1" />
                <span class="hidden sm:inline">Copy URL</span>
                <span class="sm:hidden">Copy</span>
              </el-button>
              <el-button
                type="primary"
                @click="downloadFile"
                size="small"
                class="flex-1 sm:flex-initial"
              >
                <div class="i-carbon-download inline-block mr-1" />
                Download
              </el-button>
              <el-button
                v-if="canDelete"
                @click="confirmDeleteFile"
                type="danger"
                size="small"
                class="flex-1 sm:flex-initial"
                :loading="deleting"
              >
                <div class="i-carbon-trash-can inline-block mr-1" />
                Delete
              </el-button>
            </div>
          </div>

          <!-- File path breadcrumb -->
          <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 text-sm">
              <el-tag size="small">{{ branch }}</el-tag>
              <span class="text-gray-400 dark:text-gray-500">/</span>
              <el-breadcrumb
                separator="/"
                class="text-gray-700 dark:text-gray-300"
              >
                <el-breadcrumb-item
                  v-for="(segment, idx) in pathSegments"
                  :key="idx"
                >
                  <RouterLink
                    v-if="idx < pathSegments.length - 1"
                    :to="
                      getFolderPath(pathSegments.slice(0, idx + 1).join('/'))
                    "
                    class="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {{ segment }}
                  </RouterLink>
                  <span v-else class="text-gray-700 dark:text-gray-300">{{
                    segment
                  }}</span>
                </el-breadcrumb-item>
              </el-breadcrumb>
            </div>
          </div>
        </div>

        <!-- File Content -->
        <div :class="embedded ? 'file-detail-content' : 'card'">
          <!-- Indexed-tar inline browser. Shown when the file is a
             `.tar` whose parent folder also carries a sibling
             `<basename>.json` (the hfutils.index sidecar). The
             panel renders the same listing UX, hash banner, and
             member preview surface as the file-list icon shortcut
             — only difference is it lives in the page body
             instead of a modal. -->
          <TarBrowserPanel
            v-if="isIndexedTar"
            :tar-url="fileUrl"
            :index-url="indexedTarSidecarUrl"
            :filename="fileName"
            :tar-tree-entry="indexedTarTreeEntry"
          />
          <!-- Zip inline browser: same panel in zip mode. The central
             directory is the index, so no sibling lookup is needed. -->
          <TarBrowserPanel
            v-else-if="isZipArchive"
            :zip="zipTarget"
            :filename="fileName"
          />
          <!-- Parquet: the same metadata view as the file-list icon (rows,
             columns, row groups), range-read from the footer. -->
          <FileMetadataPanel
            v-else-if="isParquet"
            kind="parquet"
            :resolve-url="metadataResolveUrl"
            :filename="fileName"
          />
          <!-- PSD: the flattened image saved in the file, read by Range (the
             head and the composite, not the layers). -->
          <PsdPreview
            v-else-if="isPsd"
            :source="psdSource"
            :filename="fileName"
          >
            <template #error-actions>
              <el-button type="primary" size="large" @click="downloadFile">
                <div class="i-carbon-download inline-block mr-1" />
                Download File
              </el-button>
            </template>
          </PsdPreview>
          <!-- Image Preview -->
          <div v-else-if="isImage" class="text-center">
            <img
              v-if="!imageFailed"
              :src="fileUrl"
              :alt="fileName"
              class="max-w-full h-auto mx-auto"
              style="max-height: 800px"
              @error="imageFailed = true"
            />
            <p v-else class="py-10 text-sm text-gray-600 dark:text-gray-400">
              This browser cannot display this image. Use the download button
              above to open it locally.
            </p>
          </div>

          <!-- Video Preview -->
          <div v-else-if="isVideo" class="text-center">
            <video
              :src="fileUrl"
              controls
              class="max-w-full h-auto mx-auto"
              style="max-height: 600px"
              :aria-label="`Video: ${fileName}`"
            >
              <track kind="captions" :label="`${fileName} captions`" />
              Your browser does not support video playback.
            </video>
          </div>

          <!-- Audio Preview -->
          <div v-else-if="isAudio" class="text-center py-8">
            <div
              class="i-carbon-music text-6xl text-gray-400 mb-4 inline-block"
            />
            <audio :src="fileUrl" controls class="w-full max-w-xl mx-auto" />
          </div>

          <!-- PDF Preview -->
          <div v-else-if="isPDF" class="h-[800px]">
            <iframe
              :src="fileUrl"
              class="w-full h-full border-0"
              title="PDF Preview"
            />
          </div>

          <!-- Text/Code Preview -->
          <div v-else-if="canPreviewText">
            <CodeViewer
              :code="fileContent"
              :language="fileExtension"
              :bare="embedded"
            />
          </div>

          <!-- Markdown Preview -->
          <div v-else-if="isMarkdown">
            <div
              v-if="!embedded"
              class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700"
            >
              <el-radio-group
                v-model="markdownView"
                size="small"
                class="w-full sm:w-auto"
              >
                <el-radio-button label="preview" class="flex-1 sm:flex-initial"
                  >Preview</el-radio-button
                >
                <el-radio-button label="source" class="flex-1 sm:flex-initial"
                  >Source</el-radio-button
                >
              </el-radio-group>
              <div class="flex gap-2 w-full sm:w-auto">
                <LinkButton
                  v-if="canEdit"
                  :to="editPath"
                  size="small"
                  type="primary"
                  class="flex-1 sm:flex-initial"
                >
                  <div class="i-carbon-edit inline-block mr-1" />
                  Edit
                </LinkButton>
                <el-button
                  v-if="markdownView === 'source'"
                  size="small"
                  @click="copyContent"
                  class="flex-1 sm:flex-initial"
                >
                  <div class="i-carbon-copy inline-block mr-1" />
                  Copy
                </el-button>
              </div>
            </div>

            <div
              v-if="markdownView === 'preview'"
              :class="{ 'file-markdown-preview': embedded }"
              :data-mdw="mdwEffective"
            >
              <MarkdownViewer
                :content="markdownPreviewContent"
                :strip-frontmatter="!embedded"
                :heading-offset="1"
                :repo-type="repoType"
                :namespace="namespace"
                :name="name"
                :branch="branch"
              />
            </div>
            <div
              v-if="isMarkdown"
              class="mdw-pill"
              role="group"
              aria-label="Width prototype"
            >
              <button
                v-for="o in MDW_OPTIONS"
                :key="o"
                type="button"
                :aria-pressed="mdwOption === o"
                @click="setMdwOption(o)"
              >
                {{ o }}
              </button>
            </div>
            <CodeViewer
              v-else-if="embedded"
              :code="fileContent"
              language="markdown"
              bare
            />
            <pre
              v-else
              class="text-sm overflow-x-auto bg-gray-50 dark:bg-gray-900 p-4 rounded"
            ><code>{{ fileContent }}</code></pre>
          </div>

          <!-- Too Large / Binary -->
          <div v-else class="text-center py-16">
            <div
              :class="getFileIcon(fileName)"
              class="text-8xl text-gray-300 dark:text-gray-600 mb-4 inline-block"
            />
            <h3 class="text-xl font-semibold mb-2">{{ tooLargeMessage }}</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              {{
                fileSize > maxPreviewSize
                  ? `File is ${formatSize(fileSize)}, too large to preview`
                  : "This file type cannot be previewed"
              }}
            </p>
            <el-button type="primary" size="large" @click="downloadFile">
              <div class="i-carbon-download inline-block mr-1" />
              Download File
            </el-button>
          </div>
        </div>
        <!-- Keep the binary preview notice above its readable header details.
           The tensor tree grows with the page, independently of the size lookup. -->
        <div v-if="isSafetensors" class="file-metadata-preview">
          <FileMetadataPanel
            kind="safetensors"
            :resolve-url="metadataResolveUrl"
            :filename="fileName"
            :page-mode="embedded"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { notifyError } from "@/errors";
import MarkdownViewer from "@/components/common/MarkdownViewer.vue";
import CodeViewer from "@/components/common/CodeViewer.vue";
import RepositoryFileTree from "@/components/repo/RepositoryFileTree.vue";
import RepositoryFileCommit from "@/components/repo/RepositoryFileCommit.vue";
import RepositoryFileMetadata from "@/components/repo/RepositoryFileMetadata.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import LinkButton from "@/components/common/LinkButton.vue";
import TarBrowserPanel from "@/components/repo/preview/TarBrowserPanel.vue";
import FileMetadataPanel from "@/components/repo/preview/FileMetadataPanel.vue";
import PsdPreview from "@/components/repo/preview/PsdPreview.vue";
import { createHttpRangeSource, isPsdPath } from "@/utils/psd-preview";
import { hasIndexSibling, tarSidecarPath } from "@/utils/indexed-tar";
import {
  buildResolveUrl,
  getPreviewKind,
  isZipArchivePath,
} from "@/utils/file-preview";
import { mediaKind } from "@/utils/media-types";
import { copyToClipboard } from "@/utils/clipboard";
import {
  buildRepositoryPath,
  normalizeCatchAllParam,
} from "@/utils/repo-paths";
import {
  KIND,
  decodeError,
  downloadMessage,
  hubFetch,
  probeUrl,
} from "@/errors";
import { useErrorContext } from "@/composables/useErrorContext";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAuthStore } from "@/stores/auth";
import { repoAPI } from "@/utils/api";
import { extractYAMLFrontmatter } from "@/utils/yaml-parser";

const props = defineProps({ embedded: { type: Boolean, default: false } });

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Route params
const repoType = computed(() => {
  // Check the first path segment only — `path.includes("/models/")`
  // used to also match against in-repo paths like
  // `archives/models/bundle.tar`, which made a dataset .tar render
  // under `/api/models/...` and 404-out (the indexed-tar inline
  // panel got stuck on the binary fallback as a result).
  const seg = (route.path || "").split("/")[1];
  if (seg === "models") return "model";
  if (seg === "datasets") return "dataset";
  if (seg === "spaces") return "space";
  return "model";
});
const namespace = computed(() => route.params.namespace);
const name = computed(() => route.params.name);
const branch = computed(() => route.params.branch || "main");
const filePath = computed(() => normalizeCatchAllParam(route.params.file));

// Constants
const maxPreviewSize = 100 * 1000; // 100KB

// State
const loading = ref(true);
// Why the file did not load (an AppError, see src/errors): a gated upstream,
// a missing file and an unreachable server each read differently.
const loadError = ref(null);
const errorContext = useErrorContext();
const fileContent = ref("");
const fileSize = ref(null); // null until known; 0 is a real empty file
const fileHeaders = ref({});
const markdownView = ref("preview");

// Prototype (?mdw=): Markdown preview width options, default = today.
const MDW_OPTIONS = ["today", "wide", "fill", "toggle", "bleed"];
const mdwOption = ref("today");
try {
  const q = new URLSearchParams(window.location.search).get("mdw");
  if (q && MDW_OPTIONS.includes(q)) sessionStorage.setItem("mdw", q);
  const saved = sessionStorage.getItem("mdw");
  if (saved && MDW_OPTIONS.includes(saved)) mdwOption.value = saved;
} catch {
  /* sessionStorage unavailable */
}
const mdwWide = ref(false);
const mdwEffective = computed(() =>
  mdwOption.value === "toggle"
    ? mdwWide.value
      ? "fill"
      : "today"
    : mdwOption.value,
);
function setMdwOption(v) {
  try {
    sessionStorage.setItem("mdw", v);
  } catch {
    /* ignore */
  }
  mdwOption.value = v;
}
const fileWorkbench = ref(null);
const sidebarOpen = ref(true);
const sidebarHeight = ref(window.innerHeight);
const isPinned = ref(false);
let scrollViewport;
let viewportObserver;
let scrollFrame = null;
let narrowViewport = false;
const deleting = ref(false);
// Indexed-tar inline view: when the current file is a `.tar` whose
// parent folder also contains a sibling `<basename>.json` (the
// hfutils.index sidecar), the page renders <TarBrowserPanel>
// directly in the body — same listing UX as the file-list icon
// shortcut. The metadata for the tar entry itself is kept around
// so the panel's hash banner can compare its sha256 against the
// sidecar.
const indexedTarTreeEntry = ref(null);
const isIndexedTar = ref(false);
const isZipArchive = computed(() => isZipArchivePath(filePath.value));
const isParquet = computed(() => getPreviewKind(filePath.value) === "parquet");
const isSafetensors = computed(
  () => getPreviewKind(filePath.value) === "safetensors",
);
const isPsd = computed(() => isPsdPath(filePath.value));
// One source per file: it remembers the size and the header it has read
const psdSource = computed(() => createHttpRangeSource(fileUrl.value));
// Absolute, like the file-list preview: metadata readers range-read this URL.
const metadataResolveUrl = computed(() =>
  buildResolveUrl({
    baseUrl: window.location.origin,
    repoType: repoType.value,
    namespace: namespace.value,
    name: name.value,
    branch: branch.value,
    path: filePath.value,
  }),
);
const zipTarget = computed(() => ({
  repoType: repoType.value,
  namespace: namespace.value,
  name: name.value,
  branch: branch.value,
  path: filePath.value,
}));

// Computed
const repoTypeLabel = computed(() => {
  const labels = { model: "Models", dataset: "Datasets", space: "Spaces" };
  return labels[repoType.value] || "Models";
});

const fileName = computed(() => {
  const parts = filePath.value.split("/");
  return parts[parts.length - 1] || "unknown";
});

const fileExtension = computed(() => {
  const match = fileName.value.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
});

const pathSegments = computed(() => {
  return filePath.value ? filePath.value.split("/").filter(Boolean) : [];
});

const repositoryTreePath = computed(
  () =>
    `${buildRepositoryPath(repoType.value, `${namespace.value}/${name.value}`)}/tree/${encodeURIComponent(branch.value)}`,
);

const fileUrl = computed(() => {
  return `/${repoType.value}s/${namespace.value}/${name.value}/resolve/${branch.value}/${filePath.value}`;
});

const indexedTarSidecarUrl = computed(() => {
  if (!isIndexedTar.value) return "";
  const dot = filePath.value.lastIndexOf(".");
  if (dot < 0) return "";
  const base = filePath.value.slice(0, dot);
  return `/${repoType.value}s/${namespace.value}/${name.value}/resolve/${branch.value}/${base}.json`;
});

const languageLabel = computed(() => {
  const langMap = {
    js: "JavaScript",
    ts: "TypeScript",
    py: "Python",
    java: "Java",
    cpp: "C++",
    c: "C",
    cs: "C#",
    go: "Go",
    rs: "Rust",
    rb: "Ruby",
    php: "PHP",
    swift: "Swift",
    kt: "Kotlin",
    scala: "Scala",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    json: "JSON",
    xml: "XML",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    ini: "INI",
    sh: "Shell",
    bash: "Bash",
    sql: "SQL",
    r: "R",
    m: "MATLAB",
    jl: "Julia",
  };
  return langMap[fileExtension.value] || fileExtension.value.toUpperCase();
});

const lineCount = computed(() => {
  return fileContent.value ? fileContent.value.split("\n").length : 0;
});

const isImage = computed(() => mediaKind(fileName.value) === "image");
const isVideo = computed(() => mediaKind(fileName.value) === "video");
const isAudio = computed(() => mediaKind(fileName.value) === "audio");
// Set when the browser cannot decode the image (see utils/media-types)
const imageFailed = ref(false);

const isPDF = computed(() => {
  return fileExtension.value === "pdf";
});

const isMarkdown = computed(() => {
  return ["md", "markdown"].includes(fileExtension.value);
});

const fileFrontmatter = computed(() =>
  isMarkdown.value && !loading.value && !loadError.value
    ? extractYAMLFrontmatter(fileContent.value)
    : null,
);
const markdownPreviewContent = computed(() =>
  props.embedded && fileFrontmatter.value
    ? fileFrontmatter.value.content
    : fileContent.value,
);

const isTextFile = computed(() => {
  const textExtensions = [
    "txt",
    "log",
    "csv",
    "tsv",
    "js",
    "ts",
    "jsx",
    "tsx",
    "vue",
    "py",
    "java",
    "cpp",
    "c",
    "h",
    "hpp",
    "cs",
    "go",
    "rs",
    "rb",
    "php",
    "swift",
    "kt",
    "scala",
    "m",
    "r",
    "jl",
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less",
    "json",
    "xml",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "sh",
    "bash",
    "zsh",
    "fish",
    "ps1",
    "bat",
    "cmd",
    "sql",
    "graphql",
    "proto",
    "dockerfile",
    "makefile",
    "gitignore",
    "env",
    "editorconfig",
    "eslintrc",
    "prettierrc",
  ];
  return (
    textExtensions.includes(fileExtension.value) ||
    fileName.value.toLowerCase().includes("dockerfile")
  );
});

const canPreviewText = computed(() => {
  return (
    isTextFile.value && fileSize.value <= maxPreviewSize && !isMarkdown.value
  );
});

const tooLargeMessage = computed(() => {
  if (fileSize.value > maxPreviewSize && isTextFile.value) {
    return "File Too Large";
  }
  if (isImage.value || isVideo.value || isAudio.value || isPDF.value) {
    return "Media File";
  }
  return "Binary File";
});

const canEdit = computed(() => {
  // Only allow editing text files that are not too large
  // Check if user can write to this namespace (own repo or org member)
  return (
    authStore.isAuthenticated &&
    authStore.canWriteToNamespace(namespace.value) &&
    (isTextFile.value || isMarkdown.value) &&
    fileSize.value <= maxPreviewSize
  );
});

const canDelete = computed(() => {
  // Allow deleting files if user has write access to the namespace
  return (
    authStore.isAuthenticated && authStore.canWriteToNamespace(namespace.value)
  );
});

// Methods
function getFileIcon(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (isImage.value) return "i-carbon-image text-purple-500";
  if (isVideo.value) return "i-carbon-video text-red-500";
  if (isAudio.value) return "i-carbon-music text-green-500";
  if (isPDF.value) return "i-carbon-document-pdf text-red-600";
  // Markdown shares the generic document fallback — no dedicated
  // icon. The earlier name did not ship in Carbon (UnoCSS skipped
  // it silently), and the user asked for visual parity with plain
  // text files inside the tar listing, so we keep it uniform here
  // too.
  if (["js", "ts", "jsx", "tsx"].includes(ext))
    return "i-carbon-code text-yellow-500";
  if (["py"].includes(ext)) return "i-carbon-code text-blue-600";
  if (["json", "xml", "yaml", "yml"].includes(ext))
    return "i-carbon-data-structured text-orange-500";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
    return "i-carbon-zip text-gray-500";

  return "i-carbon-document text-gray-500";
}

// Size of this file from the backend (paths-info, the same source the zip
// download uses). Returns null when the backend cannot say.
async function fetchFileSize() {
  try {
    const { data } = await repoAPI.getPathsInfo(
      repoType.value,
      namespace.value,
      name.value,
      branch.value,
      [filePath.value],
    );
    const entry = data.find(
      (e) => e.type === "file" && e.path === filePath.value,
    );
    return entry ? entry.size : null;
  } catch {
    return null;
  }
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes === 0) return "0 B";
  if (bytes < 1000) return bytes + " B";
  if (bytes < 1000 * 1000) return (bytes / 1000).toFixed(1) + " KB";
  if (bytes < 1000 * 1000 * 1000)
    return (bytes / (1000 * 1000)).toFixed(1) + " MB";
  return (bytes / (1000 * 1000 * 1000)).toFixed(1) + " GB";
}

// Thin retry-style wrapper the template's ErrorState binds to.
// Kept as a dedicated export so the Retry button's click handler and
// the initial onMounted call share the same name.
async function loadFile() {
  await loadFileInfo();
}

async function loadFileInfo() {
  loading.value = true;
  loadError.value = null;
  imageFailed.value = false;
  isIndexedTar.value = false;
  indexedTarTreeEntry.value = null;

  // Indexed-tar detection runs in parallel with the file body load —
  // if the current file is a `.tar` and the parent folder also
  // contains a `<basename>.json` sibling, we render the inline tar
  // browser instead of the binary fallback. The detection is best
  // effort: a failure here should not break the standard preview
  // path, so all errors are swallowed silently.
  if (fileName.value.toLowerCase().endsWith(".tar")) {
    detectIndexedTar().catch((err) => {
      console.warn("indexed-tar sibling detection failed", err);
    });
  }

  try {
    // Note: Presigned URLs are signed for GET method only
    // HEAD requests will fail with 403/signature mismatch
    // For text/markdown files, we fetch content directly (GET)
    // For media files, size is not critical - browser will handle it

    // Load content if it's previewable text
    if (canPreviewText.value || isMarkdown.value) {
      let retries = 0;
      const maxRetries = 10;

      while (true) {
        try {
          const response = await hubFetch(fileUrl.value);
          fileSize.value = parseInt(
            response.headers.get("content-length") || "0",
          );
          fileHeaders.value = Object.fromEntries(response.headers.entries());
          fileContent.value = await response.text();
          return;
        } catch (err) {
          // A 404 with no error code may just be a commit still being
          // processed: retry a few times before surfacing. One that
          // carries a code (EntryNotFound / RepoNotFound) is already the
          // backend's final answer, so stop waiting.
          const { status, code } = decodeError(err);
          if (status === 404 && !code && retries < maxRetries - 1) {
            console.log(
              `File not ready yet (attempt ${retries + 1}/${maxRetries}), retrying...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
            retries++;
            continue;
          }
          throw err;
        }
      }
    } else {
      // Media and binary files are not downloaded here, so the page has no size
      // of its own. Ask the backend for it; if that fails the size stays unknown.
      fileSize.value = await fetchFileSize();
      fileHeaders.value = {};
    }
  } catch (err) {
    // A refusal, or a transport failure (CORS, network, timeout)
    const decoded = decodeError(err);
    if (decoded.kind !== KIND.CANCELLED) loadError.value = decoded;
    console.error("Failed to load file:", err);
  } finally {
    loading.value = false;
  }
}

async function detectIndexedTar() {
  // Fetch the parent folder listing to look for a sibling .json with
  // the same basename. The tree API already returns the full file
  // record (oid + size + lfs) so we keep the entry around to feed
  // the panel's hash banner — same data source as RepoViewer.
  const parts = filePath.value.split("/").filter(Boolean);
  const parentPath = parts.length > 1 ? "/" + parts.slice(0, -1).join("/") : "";
  const response = await repoAPI.listTree(
    repoType.value,
    namespace.value,
    name.value,
    branch.value,
    parentPath,
    {},
  );
  const entries = response.data || [];
  // Loaded-listing fast path mirrors the RepoViewer behaviour. The
  // listing returns up to TREE_PAGE_SIZE (1000) entries — enough to
  // cover most directories — but a single folder can hold more than
  // that, in which case the sidecar might sit on a later page.
  if (hasIndexSibling(filePath.value, entries)) {
    const tarEntry = entries.find((e) => e.path === filePath.value);
    if (tarEntry) indexedTarTreeEntry.value = tarEntry;
    isIndexedTar.value = true;
    return;
  }
  // Fallback: probe the sidecar directly via HEAD /resolve/. Cheap
  // enough that running it on every blob page open is fine, and
  // unblocks indexed-tar UX once the parent folder grows past the
  // single tree-page cap.
  const sidecar = tarSidecarPath(filePath.value);
  if (!sidecar) return;
  const exists = await repoAPI.fileExists(
    repoType.value,
    namespace.value,
    name.value,
    branch.value,
    sidecar,
  );
  if (!exists) return;
  const tarEntry = entries.find((e) => e.path === filePath.value);
  if (tarEntry) indexedTarTreeEntry.value = tarEntry;
  isIndexedTar.value = true;
}

async function downloadFile() {
  // Pre-flight probe via probeUrl — issues a Range: 0-0 GET
  // against the resolve endpoint so we can tell a gated/404/etc.
  // failure apart from a successful stream. The happy path still
  // goes through `window.open` so the browser owns the real download
  // (filename-from-Content-Disposition, progress, cancel). On a
  // classified failure we surface a toast with kind-specific copy
  // instead of letting the browser render the aggregated JSON body
  // as raw text in a new tab.
  const { ok, error } = await probeUrl(fileUrl.value);
  if (ok) {
    window.open(fileUrl.value, "_blank");
    return;
  }
  ElMessage({
    type: "error",
    message: downloadMessage(error),
    duration: 6000,
  });
}

async function copyFileUrl() {
  const fullUrl = window.location.origin + fileUrl.value;
  const success = await copyToClipboard(fullUrl);
  if (success) {
    ElMessage.success("File URL copied to clipboard");
  } else {
    ElMessage.error("Failed to copy");
  }
}

async function copyContent() {
  const success = await copyToClipboard(fileContent.value);
  if (success) {
    ElMessage.success("Content copied to clipboard");
  } else {
    ElMessage.error("Failed to copy");
  }
}

async function copyFilePath() {
  const success = await copyToClipboard(filePath.value);
  if (success) ElMessage.success("File path copied to clipboard");
  else ElMessage.error("Failed to copy");
}

function updateWorkbenchGeometry() {
  if (!props.embedded || !fileWorkbench.value) return;
  const viewport = scrollViewport?.getBoundingClientRect();
  const top =
    fileWorkbench.value.getBoundingClientRect().top - (viewport?.top || 0);
  sidebarHeight.value = Math.max(
    160,
    (viewport?.height || window.innerHeight) - Math.max(0, top),
  );
  isPinned.value = top < 0;
  const nextNarrow = window.innerWidth < 900;
  if (nextNarrow !== narrowViewport) {
    narrowViewport = nextNarrow;
    sidebarOpen.value = !nextNarrow;
  }
}

function scheduleWorkbenchGeometry() {
  if (scrollFrame !== null) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    updateWorkbenchGeometry();
  });
}

function scrollToTop() {
  (scrollViewport || window).scrollTo({ top: 0, behavior: "smooth" });
}

function getFolderPath(folderPath) {
  return `/${repoType.value}s/${namespace.value}/${name.value}/tree/${branch.value}/${folderPath}`;
}

const editPath = computed(
  () =>
    `/${repoType.value}s/${namespace.value}/${name.value}/edit/${branch.value}/${filePath.value}`,
);

async function confirmDeleteFile() {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to delete "${fileName.value}"? This action cannot be undone.`,
      "Delete File",
      {
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        type: "warning",
        confirmButtonClass: "el-button--danger",
      },
    );

    // User confirmed, proceed with deletion
    await deleteFile();
  } catch {
    // User cancelled - do nothing
  }
}

async function deleteFile() {
  deleting.value = true;

  try {
    // Create commit with deletedFile operation
    await repoAPI.commitFiles(
      repoType.value,
      namespace.value,
      name.value,
      branch.value,
      {
        message: `Delete ${filePath.value}`,
        operations: [
          {
            operation: "deletedFile",
            path: filePath.value,
          },
        ],
      },
    );

    ElMessage.success(`File "${fileName.value}" deleted successfully`);

    // Navigate back to folder or repo root
    if (pathSegments.value.length > 1) {
      const folderPath = pathSegments.value.slice(0, -1).join("/");
      router.push(
        `/${repoType.value}s/${namespace.value}/${name.value}/tree/${branch.value}/${folderPath}`,
      );
    } else {
      router.push(
        `/${repoType.value}s/${namespace.value}/${name.value}/tree/${branch.value}`,
      );
    }
  } catch (err) {
    console.error("Failed to delete file:", err);
    notifyError(err, { fallback: "Failed to delete file" });
  } finally {
    deleting.value = false;
  }
}

// Lifecycle
onMounted(() => {
  loadFileInfo();
  if (props.embedded) {
    scrollViewport = fileWorkbench.value?.closest(".page-scroll-wrap");
    scrollViewport?.addEventListener("scroll", scheduleWorkbenchGeometry, {
      passive: true,
    });
    window.addEventListener("resize", scheduleWorkbenchGeometry);
    if (typeof ResizeObserver !== "undefined" && scrollViewport) {
      viewportObserver = new ResizeObserver(scheduleWorkbenchGeometry);
      viewportObserver.observe(scrollViewport);
    }
    updateWorkbenchGeometry();
  }
});
onUnmounted(() => {
  scrollViewport?.removeEventListener("scroll", scheduleWorkbenchGeometry);
  window.removeEventListener("resize", scheduleWorkbenchGeometry);
  viewportObserver?.disconnect();
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
});
</script>

<style scoped>
.repository-file-workbench {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  align-items: start;
  min-width: 0;
  min-height: 65vh;
  background: var(--site-card);
}
.repository-file-workbench.is-sidebar-closed {
  grid-template-columns: minmax(0, 1fr);
}
.file-detail-sidebar {
  position: sticky;
  top: 0;
  height: var(--file-sidebar-height, 100dvh);
  min-height: 0;
  border-right: 1px solid var(--site-border);
}
.file-detail-main {
  min-width: 0;
  padding: 0 24px 24px;
}
.file-detail-pathbar {
  position: sticky;
  top: 0;
  z-index: 22;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  background: var(--site-card);
}
.file-detail-pathbar.is-pinned {
  box-shadow: 0 1px 0 var(--site-border);
}
.file-detail-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-size: 14px;
}
.file-detail-breadcrumb a {
  color: var(--site-link);
}
.file-detail-breadcrumb h2 {
  margin: 0;
  font-size: inherit;
  font-weight: 600;
}
.file-path-separator {
  color: var(--site-muted);
}
.file-top-button {
  margin-left: auto;
}
.file-detail-metadata,
.file-detail-commit {
  margin-bottom: 16px;
}
.file-detail-toolbar {
  position: sticky;
  top: 56px;
  z-index: 21;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 46px;
  padding: 8px;
  border: 1px solid var(--site-border);
  border-radius: 6px 6px 0 0;
  background: var(--site-hover);
}
.file-detail-view-controls,
.file-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.file-detail-actions {
  margin-left: auto;
  flex-wrap: wrap;
  gap: 4px;
}
.file-detail-modes {
  display: flex;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  overflow: hidden;
}
.file-detail-modes button {
  padding: 4px 12px;
  border: 0;
  background: transparent;
  color: var(--site-card-text);
  font-size: 13px;
  cursor: pointer;
}
.file-detail-modes button[aria-selected="true"] {
  background: var(--site-card);
  box-shadow: 0 0 0 1px var(--site-border);
  border-radius: 5px;
}
.file-detail-mode {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
}
.file-detail-stats {
  color: var(--site-muted);
  font-size: 12px;
  white-space: nowrap;
}
.file-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  background: var(--site-card);
  color: var(--site-card-text);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.file-action:hover {
  background: var(--site-hover);
}
.file-action-icon {
  width: 30px;
  padding: 4px;
  font-size: 16px;
}
.file-action:focus-visible,
.file-detail-modes button:focus-visible {
  outline: 2px solid var(--site-link);
  outline-offset: 2px;
}
.file-delete-action {
  color: var(--el-color-danger);
}
.file-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.file-detail-content {
  min-width: 0;
  border: 1px solid var(--site-border);
  border-top: 0;
  border-radius: 0 0 6px 6px;
}
.file-metadata-preview {
  min-width: 0;
  padding: 24px;
}
.file-markdown-preview {
  max-width: 1060px;
  margin: 0 auto;
  padding: 32px;
}
.file-detail-content :deep(.markdown-body) {
  max-width: none;
}
.file-markdown-preview[data-mdw="wide"] {
  max-width: 1400px;
}
.file-markdown-preview[data-mdw="fill"] {
  max-width: none;
}
.file-markdown-preview[data-mdw="bleed"] {
  max-width: none;
}
.file-markdown-preview[data-mdw="bleed"] :deep(.markdown-body) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1012px) minmax(0, 1fr);
}
.file-markdown-preview[data-mdw="bleed"] :deep(.markdown-body > *) {
  grid-column: 2;
}
.file-markdown-preview[data-mdw="bleed"] :deep(.markdown-body > table),
.file-markdown-preview[data-mdw="bleed"] :deep(.markdown-body > .code-block) {
  grid-column: 1 / -1;
}
.mdw-pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 50;
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  background: var(--el-bg-color, #fff);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  font-size: 12px;
}
.mdw-pill button {
  padding: 3px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mdw-pill button[aria-pressed="true"] {
  background: var(--site-link);
  color: #fff;
}
@media (max-width: 899px) {
  .file-metadata-preview {
    padding: 16px;
  }
  .repository-file-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
  .file-detail-sidebar {
    position: static;
    height: min(420px, 50dvh);
    border-right: 0;
    border-bottom: 1px solid var(--site-border);
  }
  .file-detail-main {
    padding: 0 16px 16px;
  }
  .file-markdown-preview {
    padding: 20px 16px;
  }
  .file-detail-view-controls {
    flex-wrap: wrap;
  }
}
</style>
