<!--
  OnnxPreviewPanel.vue

  A Netron-style view of an .onnx file that is read with HTTP Range requests, so
  the model is never downloaded. Two phases:

    1. Structure (a handful of requests): header, nodes, inputs/outputs and the
       intermediate shapes are read from the head and the tail of the file, spliced
       into a stripped ONNX (no weights) and opened in Netron, which is served from
       /netron/ and fed through a blob: URL.
    2. Weights (serial, in the background): the name, shape and type of every
       weight are read by walking the initializers. When they are ready the graph
       can be reloaded with weight shapes on the nodes. The result is cached in
       IndexedDB.

  Models whose weights live in other files (external data, often sharded) have all
  their descriptors in the .onnx itself, so phase 2 is instant for them; the
  sibling files are checked with one tiny Range request each.
-->

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { DATA_TYPES, siblingUrl } from "@/utils/onnx-range";

const props = defineProps({
  resolveUrl: { type: String, required: true },
  filename: { type: String, required: true },
  pageMode: { type: Boolean, default: false },
});

const tab = ref("graph");
const phase = ref("idle"); // idle | header | nodes | tail | build | ready | error
const nodesSeen = ref(0);
const error = ref("");
const info = ref(null);
const stats = ref({ requests: 0, bytes: 0 });
const size = ref(0);
const timings = ref({ structure: null, weights: null });

const weights = ref({
  state: "idle",
  count: 0,
  summary: null,
  ratio: 0,
  cached: false,
});
const external = ref([]);
const graphSrc = ref("");
const graphKey = ref(0);
const pendingModel = ref(null);
const showApply = ref(false);

let worker = null;
let aborter = null;
let blobUrls = [];
let graphShownAt = 0;

const baseUrl = import.meta.env.BASE_URL || "/";

function formatBytes(n) {
  if (n === null || n === undefined) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  // Decimal units, like the file size in the header of the page
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}
const formatCount = (n) => n.toLocaleString("en-US");
function formatParams(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return String(n);
}
const dtype = (code) => DATA_TYPES[code] || (code ? `type ${code}` : "unknown");
const isDynamic = (dim) => typeof dim === "string" || dim === null;

const percentRead = computed(() =>
  size.value ? (stats.value.bytes / size.value) * 100 : 0,
);
const percentText = computed(() => {
  const p = percentRead.value;
  return p >= 10
    ? `${p.toFixed(0)} %`
    : p >= 1
      ? `${p.toFixed(1)} %`
      : `${p.toFixed(2)} %`;
});

function setStats(s) {
  if (!s) return;
  stats.value = { requests: s.requests, bytes: s.bytes };
  if (s.size) size.value = s.size;
}

function showGraph(bytes) {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  blobUrls.push(url);
  graphSrc.value = `${baseUrl}netron/index.html?url=${encodeURIComponent(url)}&identifier=${encodeURIComponent(props.filename)}`;
  graphKey.value += 1;
  graphShownAt = Date.now();
  showApply.value = false;
  pendingModel.value = null;
}

function applyWeights() {
  if (pendingModel.value) showGraph(pendingModel.value);
}

function cleanup() {
  worker?.postMessage({ type: "abort" });
  worker?.terminate();
  worker = null;
  aborter?.abort();
  aborter = null;
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
}

async function checkExternal(files, signal) {
  external.value = files.map((f) => ({
    ...f,
    status: "checking",
    actual: null,
  }));
  await Promise.all(
    files.map(async (file, index) => {
      let status = "missing";
      let actual = null;
      try {
        const response = await fetch(
          siblingUrl(props.resolveUrl, file.location),
          {
            headers: { Range: "bytes=0-0" },
            signal,
            mode: "cors",
            credentials: "same-origin",
          },
        );
        if (response.status === 200 || response.status === 206) {
          const match = /\/(\d+)$/.exec(
            response.headers.get("content-range") || "",
          );
          actual = match
            ? Number(match[1])
            : Number(response.headers.get("content-length") || 0);
          status = actual >= file.end ? "ok" : "short";
        }
        await response.body?.cancel?.();
      } catch (e) {
        if (e.name === "AbortError") return;
      }
      external.value = external.value.map((row, i) =>
        i === index ? { ...row, status, actual } : row,
      );
    }),
  );
}

function onMessage({ data }) {
  setStats(data.stats);
  if (data.type === "progress") {
    phase.value = data.phase;
    if (data.detail?.nodes) nodesSeen.value = data.detail.nodes;
  } else if (data.type === "structure") {
    info.value = data.info;
    timings.value.structure = data.structureMs;
    showGraph(data.model);
    phase.value = "ready";
    weights.value = { ...weights.value, state: "loading" };
  } else if (data.type === "weights") {
    weights.value = {
      ...weights.value,
      state: "loading",
      count: data.count,
      summary: data.summary,
      ratio: data.ratio,
    };
  } else if (data.type === "done") {
    info.value = data.info;
    timings.value.structure = data.structureMs;
    timings.value.weights = data.weightsMs;
    weights.value = {
      state: "done",
      count: data.summary.count,
      summary: data.summary,
      ratio: 1,
      cached: data.cached,
    };
    if (data.summary.files.length) {
      aborter = new AbortController();
      checkExternal(data.summary.files, aborter.signal);
    }
    if (
      data.cached ||
      phase.value !== "ready" ||
      Date.now() - graphShownAt < 2500
    ) {
      showGraph(data.model);
      phase.value = "ready";
    } else {
      pendingModel.value = data.model;
      showApply.value = true;
    }
  } else if (data.type === "error") {
    phase.value = "error";
    error.value = data.message;
    if (weights.value.state === "loading") {
      weights.value = { ...weights.value, state: "error" };
    }
  }
}

function loadAll() {
  cleanup();
  phase.value = "header";
  error.value = "";
  info.value = null;
  graphSrc.value = "";
  external.value = [];
  weights.value = {
    state: "idle",
    count: 0,
    summary: null,
    ratio: 0,
    cached: false,
  };
  timings.value = { structure: null, weights: null };
  showApply.value = false;
  pendingModel.value = null;
  nodesSeen.value = 0;
  stats.value = { requests: 0, bytes: 0 };
  size.value = 0;

  // All the range reading and parsing runs in a worker, so a big graph being
  // drawn in the iframe cannot slow the serial walk over the weights down.
  worker = new Worker(
    new URL("../../../utils/onnx-worker.js", import.meta.url),
    {
      type: "module",
    },
  );
  worker.onmessage = onMessage;
  worker.onerror = (event) =>
    onMessage({
      data: { type: "error", message: event.message || "worker failed" },
    });
  worker.postMessage({ type: "load", url: props.resolveUrl });
}

watch(() => props.resolveUrl, loadAll, { immediate: true });
onBeforeUnmount(cleanup);

const steps = computed(() => {
  const order = ["header", "nodes", "tail", "build", "ready"];
  const at = order.indexOf(phase.value);
  return [
    { id: "header", label: "Reading the model header" },
    {
      id: "nodes",
      label: nodesSeen.value
        ? `Reading nodes (${formatCount(nodesSeen.value)})`
        : "Reading nodes",
    },
    { id: "tail", label: "Reading inputs, outputs and shapes" },
    { id: "build", label: "Opening the graph" },
  ].map((s) => ({
    ...s,
    done: order.indexOf(s.id) < at,
    active: order.indexOf(s.id) === at,
  }));
});

const topOps = computed(() =>
  info.value ? info.value.graph.ops.slice(0, 14) : [],
);
const maxOp = computed(() => (topOps.value[0] ? topOps.value[0][1] : 1));
const extraOps = computed(() =>
  info.value ? Math.max(0, info.value.graph.ops.length - 14) : 0,
);
const maxType = computed(() =>
  weights.value.summary?.types?.[0]
    ? weights.value.summary.types[0].parameters
    : 1,
);
</script>

<template>
  <div class="onnx-panel" :class="{ 'is-page': pageMode }">
    <div class="onnx-bar">
      <div class="onnx-tabs" role="tablist" aria-label="ONNX view">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'graph'"
          @click="tab = 'graph'"
        >
          Graph
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'summary'"
          @click="tab = 'summary'"
        >
          Summary
        </button>
      </div>

      <div class="onnx-chips" aria-live="polite">
        <span v-if="size" class="onnx-chip" data-test="read-cost">
          <span class="i-carbon-data-share" aria-hidden="true" />
          Read {{ formatBytes(stats.bytes) }} of {{ formatBytes(size) }}
          <strong>({{ percentText }})</strong>
          · {{ stats.requests }}
          {{ stats.requests === 1 ? "request" : "requests" }}
        </span>
        <span
          v-if="weights.state === 'loading'"
          class="onnx-chip onnx-chip-progress"
          data-test="weights-progress"
        >
          Weights {{ formatCount(weights.count) }}
          <span class="onnx-meter" aria-hidden="true"
            ><span :style="{ width: `${Math.round(weights.ratio * 100)}%` }"
          /></span>
          {{ Math.round(weights.ratio * 100) }} %
        </span>
        <span
          v-else-if="weights.state === 'done'"
          class="onnx-chip onnx-chip-done"
          data-test="weights-done"
        >
          <span class="i-carbon-checkmark" aria-hidden="true" />
          {{ formatCount(weights.summary.count) }} weights
          {{ weights.cached ? "(from cache)" : "" }}
        </span>
        <button
          v-if="showApply"
          type="button"
          class="onnx-apply"
          data-test="apply-weights"
          @click="applyWeights"
        >
          Show weight shapes in the graph
        </button>
      </div>
    </div>

    <div v-if="phase === 'error'" class="onnx-error" role="alert">
      <div class="i-carbon-warning-alt text-2xl" aria-hidden="true" />
      <p class="onnx-error-title">This model could not be read in place</p>
      <p class="onnx-error-text">{{ error }}</p>
    </div>

    <template v-else>
      <!-- Graph -->
      <div v-show="tab === 'graph'" class="onnx-graph">
        <div
          v-if="phase !== 'ready'"
          class="onnx-loading"
          data-test="graph-loading"
        >
          <ol class="onnx-steps">
            <li
              v-for="s in steps"
              :key="s.id"
              :class="{ done: s.done, active: s.active }"
            >
              <span
                class="i-carbon-checkmark-filled"
                v-if="s.done"
                aria-hidden="true"
              />
              <span
                class="i-carbon-circle-dash onnx-spin"
                v-else-if="s.active"
                aria-hidden="true"
              />
              <span class="onnx-dot" v-else aria-hidden="true" />
              {{ s.label }}
            </li>
          </ol>
          <p class="onnx-note">
            Only the head and the end of the file are read; the weights are not
            downloaded.
          </p>
        </div>
        <iframe
          v-if="graphSrc"
          :key="graphKey"
          class="onnx-frame"
          :src="graphSrc"
          title="ONNX graph"
          data-test="graph-frame"
        />
      </div>

      <!-- Summary -->
      <div v-show="tab === 'summary'" class="onnx-summary">
        <div v-if="!info" class="onnx-loading">
          <span class="i-carbon-circle-dash onnx-spin" aria-hidden="true" />
          Reading…
        </div>
        <template v-else>
          <section class="onnx-card">
            <h3>Model</h3>
            <dl class="onnx-facts">
              <div>
                <dt>IR version</dt>
                <dd>{{ info.model.irVersion ?? "–" }}</dd>
              </div>
              <div>
                <dt>Producer</dt>
                <dd>
                  {{ info.model.producer || "–" }}
                  {{ info.model.producerVersion }}
                </dd>
              </div>
              <div v-if="info.model.domain">
                <dt>Domain</dt>
                <dd>{{ info.model.domain }}</dd>
              </div>
              <div>
                <dt>Graph</dt>
                <dd>{{ info.graph.name || "–" }}</dd>
              </div>
              <div>
                <dt>Nodes</dt>
                <dd>{{ formatCount(info.graph.nodeCount) }}</dd>
              </div>
              <div v-if="info.functions">
                <dt>Functions</dt>
                <dd>{{ info.functions }}</dd>
              </div>
              <div>
                <dt>Opsets</dt>
                <dd>
                  <span
                    v-for="o in info.opsets"
                    :key="o.domain"
                    class="onnx-pill"
                    >{{ o.domain }} {{ o.version }}</span
                  >
                </dd>
              </div>
            </dl>
            <dl
              v-if="Object.keys(info.metadata).length"
              class="onnx-facts onnx-meta"
            >
              <div v-for="(value, key) in info.metadata" :key="key">
                <dt>{{ key }}</dt>
                <dd>{{ value }}</dd>
              </div>
            </dl>
          </section>

          <section class="onnx-card">
            <h3>
              Inputs
              <span class="onnx-count">{{ info.graph.inputs.length }}</span>
            </h3>
            <table class="onnx-table">
              <tbody>
                <tr v-for="v in info.graph.inputs.slice(0, 12)" :key="v.name">
                  <td class="onnx-name">{{ v.name }}</td>
                  <td>{{ dtype(v.dataType) }}</td>
                  <td>
                    <template v-if="v.shape">
                      <span
                        v-for="(d, i) in v.shape"
                        :key="i"
                        class="onnx-dim"
                        :class="{ dynamic: isDynamic(d) }"
                        >{{ d }}</span
                      >
                    </template>
                    <span v-else class="onnx-muted">{{ v.kind }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="info.graph.inputs.length > 12" class="onnx-more">
              + {{ info.graph.inputs.length - 12 }} more
            </p>
            <h3 class="onnx-sub">
              Outputs
              <span class="onnx-count">{{ info.graph.outputs.length }}</span>
            </h3>
            <table class="onnx-table">
              <tbody>
                <tr v-for="v in info.graph.outputs.slice(0, 12)" :key="v.name">
                  <td class="onnx-name">{{ v.name }}</td>
                  <td>{{ dtype(v.dataType) }}</td>
                  <td>
                    <template v-if="v.shape">
                      <span
                        v-for="(d, i) in v.shape"
                        :key="i"
                        class="onnx-dim"
                        :class="{ dynamic: isDynamic(d) }"
                        >{{ d }}</span
                      >
                    </template>
                    <span v-else class="onnx-muted">{{ v.kind }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="info.graph.outputs.length > 12" class="onnx-more">
              + {{ info.graph.outputs.length - 12 }} more
            </p>
          </section>

          <section class="onnx-card">
            <h3>
              Operators
              <span class="onnx-count">{{ info.graph.ops.length }} kinds</span>
            </h3>
            <ul class="onnx-bars">
              <li v-for="[op, n] in topOps" :key="op">
                <span class="onnx-bar-label">{{ op }}</span>
                <span class="onnx-bar-track"
                  ><span :style="{ width: `${(n / maxOp) * 100}%` }"
                /></span>
                <span class="onnx-bar-value">{{ formatCount(n) }}</span>
              </li>
            </ul>
            <p v-if="extraOps" class="onnx-more">+ {{ extraOps }} more kinds</p>
          </section>

          <section class="onnx-card">
            <h3>
              Weights
              <span v-if="weights.state === 'loading'" class="onnx-count"
                >reading… {{ Math.round(weights.ratio * 100) }} %</span
              >
              <span v-else-if="weights.summary" class="onnx-count"
                >{{ formatCount(weights.summary.count) }} tensors</span
              >
            </h3>
            <template v-if="weights.summary">
              <dl class="onnx-facts">
                <div>
                  <dt>Parameters</dt>
                  <dd>{{ formatParams(weights.summary.parameters) }}</dd>
                </div>
                <div v-if="weights.summary.inlineBytes">
                  <dt>Stored in the file</dt>
                  <dd>{{ formatBytes(weights.summary.inlineBytes) }}</dd>
                </div>
                <div v-if="weights.summary.externalBytes">
                  <dt>Stored outside</dt>
                  <dd>{{ formatBytes(weights.summary.externalBytes) }}</dd>
                </div>
              </dl>
              <ul class="onnx-bars">
                <li v-for="t in weights.summary.types" :key="t.type">
                  <span class="onnx-bar-label">{{ t.type }}</span>
                  <span class="onnx-bar-track"
                    ><span
                      :style="{ width: `${(t.parameters / maxType) * 100}%` }"
                  /></span>
                  <span class="onnx-bar-value">{{
                    formatParams(t.parameters)
                  }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="onnx-muted">Waiting for the structure…</p>
          </section>

          <section v-if="external.length" class="onnx-card onnx-wide">
            <h3>
              External data
              <span class="onnx-count"
                >{{ external.length }}
                {{ external.length === 1 ? "file" : "files" }}</span
              >
            </h3>
            <table class="onnx-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Tensors</th>
                  <th>Needed</th>
                  <th>Found</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="f in external"
                  :key="f.location"
                  :data-status="f.status"
                >
                  <td class="onnx-name">{{ f.location }}</td>
                  <td>{{ f.tensors }}</td>
                  <td>{{ formatBytes(f.end) }}</td>
                  <td>{{ f.actual === null ? "–" : formatBytes(f.actual) }}</td>
                  <td>
                    <span v-if="f.status === 'ok'" class="onnx-ok"
                      ><span class="i-carbon-checkmark" aria-hidden="true" /> in
                      this repository</span
                    >
                    <span v-else-if="f.status === 'short'" class="onnx-bad"
                      >shorter than the weights need</span
                    >
                    <span v-else-if="f.status === 'missing'" class="onnx-bad"
                      >not found next to the model</span
                    >
                    <span v-else class="onnx-muted">checking…</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="onnx-card onnx-wide">
            <h3>What it cost to read this</h3>
            <dl class="onnx-facts onnx-cost">
              <div>
                <dt>File size</dt>
                <dd>{{ formatBytes(size) }}</dd>
              </div>
              <div>
                <dt>Read so far</dt>
                <dd>{{ formatBytes(stats.bytes) }} ({{ percentText }})</dd>
              </div>
              <div>
                <dt>Requests</dt>
                <dd>{{ stats.requests }}</dd>
              </div>
              <div>
                <dt>Structure</dt>
                <dd>
                  {{
                    timings.structure === null
                      ? "…"
                      : `${(timings.structure / 1000).toFixed(1)} s`
                  }}
                </dd>
              </div>
              <div>
                <dt>Weights</dt>
                <dd>
                  {{
                    weights.cached
                      ? "from cache"
                      : timings.weights === null
                        ? weights.state === "loading"
                          ? "reading…"
                          : "–"
                        : `${(timings.weights / 1000).toFixed(1)} s`
                  }}
                </dd>
              </div>
            </dl>
          </section>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.onnx-panel {
  min-width: 0;
  font-size: 13px;
  color: var(--site-text, inherit);
}
.onnx-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--site-border);
}
.onnx-tabs {
  display: inline-flex;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  overflow: hidden;
}
.onnx-tabs button {
  padding: 4px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.onnx-tabs button + button {
  border-left: 1px solid var(--site-border);
}
.onnx-tabs button[aria-selected="true"] {
  background: var(--site-link);
  color: #fff;
}
.onnx-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.onnx-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  color: var(--site-muted);
  white-space: nowrap;
}
.onnx-chip strong {
  color: inherit;
  font-weight: 600;
}
.onnx-chip-done {
  color: #1a7f4b;
}
.onnx-meter {
  display: inline-block;
  width: 72px;
  height: 6px;
  border-radius: 3px;
  background: var(--site-border);
  overflow: hidden;
}
.onnx-meter > span {
  display: block;
  height: 100%;
  background: var(--site-link);
  transition: width 0.2s;
}
.onnx-apply {
  padding: 3px 12px;
  border: 1px solid var(--site-link);
  border-radius: 999px;
  background: transparent;
  color: var(--site-link);
  font: inherit;
  cursor: pointer;
}
.onnx-apply:hover {
  background: var(--site-link);
  color: #fff;
}

.onnx-graph {
  position: relative;
  height: min(78vh, 880px);
  min-height: 520px;
}
.onnx-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.onnx-loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--site-muted);
}
.onnx-summary .onnx-loading {
  position: static;
  padding: 60px 0;
}
.onnx-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.onnx-steps li {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.55;
}
.onnx-steps li.done {
  opacity: 1;
  color: #1a7f4b;
}
.onnx-steps li.active {
  opacity: 1;
  color: inherit;
  font-weight: 600;
}
.onnx-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  box-sizing: border-box;
}
.onnx-note {
  margin: 0;
  font-size: 12px;
}
.onnx-spin {
  animation: onnx-spin 1s linear infinite;
}
@keyframes onnx-spin {
  to {
    transform: rotate(360deg);
  }
}

.onnx-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 16px;
}
.onnx-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
}
.onnx-card h3 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.onnx-card .onnx-sub {
  margin-top: 16px;
}
.onnx-wide {
  grid-column: 1 / -1;
}
.onnx-count {
  color: var(--site-muted);
  font-size: 12px;
  font-weight: 400;
}
.onnx-facts {
  display: grid;
  gap: 6px;
  margin: 0;
}
.onnx-facts > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
}
.onnx-facts dt {
  color: var(--site-muted);
}
.onnx-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.onnx-cost {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.onnx-cost > div {
  grid-template-columns: 1fr;
  gap: 2px;
}
.onnx-meta {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--site-border);
}
.onnx-pill {
  display: inline-block;
  margin-right: 6px;
  padding: 0 8px;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.onnx-table {
  width: 100%;
  border-collapse: collapse;
}
.onnx-table th {
  text-align: left;
  color: var(--site-muted);
  font-weight: 500;
}
.onnx-table td,
.onnx-table th {
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--site-border);
  vertical-align: top;
}
.onnx-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}
.onnx-dim {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--site-muted) 14%, transparent);
  font-variant-numeric: tabular-nums;
}
.onnx-dim.dynamic {
  background: color-mix(in srgb, var(--site-link) 18%, transparent);
  font-style: italic;
}
.onnx-facts + .onnx-bars {
  margin-top: 12px;
}
.onnx-bars {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.onnx-bars li {
  display: grid;
  grid-template-columns: minmax(90px, 160px) minmax(0, 1fr) 64px;
  align-items: center;
  gap: 10px;
}
.onnx-bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.onnx-bar-track {
  height: 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--site-muted) 14%, transparent);
  overflow: hidden;
}
.onnx-bar-track > span {
  display: block;
  height: 100%;
  background: var(--site-link);
}
.onnx-bar-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.onnx-more,
.onnx-muted {
  margin: 8px 0 0;
  color: var(--site-muted);
}
.onnx-ok {
  color: #1a7f4b;
}
.onnx-bad {
  color: var(--el-color-danger, #c0392b);
}

.onnx-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 80px 24px;
  text-align: center;
  color: var(--site-muted);
}
.onnx-error-title {
  margin: 0;
  color: inherit;
  font-weight: 600;
}
.onnx-error-text {
  margin: 0;
  max-width: 560px;
}

@media (max-width: 899px) {
  .onnx-summary {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
  }
  .onnx-graph {
    height: 70vh;
  }
}
</style>
