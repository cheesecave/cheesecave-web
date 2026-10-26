<!-- src/components/repo/metrics/MetricsPanel.vue -->
<!--
  The "Metrics" tab: training curves read from the logs a repository already holds.

  Everything happens in the browser. The file list says which logs exist (event files and
  trainer_state.json), each run is streamed through /resolve/ and parsed as it arrives, and
  the curves are drawn on canvases. The server stores and serves files, as it does for any
  other file; it parses nothing.
-->
<template>
  <div class="metrics-panel" data-testid="metrics-panel">
    <!-- listing the repository -->
    <div v-if="phase === 'listing'" class="card flex items-center gap-3 text-gray-600 dark:text-gray-300">
      <div class="i-carbon-circle-dash animate-spin text-xl" />
      Looking for training logs…
    </div>

    <div v-else-if="phase === 'error'" class="card text-red-600 dark:text-red-400" role="alert">
      Could not list the repository files: {{ errorText }}
    </div>

    <div v-else-if="phase === 'empty'" class="card text-gray-600 dark:text-gray-300">
      <div class="mb-1 text-lg font-medium text-gray-800 dark:text-gray-100">No training logs in this repository</div>
      <p>
        This tab shows curves from TensorBoard event files (<code>events.out.tfevents.*</code>) and from
        Hugging Face Trainer's <code>trainer_state.json</code>. Upload them anywhere in the repository, for example
        under <code>runs/</code>, and they appear here.
      </p>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- left: runs and settings -->
      <aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Runs <span class="font-normal">({{ runs.length }})</span>
            </h2>
            <div class="space-x-2 text-xs">
              <button class="text-blue-600 hover:underline dark:text-blue-400" @click="selectAll(true)">all</button>
              <button class="text-blue-600 hover:underline dark:text-blue-400" @click="selectAll(false)">none</button>
            </div>
          </div>
          <ul class="max-h-[340px] space-y-1 overflow-y-auto pr-1">
            <li v-for="r in runs" :key="r.id" class="flex items-start gap-2 text-sm" :class="r.noScalars ? 'opacity-50' : ''">
              <input
                type="checkbox"
                class="mt-1"
                :checked="r.selected"
                :disabled="r.state !== 'done' || r.noScalars"
                :aria-label="`Show ${r.label}`"
                @change="r.selected = $event.target.checked"
              />
              <span class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: colorOf(r) }" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-mono text-xs" :title="r.fullLabel + '\n' + r.files.map((f) => f.path).join('\n')">{{ r.label }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  <template v-if="r.state === 'loading'">
                    <div class="mt-0.5 h-1 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                      <div class="h-full bg-blue-500 transition-all" :style="{ width: `${Math.round(r.progress * 100)}%` }" />
                    </div>
                    <template v-if="r.files.length > 1">{{ r.filesDone }}/{{ r.files.length }} files, </template>{{ formatBytes(r.progress * r.bytes) }} of {{ formatBytes(r.bytes) }}
                    <template v-if="r.tagCount">: {{ r.tagCount }} tags so far</template>
                    <button class="ml-1 text-blue-600 hover:underline dark:text-blue-400" @click="cancel(r)">cancel</button>
                  </template>
                  <template v-else-if="r.state === 'idle'">
                    {{ r.files.length }} file{{ r.files.length > 1 ? "s" : "" }}, {{ formatBytes(r.bytes) }}
                    <button class="ml-1 text-blue-600 hover:underline dark:text-blue-400" @click="load(r)">
                      load ({{ formatBytes(r.bytes) }})
                    </button>
                  </template>
                  <template v-else-if="r.state === 'error'">
                    <span class="text-red-600 dark:text-red-400">{{ r.error }}</span>
                    <button class="ml-1 text-blue-600 hover:underline dark:text-blue-400" @click="load(r)">retry</button>
                  </template>
                  <template v-else-if="r.noScalars">
                    no curves
                    <span v-if="r.otherSummary">({{ r.otherSummary }})</span>
                  </template>
                  <template v-else>
                    {{ r.tagCount }} tags, {{ r.points.toLocaleString("en-US") }} points,
                    {{ r.files.length > 1 ? `${r.files.length} files, ` : "" }}{{ formatBytes(r.bytes) }}
                    {{ r.cachedFiles === r.files.length ? "from this browser's cache" : `in ${(r.ms / 1000).toFixed(1)}s` }}{{ r.cachedFiles && r.cachedFiles < r.files.length ? ` (${r.cachedFiles} cached)` : "" }}
                    <span v-if="r.warnings.length" class="text-amber-600 dark:text-amber-400" :title="r.warnings.join('\n')">
                        · {{ r.warnings.length }} problem{{ r.warnings.length > 1 ? "s" : "" }}
                    </span>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div class="card space-y-3 text-sm">
          <label class="block">
            <span class="flex justify-between text-gray-600 dark:text-gray-300">
              Smoothing <span class="font-mono">{{ smoothing.toFixed(2) }}</span>
            </span>
            <input v-model.number="smoothing" type="range" min="0" max="0.99" step="0.01" class="w-full" aria-label="Smoothing" />
          </label>
          <fieldset>
            <legend class="mb-1 text-gray-600 dark:text-gray-300">Horizontal axis</legend>
            <label v-for="o in xOptions" :key="o.value" class="mr-3 inline-flex items-center gap-1" :class="o.disabled ? 'opacity-40' : ''">
              <input v-model="xAxis" type="radio" :value="o.value" :disabled="o.disabled" :title="o.disabled ? 'no timestamps in the loaded runs' : ''" />
              {{ o.label }}
            </label>
          </fieldset>
          <label class="flex items-center gap-2"><input v-model="logY" type="checkbox" /> Log scale (y)</label>
          <label class="flex items-center gap-2"><input v-model="showRaw" type="checkbox" /> Show unsmoothed line</label>
          <label class="flex items-center gap-2"><input v-model="tall" type="checkbox" /> Larger charts</label>
        </div>

        <div v-if="otherKinds.length" class="card text-sm">
          <h2 class="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Also in these logs</h2>
          <ul class="space-y-0.5 text-gray-600 dark:text-gray-300">
            <li v-for="k in otherKinds" :key="k.kind">{{ k.tags }} {{ k.kind }} tag{{ k.tags > 1 ? "s" : "" }}, {{ k.count.toLocaleString("en-US") }} entries</li>
          </ul>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Not drawn yet (prototype).</p>
        </div>
      </aside>

      <!-- right: charts -->
      <main class="min-w-0">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <input v-model="filter" type="search" class="input w-72 max-w-full" placeholder="Filter tags (text, or /regex/)" aria-label="Filter tags" />
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ visibleTagCount }} of {{ allTags.length }} tags in {{ loadedRuns.length }} run{{ loadedRuns.length === 1 ? "" : "s" }}
          </span>
          <span v-if="listingTruncated" class="text-sm text-amber-600 dark:text-amber-400">
            The file list was cut at {{ MAX_ENTRIES.toLocaleString("en-US") }} entries: some logs may be missing.
          </span>
        </div>

        <div v-if="loadingAny && !allTags.length" class="card flex items-center gap-3 text-gray-600 dark:text-gray-300">
          <div class="i-carbon-circle-dash animate-spin text-xl" /> Reading logs…
        </div>
        <div v-else-if="!allTags.length" class="card text-gray-600 dark:text-gray-300">
          Nothing to draw yet. Load a run on the left.
        </div>

        <section v-for="g in groups" :key="g.name" class="mb-5">
          <button class="mb-2 flex w-full items-center gap-2 text-left" :aria-expanded="!collapsed.has(g.name)" @click="toggleGroup(g.name)">
            <span :class="collapsed.has(g.name) ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'" />
            <span class="text-lg font-semibold text-gray-800 dark:text-gray-100">{{ g.name }}</span>
            <span class="rounded bg-gray-100 px-1.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">{{ g.tags.length }}</span>
          </button>
          <div v-if="!collapsed.has(g.name)" class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))">
            <div
              v-for="tag in g.tags"
              :key="tag"
              class="card !p-2"
              :class="expanded.has(tag) ? 'col-span-full' : ''"
            >
              <div class="mb-1 flex items-center gap-1 px-1">
                <div class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100" :title="tag">
                  {{ tag.slice(tag.indexOf("/") + 1) || tag }}
                </div>
                <button class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100" title="Download CSV" aria-label="Download CSV" @click="downloadCsv(tag)"><span class="i-carbon-download" /></button>
                <button class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100" :title="expanded.has(tag) ? 'Shrink' : 'Enlarge'" :aria-label="expanded.has(tag) ? 'Shrink' : 'Enlarge'" @click="toggleExpand(tag)">
                  <span :class="expanded.has(tag) ? 'i-carbon-minimize' : 'i-carbon-maximize'" />
                </button>
              </div>
              <LineChart
                :series="seriesFor(tag)"
                :title="tag"
                :height="expanded.has(tag) ? 380 : tall ? 260 : 170"
                :log-y="logY"
                :dark="isDark"
                :x-format="xFormat"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import LineChart from "@/components/repo/metrics/LineChart.vue";
import { repoAPI } from "@/utils/api";
import { buildResolveUrl } from "@/utils/file-preview";
import { findMetricRuns, formatBytes, shortRunLabels, tagGroup } from "@/utils/metrics-discovery";
import { loadRun } from "@/utils/metrics-loader";
import { csvField, formatDuration, formatStep, smooth } from "@/utils/metrics-math";

const props = defineProps({
  repoType: { type: String, required: true },
  namespace: { type: String, required: true },
  name: { type: String, required: true },
  branch: { type: String, default: "main" },
});

// 20 distinguishable colours; the dark set is the lighter shade of each, so a line stays readable on a dark card
const COLORS = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4b5563", "#65a30d",
  "#1e3a8a", "#9a3412", "#14532d", "#7f1d1d", "#581c87", "#164e63", "#713f12", "#831843", "#111827", "#365314"];
const COLORS_DARK = ["#60a5fa", "#fb923c", "#4ade80", "#f87171", "#c084fc", "#22d3ee", "#facc15", "#f472b6", "#9ca3af", "#a3e635",
  "#93c5fd", "#fdba74", "#86efac", "#fca5a5", "#d8b4fe", "#67e8f9", "#fde047", "#f9a8d4", "#e5e7eb", "#bef264"];
const colorOf = (r) => (isDark.value ? COLORS_DARK : COLORS)[r.colorIndex % COLORS.length];
const AUTO_LOAD_BYTES = 25 * 1024 * 1024; // a run up to this size loads by itself; bigger ones ask first
const MAX_ENTRIES = 20000; // listing budget: pages of 1000

const phase = ref("listing");
const errorText = ref("");
const listingTruncated = ref(false);
const runs = reactive([]);
const controllers = new Map();

const smoothing = ref(0.6);
const xAxis = ref("step");
const logY = ref(false);
const showRaw = ref(true);
const tall = ref(false);
const filter = ref("");
const collapsed = reactive(new Set());
const expanded = reactive(new Set());
const isDark = ref(false);
const version = ref(0); // bumped when the loaded data changes: the memo below is keyed on it
let themeObserver;

// ---- discovery -------------------------------------------------------------

async function discover() {
  phase.value = "listing";
  const entries = [];
  try {
    let cursor;
    for (let page = 0; page < MAX_ENTRIES / 1000; page++) {
      const res = await repoAPI.listTreePage(props.repoType, props.namespace, props.name, props.branch, "", {
        recursive: true,
        limit: 1000,
        cursor,
      });
      entries.push(...res.entries);
      cursor = res.nextCursor;
      if (!res.hasMore) break;
      if (page === MAX_ENTRIES / 1000 - 1) listingTruncated.value = true;
    }
  } catch (e) {
    errorText.value = e?.response?.data?.error || e?.message || String(e);
    phase.value = "error";
    return;
  }
  const found = findMetricRuns(entries);
  const shortLabels = shortRunLabels(found.runs.map((r) => r.id));
  runs.splice(0, runs.length);
  found.runs.forEach((r, i) =>
    runs.push(
      reactive({
        ...r,
        colorIndex: i,
        label: shortLabels[i],
        fullLabel: r.label,
        selected: false,
        state: "idle",
        progress: 0,
        error: "",
        noScalars: false,
        filesDone: 0,
        cachedFiles: 0,
        warnings: [],
        tagCount: 0,
        points: 0,
        ms: 0,
        otherSummary: "",
        result: null,
      }),
    ),
  );
  phase.value = runs.length ? "ready" : "empty";
  // small runs load by themselves, the rest wait for a click
  const queue = runs.filter((r) => r.bytes <= AUTO_LOAD_BYTES).sort((a, b) => a.bytes - b.bytes);
  const workers = Array.from({ length: 3 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) await load(r);
  });
  await Promise.all(workers);
}

// ---- loading ---------------------------------------------------------------

function urlFor(path) {
  return buildResolveUrl({
    baseUrl: window.location.origin,
    repoType: props.repoType,
    namespace: props.namespace,
    name: props.name,
    branch: props.branch,
    path,
  });
}

// what a user calls it: a TF2 `tensor` summary is named by its plugin (text, histograms, ...)
const kindName = (e) => (e.kind === "tensor" ? e.plugin || "tensor" : e.kind);

function summarize(other) {
  const kinds = new Map();
  for (const e of other.values()) if (!(e.kind === "empty" && e.plugin === "hparams")) kinds.set(kindName(e), (kinds.get(kindName(e)) ?? 0) + 1);
  return [...kinds].map(([k, n]) => `${n} ${k}`).join(", ");
}

async function load(r) {
  if (r.state === "loading") return;
  r.state = "loading";
  r.error = "";
  r.progress = 0;
  const ctl = new AbortController();
  controllers.set(r.id, ctl);
  try {
    let touched = false;
    const res = await loadRun(r, {
      urlFor,
      repoKey: `${props.repoType}/${props.namespace}/${props.name}@${props.branch}`,
      signal: ctl.signal,
      onProgress: (p) => {
        r.progress = p.total ? Math.min(1, p.bytes / p.total) : 0;
        r.filesDone = p.filesDone;
      },
      // what has been read so far, merged the way the final result is: the charts fill in while a big run loads
      onPartial: (view) => {
        if (!view.scalars.size) return;
        r.result = markRaw(view);
        r.tagCount = view.scalars.size;
        if (!touched) {
          touched = true;
          r.selected = true;
        }
        version.value++;
      },
    });
    finish(r, res);
  } catch (e) {
    r.state = e?.name === "AbortError" ? "idle" : "error";
    r.error = e?.name === "AbortError" ? "" : e?.message || String(e);
    r.result = null;
    r.selected = false;
    r.tagCount = 0;
    version.value++;
  } finally {
    controllers.delete(r.id);
  }
}

function finish(r, res) {
  r.result = markRaw(res);
  r.cachedFiles = res.cachedFiles ?? 0;
  r.warnings = res.warnings ?? [];
  r.tagCount = res.scalars.size;
  r.points = [...res.scalars.values()].reduce((n, s) => n + s.step.length, 0);
  r.ms = res.ms;
  r.noScalars = res.scalars.size === 0;
  r.otherSummary = summarize(res.other);
  r.state = "done";
  r.progress = 1;
  r.filesDone = r.files.length;
  r.selected = !r.noScalars;
  version.value++;
}

function cancel(r) {
  controllers.get(r.id)?.abort();
}

function selectAll(on) {
  for (const r of runs) if (r.state === "done" && !r.noScalars) r.selected = on;
}

// ---- what is drawn -----------------------------------------------------------

const loadedRuns = computed(() => runs.filter((r) => r.selected && r.result && (r.state === "done" || r.state === "loading")));
const loadingAny = computed(() => runs.some((r) => r.state === "loading"));

const allTags = computed(() => {
  const set = new Set();
  for (const r of loadedRuns.value) for (const t of r.result.scalars.keys()) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

const matcher = computed(() => {
  const q = filter.value.trim();
  if (!q) return () => true;
  const m = q.match(/^\/(.+)\/([a-z]*)$/);
  if (m) {
    try {
      const re = new RegExp(m[1], m[2] || "i");
      return (t) => re.test(t);
    } catch {
      /* an unfinished regex: fall back to text */
    }
  }
  const low = q.toLowerCase();
  return (t) => t.toLowerCase().includes(low);
});

const groups = computed(() => {
  const by = new Map();
  for (const t of allTags.value) {
    if (!matcher.value(t)) continue;
    const g = tagGroup(t);
    if (!by.has(g)) by.set(g, []);
    by.get(g).push(t);
  }
  return [...by].map(([name, tags]) => ({ name, tags }));
});
const visibleTagCount = computed(() => groups.value.reduce((n, g) => n + g.tags.length, 0));

const hasWall = computed(() =>
  loadedRuns.value.some((r) => [...r.result.scalars.values()].some((s) => s.wall.some(Number.isFinite))),
);
const xOptions = computed(() => [
  { value: "step", label: "Step" },
  { value: "relative", label: "Relative", disabled: !hasWall.value },
  { value: "wall", label: "Wall", disabled: !hasWall.value },
]);
watch(hasWall, (ok) => {
  if (!ok && xAxis.value !== "step") xAxis.value = "step";
});

function xFormat(v) {
  if (xAxis.value === "relative") return formatDuration(v);
  if (xAxis.value === "wall") {
    const d = new Date(v * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return formatStep(v);
}

// charts ask for their series on every render: compute each once per (data, settings)
let memo = new Map();
watch([version, smoothing, xAxis, showRaw, loadedRuns, isDark], () => (memo = new Map()));

function seriesFor(tag) {
  const hit = memo.get(tag);
  if (hit) return hit;
  const out = [];
  for (const r of loadedRuns.value) {
    const s = r.result.scalars.get(tag);
    if (!s) continue;
    let x = s.step;
    if (xAxis.value !== "step") {
      const origin = firstWall(r);
      x = s.wall.map((w) => (xAxis.value === "relative" ? w - origin : w));
      if (!x.some(Number.isFinite)) continue;
    }
    const y = smooth(s.value, smoothing.value);
    out.push({ key: r.id, label: r.label, color: colorOf(r), x, y, raw: smoothing.value > 0 && showRaw.value ? s.value : null });
  }
  memo.set(tag, out);
  return out;
}

const origins = new WeakMap(); // run result -> its first wall time
function firstWall(r) {
  let m = origins.get(r.result);
  if (m === undefined) {
    m = Infinity;
    for (const s of r.result.scalars.values()) for (const w of s.wall) if (w < m) m = w;
    origins.set(r.result, m);
  }
  return m;
}

const otherKinds = computed(() => {
  const agg = new Map();
  for (const r of loadedRuns.value) {
    for (const e of r.result.other.values()) {
      if (e.kind === "empty" && e.plugin === "hparams") continue;
      const k = kindName(e);
      const a = agg.get(k) ?? { kind: k, tags: 0, count: 0 };
      a.tags++;
      a.count += e.count;
      agg.set(k, a);
    }
  }
  return [...agg.values()];
});

function toggleGroup(g) {
  collapsed.has(g) ? collapsed.delete(g) : collapsed.add(g);
}
function toggleExpand(t) {
  expanded.has(t) ? expanded.delete(t) : expanded.add(t);
}

function downloadCsv(tag) {
  const rows = ["run,step,wall_time,value"];
  for (const r of loadedRuns.value) {
    const s = r.result.scalars.get(tag);
    if (!s) continue;
    const id = csvField(r.id); // once per run, not per row
    for (let i = 0; i < s.step.length; i++) rows.push(`${id},${s.step[i]},${s.wall[i]},${s.value[i]}`);
  }
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tag.replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- lifecycle -------------------------------------------------------------

onMounted(() => {
  const html = document.documentElement;
  isDark.value = html.classList.contains("dark");
  themeObserver = new MutationObserver(() => (isDark.value = html.classList.contains("dark")));
  themeObserver.observe(html, { attributes: true, attributeFilter: ["class"] });
  discover();
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  for (const c of controllers.values()) c.abort();
});

watch(
  () => [props.repoType, props.namespace, props.name, props.branch],
  () => {
    for (const c of controllers.values()) c.abort();
    runs.splice(0, runs.length);
    discover();
  },
);

// a finished run changes what the charts show
watch(() => runs.map((r) => r.state + r.selected).join(), () => version.value++);

defineExpose({ runs });
</script>
