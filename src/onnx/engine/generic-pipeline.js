import {
  preprocess as legacyPreprocess,
  postprocess as legacyPostprocess,
} from "./pipeline.js";

const cubic = (x) => {
  x = Math.abs(x);
  return x < 1
    ? (1.5 * x - 2.5) * x * x + 1
    : x < 2
      ? (((x - 5) * x + 8) * x - 4) * -0.5
      : 0;
};
const linear = (x) => Math.max(0, 1 - Math.abs(x));
function coefficients(source, target, kernel, radius) {
  const scale = source / target,
    filterScale = Math.max(1, scale),
    support = radius * filterScale;
  return Array.from({ length: target }, (_, i) => {
    const center = (i + 0.5) * scale;
    const start = Math.max(0, Math.trunc(center - support + 0.5)),
      end = Math.min(source, Math.trunc(center + support + 0.5));
    const raw = Array.from({ length: end - start }, (_, j) =>
      kernel((j + start - center + 0.5) * (1 / filterScale)),
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
const clip = (value) => Math.max(0, Math.min(255, Math.floor(value / 4194304)));

function horizontalPass(rgb, width, height, targetWidth, kernel, radius) {
  if (width === targetWidth) return rgb;
  const xs = coefficients(width, targetWidth, kernel, radius),
    resized = new Uint8Array(targetWidth * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < targetWidth; x++) {
      const { start, weights } = xs[x];
      for (let c = 0; c < 3; c++) {
        let sum = 2097152;
        for (let k = 0; k < weights.length; k++)
          sum += rgb[(y * width + start + k) * 3 + c] * weights[k];
        resized[(y * targetWidth + x) * 3 + c] = clip(sum);
      }
    }
  return resized;
}
function verticalPass(rgb, width, height, targetHeight, kernel, radius) {
  if (height === targetHeight) return rgb;
  const ys = coefficients(height, targetHeight, kernel, radius),
    resized = new Uint8Array(width * targetHeight * 3);
  for (let y = 0; y < targetHeight; y++)
    for (let x = 0; x < width; x++) {
      const { start, weights } = ys[y];
      for (let c = 0; c < 3; c++) {
        let sum = 2097152;
        for (let k = 0; k < weights.length; k++)
          sum += rgb[((start + k) * width + x) * 3 + c] * weights[k];
        resized[(y * width + x) * 3 + c] = clip(sum);
      }
    }
  return resized;
}

// Pillow-compatible, separable antialiased RGB resize. White alpha compositing
// and the intermediate uint8 rounding match the existing image operator.
export function resizeRgb(
  rgba,
  width,
  height,
  targetWidth,
  targetHeight,
  interpolation,
) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3] / 255;
    for (let channel = 0; channel < 3; channel++)
      rgb[j + channel] = Math.round(
        rgba[i + channel] * alpha + 255 * (1 - alpha),
      );
  }
  const kernel = interpolation === "pillow-bilinear" ? linear : cubic;
  const radius = interpolation === "pillow-bilinear" ? 1 : 2;
  // Pillow 13 chooses the pass order from the dimensions. Intermediate uint8
  // rounding makes this observable, so portrait downscales must follow it too.
  // https://github.com/python-pillow/Pillow/blob/13.0.0/src/libImaging/Resample.c
  if (
    height - targetHeight > 0 &&
    height - targetHeight > (width - targetWidth) * 2
  ) {
    return horizontalPass(
      verticalPass(rgb, width, height, targetHeight, kernel, radius),
      width,
      targetHeight,
      targetWidth,
      kernel,
      radius,
    );
  }
  return verticalPass(
    horizontalPass(rgb, width, height, targetWidth, kernel, radius),
    targetWidth,
    height,
    targetHeight,
    kernel,
    radius,
  );
}

export function inputDimensions(input) {
  return input.layout === "NCHW"
    ? [1, 3, input.height, input.width]
    : [1, input.height, input.width, 3];
}

export function preprocessImage(rgba, width, height, config) {
  if (
    !(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16000000 ||
    rgba.length !== width * height * 4
  )
    throw new Error("input.image: 无效 RGBA 图片或超过 1600 万像素");
  const geometry = {
    sourceWidth: width,
    sourceHeight: height,
    inputWidth: config.width,
    inputHeight: config.height,
    resize: config.resize,
  };
  const dims = inputDimensions(config);
  // Compatibility is selected by operator settings, never by a model ID.
  const verticalFirst =
    height - config.height > 0 &&
    height - config.height > (width - config.width) * 2;
  if (
    !verticalFirst &&
    config.interpolation === "pillow-bicubic" &&
    config.width === config.height &&
    config.layout === "NCHW" &&
    config.color === "RGB" &&
    config.scale === 1 / 255 &&
    config.mean.every((x) => x === 0) &&
    config.std.every((x) => x === 1)
  ) {
    return {
      data: legacyPreprocess(rgba, width, height, config.width),
      dims,
      geometry,
    };
  }
  const pixels = resizeRgb(
    rgba,
    width,
    height,
    config.width,
    config.height,
    config.interpolation,
  );
  const count = config.width * config.height,
    data = new Float32Array(count * 3);
  for (let pixel = 0; pixel < count; pixel++)
    for (let channel = 0; channel < 3; channel++) {
      const sourceChannel = config.color === "BGR" ? 2 - channel : channel;
      const byte = pixels[pixel * 3 + sourceChannel];
      // The scale stage produces float32; mean/std then operate on that value.
      // This matches the upstream RGB encoder before its normalization stage.
      const scaled = Math.fround(
        config.scale === 1 / 255 ? byte / 255 : byte * config.scale,
      );
      const value = Math.fround(
        (scaled - config.mean[channel]) / config.std[channel],
      );
      if (!Number.isFinite(value))
        throw new Error("pipeline.input: 归一化结果超出 float32 有限范围");
      data[
        config.layout === "NCHW" ? channel * count + pixel : pixel * 3 + channel
      ] = value;
    }
  return { data, dims, geometry };
}

function softmax(values) {
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const sum = exponentials.reduce((a, b) => a + b, 0);
  return exponentials.map((value) => value / sum);
}
function intersectionOverUnion(a, b) {
  const intersection =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1);
  const union =
    (a[2] - a[0] + 1) * (a[3] - a[1] + 1) +
    (b[2] - b[0] + 1) * (b[3] - b[1] + 1) -
    intersection;
  return union > 0 ? intersection / union : 0;
}
const evenRound = (value) =>
  value - Math.floor(value) === 0.5
    ? Math.floor(value) + (Math.floor(value) % 2)
    : Math.round(value);

export function postprocessOutput(data, dims, geometry, config, params = {}) {
  if (
    !Array.isArray(dims) ||
    dims.some((size) => !Number.isInteger(size) || size < 0) ||
    dims.reduce((a, b) => a * b, 1) !== data.length
  )
    throw new Error("output.shape: 输出尺寸与张量长度不匹配");
  if (config.kind === "classification") {
    if (
      !(
        (dims.length === 1 && dims[0] === config.labels.length) ||
        (dims.length === 2 && dims[0] === 1 && dims[1] === config.labels.length)
      )
    )
      throw new Error(
        "output.shape: 分类输出需要 [类别数] 或 [1, 类别数]，且与标签数量一致",
      );
    let scores = Array.from(data);
    if (!scores.every(Number.isFinite))
      throw new Error("output.classification: 分类分数包含非有限数值");
    if (config.activation === "softmax") scores = softmax(scores);
    const classifications = scores
      .map((score, index) => ({ index, label: config.labels[index], score }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, config.topK);
    return { resultKind: "classification", detections: [], classifications };
  }
  const threshold = params.threshold ?? 0.278,
    iou = params.iou ?? 0.7;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    !Number.isFinite(iou) ||
    iou < 0 ||
    iou > 1
  )
    throw new Error("params: 检测阈值必须在 0–1 之间");
  const channels = 4 + config.labels.length;
  const channelAxis = config.layout === "BCN" ? 1 : 2,
    countAxis = config.layout === "BCN" ? 2 : 1;
  if (dims.length !== 3 || dims[0] !== 1 || dims[channelAxis] !== channels)
    throw new Error(
      `output.shape: YOLO 输出需要 ${config.layout}、4 + ${config.labels.length} 个通道（cxcywh + 类别分数）`,
    );
  if (
    config.layout === "BCN" &&
    config.labels.length === 1 &&
    config.activation === "none" &&
    geometry.inputWidth === 640 &&
    geometry.inputHeight === 640
  ) {
    return {
      resultKind: "yolo-detection",
      detections: legacyPostprocess(
        data,
        dims,
        geometry.sourceWidth,
        geometry.sourceHeight,
        threshold,
        iou,
      ).map((item) => ({ ...item, label: config.labels[0] })),
      classifications: [],
    };
  }
  const count = dims[countAxis],
    candidates = [];
  const at = (index, channel) =>
    data[
      config.layout === "BCN"
        ? channel * count + index
        : index * channels + channel
    ];
  for (let index = 0; index < count; index++) {
    let scores = config.labels.map((_, channel) => at(index, channel + 4));
    if (!scores.every(Number.isFinite)) continue;
    if (config.activation === "softmax") scores = softmax(scores);
    let classIndex = 0;
    for (let channel = 1; channel < scores.length; channel++)
      if (scores[channel] > scores[classIndex]) classIndex = channel;
    const score = scores[classIndex];
    if (score <= threshold) continue;
    const cx = at(index, 0),
      cy = at(index, 1),
      width = at(index, 2),
      height = at(index, 3);
    if (
      ![cx, cy, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    )
      continue;
    candidates.push({
      score,
      classIndex,
      box: [cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2],
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  // The version-1 detector retains the existing class-agnostic inclusive NMS.
  for (const candidate of candidates)
    if (
      kept.every(
        (previous) => intersectionOverUnion(previous.box, candidate.box) <= iou,
      )
    )
      kept.push(candidate);
  const detections = kept.map(({ score, classIndex, box }, index) => ({
    id: index + 1,
    label: config.labels[classIndex],
    classIndex,
    score,
    box: box.map((value, axis) => {
      const original =
          axis % 2 === 0 ? geometry.sourceWidth : geometry.sourceHeight,
        input = axis % 2 === 0 ? geometry.inputWidth : geometry.inputHeight;
      return Math.max(
        0,
        Math.min(original, evenRound((value / input) * original)),
      );
    }),
  }));
  return { resultKind: "yolo-detection", detections, classifications: [] };
}
