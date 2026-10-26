// Shared by the editor/document boundary and the standalone inference Worker.
// This contract describes one float32 image tensor and one selected output.
const fail = (path, message) => {
  throw new Error(`${path}: ${message}`);
};
function object(value, path) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(path, "需要普通 JSON 对象");
}
function keys(value, required, path) {
  object(value, path);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !required.includes(key))
      fail(path, "不支持的配置项");
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"))
      fail(`${path}.${key}`, "需要纯 JSON 数据");
  }
  for (const key of required)
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "缺少配置项");
}
function text(value, path, max = 300, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    fail(path, "需要有效文本");
}
function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(path, `需要 ${min}–${max} 之间的整数`);
}
function choice(value, values, path) {
  if (!values.includes(value)) fail(path, "不支持的选项");
}
function array(value, path) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail(path, "需要完整 JSON 数组");
  for (let i = 0; i < value.length; i++)
    if (
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, i) || {}, "value")
    )
      fail(path, "需要完整 JSON 数组");
}
function vector(value, path, positive = false) {
  array(value, path);
  if (
    value.length !== 3 ||
    !value.every((x) => Number.isFinite(x) && (!positive || x > 0))
  )
    fail(path, positive ? "需要 3 个大于零的有限数值" : "需要 3 个有限数值");
}

export const MODEL_MAX_BYTES = 300000000;
export function parseSpaceResourceUrl(url) {
  if (typeof url !== "string" || /[\\?#\u0000-\u0020]/.test(url)) return null;
  const match = /^\/spaces\/([^/]+)\/([^/]+)\/resolve\/([^/]+)\/(.+)$/.exec(
    url,
  );
  if (!match) return null;
  try {
    const [namespace, name, revision, path] = match
      .slice(1)
      .map(decodeURIComponent);
    if (
      [namespace, name].some(
        (value) => !/^[\w.-]+$/.test(value) || value === "." || value === "..",
      )
    )
      return null;
    if (
      [revision, path].some(
        (value) =>
          !value ||
          /[\\%?#\u0000-\u001f]/.test(value) ||
          value
            .split("/")
            .some((part) => !part || part === "." || part === ".."),
      )
    )
      return null;
    return { id: `${namespace}/${name}`, revision, path };
  } catch {
    return null;
  }
}
export function validateResourceUrl(url, legacyRoot) {
  if (parseSpaceResourceUrl(url)) return url;
  if (
    typeof url !== "string" ||
    !url.startsWith(legacyRoot) ||
    /[\\?#\u0000-\u0020]/.test(url)
  )
    fail("resource.url", "请选择当前 Space 仓库中的文件");
  let decoded;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    fail("resource.url", "无效 URL 编码");
  }
  if (
    !decoded.startsWith(legacyRoot) ||
    /[\\%?#\u0000-\u001f]/.test(decoded) ||
    decoded.split("/").some((part) => part === "." || part === "..") ||
    decoded.endsWith("/")
  )
    fail("resource.url", "无效文件路径");
  return url;
}
export function validateModelUrl(url) {
  text(url, "model.url", 1200);
  if (parseSpaceResourceUrl(url)) return url;
  if (!url.startsWith("/models/") || /[\\?#\u0000-\u0020]/.test(url))
    fail("model.url", "需要 /models/ 下的同源文件路径");
  let decoded;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    fail("model.url", "无效 URL 编码");
  }
  // Encoded separators are allowed only when they still form an ordinary
  // local path. Encoded percent is rejected to avoid ambiguous double decoding.
  if (
    !decoded.startsWith("/models/") ||
    /[\\%?#\u0000-\u001f]/.test(decoded) ||
    decoded.split("/").some((part) => part === "." || part === "..")
  )
    fail("model.url", "不允许路径穿越或重复编码");
  if (decoded.endsWith("/")) fail("model.url", "需要模型文件路径");
  return url;
}
export function validateModel(raw) {
  keys(raw, ["id", "label", "url", "bytes", "sha256"], "model");
  text(raw.id, "model.id");
  text(raw.label, "model.label");
  validateModelUrl(raw.url);
  integer(raw.bytes, 1, MODEL_MAX_BYTES, "model.bytes");
  if (typeof raw.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(raw.sha256))
    fail("model.sha256", "需要 64 位 SHA-256 十六进制摘要");
  return {
    id: raw.id,
    label: raw.label,
    url: raw.url,
    bytes: raw.bytes,
    sha256: raw.sha256.toLowerCase(),
  };
}

export function validatePipeline(raw) {
  keys(raw, ["version", "input", "output"], "pipeline");
  if (raw.version !== 1) fail("pipeline.version", "仅支持版本 1");
  const input = raw.input,
    output = raw.output;
  keys(
    input,
    [
      "name",
      "width",
      "height",
      "layout",
      "color",
      "resize",
      "interpolation",
      "scale",
      "mean",
      "std",
    ],
    "pipeline.input",
  );
  text(input.name, "pipeline.input.name", 300, true);
  integer(input.width, 1, 1024, "pipeline.input.width");
  integer(input.height, 1, 1024, "pipeline.input.height");
  choice(input.layout, ["NCHW", "NHWC"], "pipeline.input.layout");
  choice(input.color, ["RGB", "BGR"], "pipeline.input.color");
  choice(input.resize, ["stretch"], "pipeline.input.resize");
  choice(
    input.interpolation,
    ["pillow-bicubic", "pillow-bilinear"],
    "pipeline.input.interpolation",
  );
  if (!Number.isFinite(input.scale))
    fail("pipeline.input.scale", "需要有限缩放系数");
  vector(input.mean, "pipeline.input.mean");
  vector(input.std, "pipeline.input.std", true);
  keys(
    output,
    ["name", "kind", "layout", "labels", "activation", "topK"],
    "pipeline.output",
  );
  text(output.name, "pipeline.output.name", 300, true);
  choice(
    output.kind,
    ["yolo-detection", "classification"],
    "pipeline.output.kind",
  );
  choice(output.layout, ["BCN", "BNC"], "pipeline.output.layout");
  choice(output.activation, ["none", "softmax"], "pipeline.output.activation");
  array(output.labels, "pipeline.output.labels");
  if (output.labels.length < 1 || output.labels.length > 200)
    fail("pipeline.output.labels", "需要 1–200 个标签");
  output.labels.forEach((label, index) =>
    text(label, `pipeline.output.labels[${index}]`, 200),
  );
  integer(output.topK, 1, output.labels.length, "pipeline.output.topK");
  return {
    version: 1,
    input: { ...input, mean: [...input.mean], std: [...input.std] },
    output: { ...output, labels: [...output.labels] },
  };
}
