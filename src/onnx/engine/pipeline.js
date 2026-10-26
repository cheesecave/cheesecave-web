// Pillow RGB bicubic resampling: scale-aware filter, intermediate uint8 rounding.
const cubic = (x) => {
  x = Math.abs(x);
  return x < 1
    ? (1.5 * x - 2.5) * x * x + 1
    : x < 2
      ? ((-0.5 * x + 2.5) * x - 4) * x + 2
      : 0;
};
function coefficients(source, target) {
  const scale = source / target,
    filterScale = Math.max(1, scale),
    support = 2 * filterScale;
  return Array.from({ length: target }, (_, i) => {
    const center = (i + 0.5) * scale;
    const start = Math.max(0, Math.trunc(center - support + 0.5));
    const end = Math.min(source, Math.trunc(center + support + 0.5));
    const raw = Array.from({ length: end - start }, (_, j) =>
      cubic((j + start - center + 0.5) / filterScale),
    );
    const total = raw.reduce((a, b) => a + b, 0);
    return {
      start,
      weights: raw.map((x) => {
        const y = (x / total) * 4194304;
        return Math.trunc(y + (y < 0 ? -0.5 : 0.5));
      }),
    };
  });
}
const clip = (x) => Math.max(0, Math.min(255, Math.floor(x / 4194304)));
export function preprocess(rgba, width, height, size = 640) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3] / 255;
    rgb[j] = Math.round(rgba[i] * alpha + 255 * (1 - alpha));
    rgb[j + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha));
    rgb[j + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha));
  }
  const xs = coefficients(width, size),
    ys = coefficients(height, size);
  let intermediate = rgb;
  if (width !== size) {
    intermediate = new Uint8Array(size * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < size; x++) {
        const { start, weights } = xs[x];
        for (let c = 0; c < 3; c++) {
          let value = 2097152;
          for (let k = 0; k < weights.length; k++)
            value += rgb[(y * width + start + k) * 3 + c] * weights[k];
          intermediate[(y * size + x) * 3 + c] = clip(value);
        }
      }
  }
  const count = size * size,
    tensor = new Float32Array(3 * count);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const { start, weights } = ys[y];
      for (let c = 0; c < 3; c++) {
        let value;
        if (height === size) value = intermediate[(y * size + x) * 3 + c];
        else {
          let sum = 2097152;
          for (let k = 0; k < weights.length; k++)
            sum += intermediate[((start + k) * size + x) * 3 + c] * weights[k];
          value = clip(sum);
        }
        tensor[c * count + y * size + x] = value / 255;
      }
    }
  return tensor;
}
function iou(a, b) {
  const intersect =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1);
  const union =
    (a[2] - a[0] + 1) * (a[3] - a[1] + 1) +
    (b[2] - b[0] + 1) * (b[3] - b[1] + 1) -
    intersect;
  return union > 0 ? intersect / union : 0;
}
export function postprocess(
  data,
  dims,
  width,
  height,
  threshold = 0.278,
  iouThreshold = 0.7,
) {
  if (dims.length !== 3 || dims[0] !== 1 || dims[1] !== 5)
    throw new Error(`Unsupported output shape: ${dims.join(" × ")}`);
  const count = dims[2],
    candidates = [];
  for (let i = 0; i < count; i++) {
    const score = data[4 * count + i];
    if (!Number.isFinite(score) || score <= threshold) continue;
    const cx = data[i],
      cy = data[count + i],
      w = data[2 * count + i],
      h = data[3 * count + i];
    if (![cx, cy, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    candidates.push({
      score,
      box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of candidates)
    if (
      kept.every((previous) => iou(previous.box, candidate.box) <= iouThreshold)
    )
      kept.push(candidate);
  const evenRound = (n) =>
    n - Math.floor(n) === 0.5
      ? Math.floor(n) + (Math.floor(n) % 2)
      : Math.round(n);
  return kept.map(({ score, box }, i) => ({
    id: i + 1,
    label: "face",
    score,
    box: box.map((v, j) =>
      Math.max(
        0,
        Math.min(
          j % 2 === 0 ? width : height,
          evenRound((v / 640) * (j % 2 === 0 ? width : height)),
        ),
      ),
    ),
  }));
}
