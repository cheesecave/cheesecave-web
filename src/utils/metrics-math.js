// src/utils/metrics-math.js
//
// The arithmetic behind the curves: smoothing, axis ticks and reducing a long series to
// what a canvas of a given width can show. No DOM, so it is testable.

/**
 * TensorBoard's smoothing: an exponential moving average with the start bias removed
 * (so the first points are not dragged to zero). `weight` is the slider, 0 = off, 0.99 = very smooth.
 * Non-finite values are kept as gaps and do not poison the average.
 */
export function smooth(values, weight) {
  if (!(weight > 0)) return values;
  const out = new Array(values.length);
  let last = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = v;
      continue;
    }
    last = last * weight + (1 - weight) * v;
    n++;
    out[i] = last / (1 - Math.pow(weight, n));
  }
  return out;
}

/** "Nice" tick positions covering [min, max]: 1, 2, 5 times a power of ten. */
export function niceTicks(min, max, target = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : Number(t.toPrecision(12)));
  }
  return ticks;
}

/** Ticks for a log axis: the powers of ten inside [min, max] (min, max > 0). */
export function logTicks(min, max) {
  if (!(min > 0) || !(max > 0)) return [];
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const t = Math.pow(10, e);
    if (t >= min * 0.999 && t <= max * 1.001) out.push(t);
  }
  return out;
}

export function formatNumber(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6 || a < 1e-3) return v.toExponential(2).replace("e+", "e");
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return Number(v.toPrecision(4)).toString();
}

export function formatStep(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`;
  if (a >= 1e4) return `${Number((v / 1e3).toPrecision(3))}k`;
  return String(Math.round(v * 100) / 100);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.abs(seconds);
  if (s < 90) return `${Math.round(seconds)}s`;
  if (s < 5400) return `${Math.round(seconds / 60)}m`;
  if (s < 172800) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/**
 * Reduce a series to at most `2 * columns` points that draw the same picture: per pixel column keep the
 * first, minimum, maximum and last point (a spike is never lost, unlike every-nth sampling).
 * `x` must be ascending. Returns index arrays into the input so a tooltip can still read real data.
 */
export function reduceToColumns(x, y, columns, x0, x1) {
  const n = x.length;
  if (n <= columns * 2 || !(x1 > x0)) return null; // nothing to do: draw everything
  const keep = [];
  const scale = columns / (x1 - x0);
  let col = -1;
  let first = 0;
  let lo = -1;
  let hi = -1;
  let last = 0;
  const flush = () => {
    if (col < 0) return;
    const set = new Set([first, lo, hi, last].filter((i) => i >= 0));
    for (const i of [...set].sort((a, b) => a - b)) keep.push(i);
  };
  for (let i = 0; i < n; i++) {
    const c = Math.floor((x[i] - x0) * scale);
    if (c !== col) {
      flush();
      col = c;
      first = i;
      lo = hi = Number.isFinite(y[i]) ? i : -1;
    } else if (Number.isFinite(y[i])) {
      if (lo < 0 || y[i] < y[lo]) lo = i;
      if (hi < 0 || y[i] > y[hi]) hi = i;
    }
    last = i;
  }
  flush();
  return keep;
}

/** Index of the point whose x is nearest to `x` (ascending array), or -1 for an empty array. */
export function nearestIndex(xs, x) {
  const n = xs.length;
  if (!n) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) <= Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}

/**
 * One CSV cell, quoted the CSV way (a quote inside is written twice). A text that a spreadsheet would
 * run as a formula (it starts with = + - @ tab or CR) gets a leading apostrophe: a run's name is the
 * name of a directory in somebody else's repository, and Excel evaluates `="..."` cells even when they are quoted.
 */
export function csvField(value) {
  let t = String(value);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
