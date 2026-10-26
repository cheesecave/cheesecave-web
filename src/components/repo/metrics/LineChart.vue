<!-- src/components/repo/metrics/LineChart.vue -->
<!--
  One line chart on a canvas, no charting library. Several series share the axes (one per run).
  Drawn only while it is on screen, so a log with hundreds of tags costs what the visible ones cost.
  A series longer than the plot is wide is reduced per pixel column (first, min, max, last), so a
  spike survives; the tooltip still reads the full-resolution data.
-->
<template>
  <div ref="wrap" class="relative w-full select-none" :style="{ height: `${height}px` }">
    <canvas
      ref="canvas"
      class="block h-full w-full"
      role="img"
      :aria-label="title"
      @mousemove="onMove"
      @mouseleave="hover = null"
    />
    <div
      v-if="hover && hover.rows.length"
      class="pointer-events-none absolute z-10 rounded border border-gray-200 bg-white/95 px-2 py-1 text-xs shadow-lg dark:border-gray-600 dark:bg-gray-800/95"
      :style="tooltipStyle"
    >
      <div class="mb-0.5 font-medium text-gray-700 dark:text-gray-200">{{ hover.xText }}</div>
      <div v-for="r in hover.rows" :key="r.key" class="flex items-center gap-1.5 whitespace-nowrap">
        <span class="inline-block h-2 w-2 rounded-full" :style="{ background: r.color }" />
        <span class="max-w-[160px] truncate text-gray-600 dark:text-gray-300">{{ r.label }}</span>
        <span class="ml-auto pl-2 font-mono text-gray-900 dark:text-gray-100">{{ r.valueText }}</span>
        <span v-if="r.rawText" class="font-mono text-gray-400">({{ r.rawText }})</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  formatNumber,
  logTicks,
  nearestIndex,
  niceTicks,
  reduceToColumns,
} from "@/utils/metrics-math";

/**
 * @typedef {{key: string, label: string, color: string, x: number[], y: number[], raw?: number[]|null}} ChartSeries
 */
const props = defineProps({
  /** @type {import('vue').PropType<ChartSeries[]>} */
  series: { type: Array, required: true },
  title: { type: String, default: "chart" },
  height: { type: Number, default: 180 },
  logY: { type: Boolean, default: false },
  dark: { type: Boolean, default: false },
  xFormat: { type: Function, default: (v) => String(v) },
});

const wrap = ref(null);
const canvas = ref(null);
const hover = ref(null);
let visible = false;
let width = 0;
let io;
let ro;
let frame = 0;

const M = { l: 54, r: 10, t: 8, b: 22 };

// the geometry of the last draw, for the tooltip
let geo = null;

function palette() {
  return props.dark
    ? { axis: "#9ca3af", grid: "rgba(255,255,255,0.08)", text: "#d1d5db" }
    : { axis: "#6b7280", grid: "rgba(0,0,0,0.07)", text: "#4b5563" };
}

function extent() {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of props.series) {
    const n = s.x.length;
    if (!n) continue;
    if (s.x[0] < x0) x0 = s.x[0];
    if (s.x[n - 1] > x1) x1 = s.x[n - 1];
    for (let i = 0; i < n; i++) {
      const v = s.y[i];
      if (!Number.isFinite(v) || (props.logY && v <= 0)) continue;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
    if (s.raw) {
      for (let i = 0; i < n; i++) {
        const v = s.raw[i];
        if (!Number.isFinite(v) || (props.logY && v <= 0)) continue;
        if (v < y0) y0 = v;
        if (v > y1) y1 = v;
      }
    }
  }
  return { x0, x1, y0, y1 };
}

function draw() {
  frame = 0;
  const cv = canvas.value;
  if (!cv || !visible || width < 40) return;
  const dpr = window.devicePixelRatio || 1;
  const w = width;
  const h = props.height;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pal = palette();
  const { x0, x1, y0: ymin, y1: ymax } = extent();
  const pw = w - M.l - M.r;
  const ph = h - M.t - M.b;
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  if (!Number.isFinite(x0) || !Number.isFinite(ymin)) {
    ctx.fillStyle = pal.text;
    ctx.textAlign = "center";
    ctx.fillText("no data", w / 2, h / 2);
    geo = null;
    return;
  }
  let lo = ymin;
  let hi = ymax;
  if (lo === hi) {
    lo -= Math.abs(lo) * 0.05 || 1;
    hi += Math.abs(hi) * 0.05 || 1;
  }
  let toY;
  let yTicks;
  if (props.logY) {
    const a = Math.log10(lo);
    const b = Math.log10(hi);
    const pad = (b - a) * 0.05 || 0.5;
    const A = a - pad;
    const B = b + pad;
    toY = (v) => M.t + ph - ((Math.log10(v) - A) / (B - A)) * ph;
    yTicks = logTicks(Math.pow(10, A), Math.pow(10, B));
    if (yTicks.length < 2) yTicks = [lo, hi];
  } else {
    const pad = (hi - lo) * 0.06;
    const A = lo - pad;
    const B = hi + pad;
    toY = (v) => M.t + ph - ((v - A) / (B - A)) * ph;
    yTicks = niceTicks(A, B, Math.max(2, Math.floor(ph / 40)));
  }
  const xs = x1 > x0 ? x1 - x0 : 1;
  const toX = (v) => M.l + ((v - x0) / xs) * pw;
  geo = { x0, x1, xs, pw, toX, toY };

  // grid and axes
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  ctx.fillStyle = pal.text;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of yTicks) {
    const y = Math.round(toY(t)) + 0.5;
    if (y < M.t - 1 || y > M.t + ph + 1) continue;
    ctx.beginPath();
    ctx.moveTo(M.l, y);
    ctx.lineTo(w - M.r, y);
    ctx.stroke();
    ctx.fillText(formatNumber(t), M.l - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of niceTicks(x0, x1, Math.max(2, Math.floor(pw / 90)))) {
    const x = Math.round(toX(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, M.t);
    ctx.lineTo(x, M.t + ph);
    ctx.stroke();
    const label = props.xFormat(t);
    const half = ctx.measureText(label).width / 2;
    // the last tick sits at the right edge: keep its label on the canvas instead of cutting it
    ctx.fillText(label, Math.min(Math.max(x, half + 2), w - half - 2), M.t + ph + 5);
  }
  ctx.strokeStyle = pal.axis;
  ctx.beginPath();
  ctx.moveTo(M.l + 0.5, M.t);
  ctx.lineTo(M.l + 0.5, M.t + ph + 0.5);
  ctx.lineTo(w - M.r, M.t + ph + 0.5);
  ctx.stroke();

  // lines (clipped to the plot)
  ctx.save();
  ctx.beginPath();
  ctx.rect(M.l, M.t, pw, ph);
  ctx.clip();
  ctx.lineJoin = "round";
  const trace = (x, y, alpha, lw, color) => {
    const idx = reduceToColumns(x, y, Math.max(1, Math.floor(pw)), x0, x1);
    const n = idx ? idx.length : x.length;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k < n; k++) {
      const i = idx ? idx[k] : k;
      const v = y[i];
      if (!Number.isFinite(v) || (props.logY && v <= 0)) {
        pen = false;
        continue;
      }
      const px = toX(x[i]);
      const py = toY(v);
      if (pen) ctx.lineTo(px, py);
      else {
        ctx.moveTo(px, py);
        pen = true;
      }
    }
    ctx.stroke();
    // a lone point has no line: give it a dot
    if (x.length === 1 && Number.isFinite(y[0])) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(x[0]), toY(y[0]), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const s of props.series) if (s.raw) trace(s.x, s.raw, 0.28, 1, s.color);
  for (const s of props.series) trace(s.x, s.y, 1, 1.5, s.color);
  ctx.restore();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function onMove(e) {
  if (!geo) return;
  const rect = canvas.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  if (mx < M.l || mx > rect.width - M.r) {
    hover.value = null;
    return;
  }
  const xv = geo.x0 + ((mx - M.l) / geo.pw) * geo.xs;
  const rows = [];
  let anchor = null;
  for (const s of props.series) {
    const i = nearestIndex(s.x, xv);
    if (i < 0) continue;
    const v = s.y[i];
    if (!Number.isFinite(v)) continue;
    if (anchor === null || Math.abs(s.x[i] - xv) < Math.abs(anchor - xv)) anchor = s.x[i];
    const rawV = s.raw ? s.raw[i] : null;
    rows.push({
      key: s.key,
      label: s.label,
      color: s.color,
      v,
      xAt: s.x[i],
      valueText: formatNumber(v),
      rawText: rawV != null && rawV !== v ? formatNumber(rawV) : "",
    });
  }
  rows.sort((a, b) => b.v - a.v);
  hover.value = { xText: props.xFormat(anchor ?? xv), rows, mx, my: e.clientY - rect.top, w: rect.width };
}

const tooltipStyle = computed(() => {
  const h = hover.value;
  if (!h) return {};
  const flip = h.mx > h.w * 0.55;
  return {
    top: `${Math.max(0, h.my - 12)}px`,
    ...(flip ? { right: `${h.w - h.mx + 12}px` } : { left: `${h.mx + 12}px` }),
  };
});

watch(() => [props.series, props.logY, props.dark, props.height, props.xFormat], schedule);

onMounted(() => {
  width = wrap.value.clientWidth;
  ro = new ResizeObserver(() => {
    const w = wrap.value?.clientWidth ?? 0;
    if (w !== width) {
      width = w;
      schedule();
    }
  });
  ro.observe(wrap.value);
  io = new IntersectionObserver(
    (entries) => {
      const v = entries.some((en) => en.isIntersecting);
      if (v !== visible) {
        visible = v;
        if (v) schedule();
      }
    },
    { rootMargin: "300px" },
  );
  io.observe(wrap.value);
});

onBeforeUnmount(() => {
  io?.disconnect();
  ro?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});
</script>
