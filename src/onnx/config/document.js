// Persisted documents are data only. Never pass imported text to FormCreate.parseJson.
import DEFAULT_TASK from "./default-task.json" with { type: "json" };
import {
  validateModel,
  validatePipeline,
  validateResourceUrl,
} from "../engine/pipeline-config.js";
export const STORAGE_KEY = "cheesecave.space-demo.document.v1";
// Legacy IDs are used only when upgrading old documents, never for dispatching models.
export const MODEL_CATALOG = [DEFAULT_TASK.model];
export const SAMPLE_CATALOG = [DEFAULT_TASK.sample];
export const PRESET_CATALOG = [
  {
    id: "anime-face-v1",
    version: 1,
    label: "动漫脸部检测",
    description: "640 × 640 RGB → ONNX → NMS → 原图检测框",
  },
];
export const ACTIONS = ["run"];
const LEGACY_ACTIONS = ["run", "benchmark", "reset", "release", "export"];
export const BACKENDS = ["auto", "webgpu", "wasm"];

const propsByType = {
  ccImageInput: ["title", "description", "showSample"],
  ccDetectionResult: ["title", "showScores"],
  ccClassificationResult: ["title", "showScores"],
  ccActionButton: ["actionId", "label", "type"],
  ccButton: ["actionId", "label", "type", "disabled"],
  ccInferenceStatus: ["title", "showDetails", "showHistory"],
  ccHeading: ["text", "level"],
  ccText: ["text"],
  ccCard: ["title"],
  input: [
    "placeholder",
    "disabled",
    "clearable",
    "maxlength",
    "showWordLimit",
    "type",
    "rows",
  ],
  inputNumber: [
    "min",
    "max",
    "step",
    "precision",
    "disabled",
    "controlsPosition",
  ],
  slider: ["min", "max", "step", "showInput", "showStops", "disabled"],
  select: ["placeholder", "disabled", "clearable", "filterable", "multiple"],
  switch: ["disabled", "activeText", "inactiveText"],
  row: ["gutter", "justify", "align"],
  col: ["span", "offset", "xs", "sm", "md", "lg", "xl"],
  elTabs: ["type", "tabPosition", "stretch"],
  elTabPane: ["label", "name", "disabled", "lazy"],
};
export const ALLOWED_COMPONENTS = Object.keys(propsByType);
const containers = new Set(["row", "col", "ccCard", "elTabs", "elTabPane"]);
const ruleKeys = [
  "type",
  "field",
  "title",
  "info",
  "value",
  "props",
  "options",
  "children",
  "col",
  "wrap",
  "display",
  "hidden",
];
const bannedKeys = new Set(["__proto__", "prototype", "constructor"]);
const functionMarker =
  /\[\[FORM-CREATE-PREFIX-|\$FN:|\$FNX:|\$EXEC:|\$GLOBAL:|^\s*(?:async\s+)?function\b|^\s*(?:\([^)]*\)|[a-z_$][\w$]*)\s*=>/i;
const clone = (value) => JSON.parse(JSON.stringify(value));
function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}
function object(value, path) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(path, "需要普通对象");
}
function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`${path}.${key}`, "不支持的配置项");
}
function text(value, path, max = 5000) {
  if (typeof value !== "string" || value.length > max)
    fail(path, "需要有效文本");
}
function choice(value, values, path) {
  if (!values.includes(value)) fail(path, "不支持的选项");
}
function number(value, min, max, path) {
  if (!Number.isFinite(value) || value < min || value > max)
    fail(path, `需要 ${min}–${max} 之间的数值`);
}
function pure(value, path = "document", depth = 0) {
  if (depth > 30) fail(path, "配置嵌套过深");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "数值必须有限");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 20000 || functionMarker.test(value))
      fail(path, "不支持函数或可执行字符串");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) fail(path, "数组过长");
    value.forEach((v, i) => pure(v, `${path}[${i}]`, depth + 1));
    return;
  }
  object(value, path);
  for (const [key, val] of Object.entries(value)) {
    if (bannedKeys.has(key)) fail(path, "不支持的对象键");
    pure(val, `${path}.${key}`, depth + 1);
  }
}
const booleanProps = new Set([
  "disabled",
  "clearable",
  "filterable",
  "multiple",
  "showWordLimit",
  "showInput",
  "showStops",
  "showSample",
  "showScores",
  "showDetails",
  "showHistory",
  "stretch",
  "lazy",
]);
const numberProps = new Set([
  "min",
  "max",
  "step",
  "precision",
  "maxlength",
  "rows",
  "span",
  "offset",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "gutter",
]);
function validateProps(type, props, path, legacy) {
  keys(props, propsByType[type], path);
  for (const [key, value] of Object.entries(props)) {
    if (booleanProps.has(key)) {
      if (typeof value !== "boolean") fail(`${path}.${key}`, "需要布尔值");
    } else if (numberProps.has(key))
      number(value, -1000000, 1000000, `${path}.${key}`);
    else if (key === "level")
      choice(value, [1, 2, 3, 4, 5, 6], `${path}.${key}`);
    else text(value, `${path}.${key}`);
  }
  if (type === "ccActionButton")
    choice(
      props.actionId,
      legacy ? LEGACY_ACTIONS : ACTIONS,
      `${path}.actionId`,
    );
  if (type === "ccButton")
    choice(props.actionId, ["none", "resetParameters"], `${path}.actionId`);
  if (["ccActionButton", "ccButton"].includes(type) && props.type != null)
    choice(
      props.type,
      ["", "default", "primary", "success", "warning", "danger", "info"],
      `${path}.type`,
    );
  if (type === "input" && props.type != null)
    choice(props.type, ["text", "textarea"], `${path}.type`);
  if (type === "elTabs" && props.type != null)
    choice(props.type, ["", "card", "border-card"], `${path}.type`);
  if (type === "elTabs" && props.tabPosition != null)
    choice(
      props.tabPosition,
      ["top", "right", "bottom", "left"],
      `${path}.tabPosition`,
    );
  for (const key of ["span", "offset", "xs", "sm", "md", "lg", "xl"])
    if (props[key] != null) number(props[key], 0, 24, `${path}.${key}`);
  if (props.step != null && props.step <= 0)
    fail(`${path}.step`, "步长必须大于零");
  if (props.min != null && props.max != null && props.min > props.max)
    fail(path, "最小值不能大于最大值");
}
export function flattenRules(rules) {
  return rules.flatMap((rule) => [rule, ...flattenRules(rule.children || [])]);
}
function validateRules(rules, legacy) {
  if (!Array.isArray(rules) || rules.length > 100)
    fail("ui.rules", "需要最多 100 个组件");
  const all = flattenRules(rules);
  if (all.length > 100) fail("ui.rules", "最多 100 个组件");
  const fields = new Map();
  for (const [index, rule] of all.entries()) {
    const path = `ui.rules[${index}]`;
    keys(rule, ruleKeys, path);
    choice(rule.type, ALLOWED_COMPONENTS, `${path}.type`);
    if (
      ["ccImageInput", "ccDetectionResult", "ccClassificationResult"].includes(
        rule.type,
      ) &&
      rule.field == null
    )
      fail(`${path}.field`, "图片与结果组件需要独立字段");
    if (rule.field != null) {
      if (
        typeof rule.field !== "string" ||
        !/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(rule.field) ||
        bannedKeys.has(rule.field)
      )
        fail(`${path}.field`, "字段需要字母、数字和下划线");
      if (fields.has(rule.field))
        fail(`${path}.field`, `字段 ${rule.field} 重复`);
      fields.set(rule.field, rule);
    }
    for (const key of ["title", "info"])
      if (rule[key] != null) text(rule[key], `${path}.${key}`);
    if (
      rule.value !== undefined &&
      rule.value !== null &&
      !["string", "number", "boolean"].includes(typeof rule.value) &&
      !(
        Array.isArray(rule.value) &&
        rule.value.every((v) =>
          ["string", "number", "boolean"].includes(typeof v),
        )
      )
    )
      fail(`${path}.value`, "仅支持简单默认值");
    if (rule.props)
      validateProps(rule.type, rule.props, `${path}.props`, legacy);
    else if (["ccActionButton", "ccButton"].includes(rule.type))
      fail(path, "按钮需要指定用途");
    if (rule.children) {
      if (!containers.has(rule.type)) fail(path, "此组件不接受子组件");
      if (!Array.isArray(rule.children)) fail(path, "children 需要数组");
    }
    if (rule.type === "row" && rule.children?.some((c) => c.type !== "col"))
      fail(path, "栅格内只可放置列");
    if (
      rule.type === "elTabs" &&
      rule.children?.some((c) => c.type !== "elTabPane")
    )
      fail(path, "标签页内只可放置选项卡");
    for (const key of ["display", "hidden"])
      if (rule[key] != null && typeof rule[key] !== "boolean")
        fail(`${path}.${key}`, "需要布尔值");
    if (rule.col) {
      keys(
        rule.col,
        ["span", "xs", "sm", "md", "lg", "xl", "offset"],
        `${path}.col`,
      );
      Object.entries(rule.col).forEach(([k, v]) =>
        number(v, 0, 24, `${path}.col.${k}`),
      );
    }
    if (rule.wrap) {
      keys(rule.wrap, ["show", "labelWidth"], `${path}.wrap`);
      if (rule.wrap.show != null && typeof rule.wrap.show !== "boolean")
        fail(path, "wrap.show 需要布尔值");
      if (rule.wrap.labelWidth != null) text(rule.wrap.labelWidth, path, 16);
    }
    if (rule.options) {
      if (rule.type !== "select" || !Array.isArray(rule.options))
        fail(path, "仅选择器支持静态选项");
      for (const option of rule.options) {
        keys(option, ["label", "value", "disabled"], `${path}.options`);
        text(option.label, path, 200);
        if (!["string", "number", "boolean"].includes(typeof option.value))
          fail(path, "选项值需要简单值");
        if (option.disabled != null && typeof option.disabled !== "boolean")
          fail(path, "disabled 需要布尔值");
      }
    }
  }
  return fields;
}
function validateLegacyVersion(raw, legacy = false) {
  pure(raw);
  keys(raw, ["schemaVersion", "name", "ui", "task", "bindings"], "document");
  if (raw.schemaVersion !== (legacy ? 1 : 2))
    fail("schemaVersion", "不支持的配置版本");
  text(raw.name, "name", 120);
  keys(raw.ui, ["rules", "options"], "ui");
  const fields = validateRules(raw.ui.rules, legacy);
  keys(raw.ui.options, ["form", "submitBtn", "resetBtn"], "ui.options");
  if (raw.ui.options.submitBtn !== false || raw.ui.options.resetBtn !== false)
    fail("ui.options", "使用平台操作按钮");
  keys(
    raw.ui.options.form,
    ["labelPosition", "labelWidth", "size"],
    "ui.options.form",
  );
  choice(
    raw.ui.options.form.labelPosition,
    ["top", "left", "right"],
    "ui.options.form.labelPosition",
  );
  if (
    raw.ui.options.form.labelWidth != null &&
    !/^\d{1,3}px$/.test(raw.ui.options.form.labelWidth)
  )
    fail("ui.options.form.labelWidth", "使用像素标签宽度");
  if (raw.ui.options.form.size != null)
    choice(
      raw.ui.options.form.size,
      ["small", "default", "large"],
      "ui.options.form.size",
    );
  keys(raw.task, ["preset", "version", "model", "sample", "params"], "task");
  if (raw.task.preset !== "anime-face-v1" || raw.task.version !== 1)
    fail("task", "不支持的任务预设版本");
  choice(
    raw.task.model,
    MODEL_CATALOG.map((x) => x.id),
    "task.model",
  );
  choice(
    raw.task.sample,
    SAMPLE_CATALOG.map((x) => x.id),
    "task.sample",
  );
  keys(
    raw.task.params,
    ["threshold", "backend", "iou", "repeats"],
    "task.params",
  );
  number(raw.task.params.threshold, 0, 1, "task.params.threshold");
  number(raw.task.params.iou, 0, 1, "task.params.iou");
  choice(raw.task.params.backend, BACKENDS, "task.params.backend");
  choice(raw.task.params.repeats, legacy ? [10] : [1], "task.params.repeats");
  keys(raw.bindings, ["image", "threshold", "backend", "result"], "bindings");
  const expected = {
    image: ["ccImageInput"],
    threshold: ["slider", "inputNumber"],
    backend: ["select"],
    result: ["ccDetectionResult"],
  };
  for (const [key, types] of Object.entries(expected)) {
    const target = fields.get(raw.bindings[key]);
    if (!target || !types.includes(target.type))
      fail(`bindings.${key}`, "请选择匹配的界面组件");
    if (target.hidden || target.display === false)
      fail(`bindings.${key}`, "绑定组件需要可见");
  }
  const backend = fields.get(raw.bindings.backend);
  if (backend.props?.multiple) fail("bindings.backend", "计算方式必须单选");
  if (
    !backend.options?.length ||
    backend.options.some((o) => !BACKENDS.includes(o.value))
  )
    fail("bindings.backend", "计算方式选项只能使用 auto、webgpu、wasm");
  if (backend.value != null)
    choice(backend.value, BACKENDS, "bindings.backend.value");
  const threshold = fields.get(raw.bindings.threshold);
  if (threshold.value != null)
    number(threshold.value, 0, 1, "bindings.threshold.value");
  if (threshold.props?.min != null)
    number(threshold.props.min, 0, 1, "bindings.threshold.min");
  if (threshold.props?.max != null)
    number(threshold.props.max, 0, 1, "bindings.threshold.max");
  const inferenceButtons = flattenRules(raw.ui.rules).filter(
    (r) => r.type === "ccActionButton" && r.props.actionId === "run",
  );
  if (!inferenceButtons.length) fail("ui.rules", "需要一个运行推理按钮");
  if (!legacy && inferenceButtons.length !== 1)
    fail("ui.rules", "同一任务只能有一个运行推理按钮");
  return clone(raw);
}
export function validateTask(task) {
  pure(task, "task");
  keys(
    task,
    ["preset", "version", "model", "sample", "pipeline", "params", "labelFile"],
    "task",
  );
  if (task.preset !== "image-inference-v1" || task.version !== 1)
    fail("task", "不支持的任务版本");
  validateModel(task.model);
  validatePipeline(task.pipeline);
  if (task.sample !== null) {
    keys(task.sample, ["id", "label", "url"], "task.sample");
    text(task.sample.id, "task.sample.id", 100);
    text(task.sample.label, "task.sample.label", 200);
    validateResourceUrl(task.sample.url, "/assets/");
  }
  if (task.labelFile != null) {
    text(task.labelFile, "task.labelFile", 1200);
    validateResourceUrl(task.labelFile, "/models/");
  }
  keys(task.params, ["threshold", "backend", "iou", "repeats"], "task.params");
  number(task.params.threshold, 0, 1, "task.params.threshold");
  number(task.params.iou, 0, 1, "task.params.iou");
  choice(task.params.backend, BACKENDS, "task.params.backend");
  choice(task.params.repeats, [1], "task.params.repeats");
  return clone(task);
}
function validateVersion(raw) {
  pure(raw);
  keys(raw, ["schemaVersion", "name", "ui", "task", "bindings"], "document");
  if (raw.schemaVersion !== 3) fail("schemaVersion", "不支持的配置版本");
  text(raw.name, "name", 120);
  keys(raw.ui, ["rules", "options"], "ui");
  const fields = validateRules(raw.ui.rules, false);
  keys(raw.ui.options, ["form", "submitBtn", "resetBtn"], "ui.options");
  if (raw.ui.options.submitBtn !== false || raw.ui.options.resetBtn !== false)
    fail("ui.options", "使用平台操作按钮");
  keys(
    raw.ui.options.form,
    ["labelPosition", "labelWidth", "size"],
    "ui.options.form",
  );
  choice(
    raw.ui.options.form.labelPosition,
    ["top", "left", "right"],
    "ui.options.form.labelPosition",
  );
  if (
    raw.ui.options.form.labelWidth != null &&
    !/^\d{1,3}px$/.test(raw.ui.options.form.labelWidth)
  )
    fail("ui.options.form.labelWidth", "使用像素标签宽度");
  if (raw.ui.options.form.size != null)
    choice(
      raw.ui.options.form.size,
      ["small", "default", "large"],
      "ui.options.form.size",
    );
  validateTask(raw.task);
  keys(raw.bindings, ["image", "threshold", "backend", "result"], "bindings");
  const classification = raw.task.pipeline.output.kind === "classification";
  const expected = {
    image: ["ccImageInput"],
    backend: ["select"],
    result: [classification ? "ccClassificationResult" : "ccDetectionResult"],
  };
  if (!classification || raw.bindings.threshold != null)
    expected.threshold = ["slider", "inputNumber"];
  for (const [key, types] of Object.entries(expected)) {
    const target = fields.get(raw.bindings[key]);
    if (!target || !types.includes(target.type))
      fail(`bindings.${key}`, "请选择匹配的界面组件");
    if (target.hidden || target.display === false)
      fail(`bindings.${key}`, "绑定组件需要可见");
  }
  const backend = fields.get(raw.bindings.backend);
  if (
    backend.props?.multiple ||
    !backend.options?.length ||
    backend.options.some((o) => !BACKENDS.includes(o.value))
  )
    fail("bindings.backend", "计算方式使用 auto、webgpu、wasm 单选");
  if (backend.value != null)
    choice(backend.value, BACKENDS, "bindings.backend.value");
  const threshold = fields.get(raw.bindings.threshold);
  if (threshold?.value != null)
    number(threshold.value, 0, 1, "bindings.threshold.value");
  for (const key of ["min", "max"])
    if (threshold?.props?.[key] != null)
      number(threshold.props[key], 0, 1, `bindings.threshold.${key}`);
  if (
    flattenRules(raw.ui.rules).filter((r) => r.type === "ccActionButton")
      .length !== 1
  )
    fail("ui.rules", "同一任务只能有一个运行推理按钮");
  const document = clone(raw);
  // Update the former built-in label in saved/imported designs without renaming custom titles.
  const computing = flattenRules(document.ui.rules).find(
    (rule) => rule.field === document.bindings.backend,
  );
  if (computing?.title === "执行后端") computing.title = "计算方式";
  return document;
}
export function migrateDocument(raw) {
  if (raw?.schemaVersion === 3) return validateVersion(raw);
  const document = validateLegacyVersion(raw, raw?.schemaVersion === 1);
  let keptRun = false;
  const upgradeRules = (rules) =>
    rules.flatMap((rule) => {
      if (rule.type === "ccActionButton") {
        if (rule.props.actionId !== "run" || keptRun) return [];
        keptRun = true;
      }
      if (rule.children) rule.children = upgradeRules(rule.children);
      return [rule];
    });
  document.ui.rules = upgradeRules(document.ui.rules);
  document.schemaVersion = 3;
  document.task = {
    ...clone(DEFAULT_TASK),
    params: { ...document.task.params, repeats: 1 },
  };
  return validateVersion(document);
}
export function validateDocument(raw) {
  return migrateDocument(raw);
}
// This adapter is only for FcDesigner.getRule(), never for imported documents.
// These are upstream designer IDs and inert display defaults, not runtime behavior.
export function cleanDesignerRules(rules) {
  return rules.map((rule) => {
    const result = {};
    for (const [key, value] of Object.entries(rule)) {
      if (["_fc_id", "_fc_drag_tag", "name", "$required"].includes(key))
        continue;
      if (
        ["effect", "computed", "on", "hook", "control"].includes(key) &&
        value &&
        typeof value === "object" &&
        Object.keys(value).length === 0
      )
        continue;
      if (key === "children" && Array.isArray(value)) {
        if (value.length || containers.has(rule.type))
          result.children = cleanDesignerRules(value);
        continue;
      }
      if (value !== undefined) result[key] = value;
    }
    return result;
  });
}
export function createDefaultDocument(task = DEFAULT_TASK) {
  const configured = validateTask(task),
    classification = configured.pipeline.output.kind === "classification";
  const document = {
    schemaVersion: 3,
    name: configured.model.label,
    task: configured,
    bindings: {
      image: "image",
      threshold: "threshold",
      backend: "backend",
      result: "detections",
    },
    ui: {
      options: {
        form: { labelPosition: "top", labelWidth: "120px", size: "default" },
        submitBtn: false,
        resetBtn: false,
      },
      rules: [
        {
          type: "ccHeading",
          props: {
            text: classification
              ? "查看图片的分类结果"
              : "发现画面中的每一张脸",
            level: 2,
          },
        },
        {
          type: "ccText",
          props: {
            text: classification
              ? "选择图片，运行模型，查看各类别的分数。"
              : "选择图片，调整置信度，然后开始检测。",
          },
        },
        {
          type: "ccImageInput",
          field: "image",
          props: {
            title: "输入图片",
            description: "选择或拖入图片，也可以使用示例",
            showSample: true,
          },
        },
        ...(!classification
          ? [
              {
                type: "slider",
                field: "threshold",
                title: "置信度阈值",
                value: configured.params.threshold,
                col: { span: 14, xs: 24 },
                props: { min: 0.01, max: 1, step: 0.001, showInput: true },
              },
            ]
          : []),
        {
          type: "select",
          field: "backend",
          title: "计算方式",
          value: configured.params.backend,
          col: { span: classification ? 24 : 10, xs: 24 },
          options: [
            { label: "自动选择", value: "auto" },
            { label: "WebGPU", value: "webgpu" },
            { label: "WASM · CPU", value: "wasm" },
          ],
          props: {},
        },
        {
          type: "ccActionButton",
          props: { actionId: "run", label: "运行推理", type: "primary" },
          col: { span: 24 },
          wrap: { show: false },
        },
        {
          type: classification ? "ccClassificationResult" : "ccDetectionResult",
          field: classification ? "classifications" : "detections",
          props: {
            title: classification ? "分类结果" : "检测结果",
            showScores: true,
          },
        },
        {
          type: "ccInferenceStatus",
          props: { title: "运行与测量", showDetails: true, showHistory: true },
        },
      ],
    },
  };
  if (classification) {
    delete document.bindings.threshold;
    document.bindings.result = "classifications";
  }
  return document;
}
// Drafts become runnable only after a repository model has been inspected.
export function createEmptyDocument() {
  const document = createDefaultDocument();
  document.name = "模型演示";
  document.task.model = { id: "", label: "", url: "", bytes: 0, sha256: "" };
  document.task.sample = null;
  document.task.pipeline.input.name = "";
  document.task.pipeline.output.name = "";
  document.task.pipeline.output.labels = [""];
  document.ui.rules.find((rule) => rule.type === "ccHeading").props.text =
    document.name;
  return document;
}
export function parseDocument(json) {
  if (typeof json !== "string" || json.length > 250000)
    fail("document", "JSON 文件过大");
  return validateDocument(JSON.parse(json));
}
export function loadDocument(storage = globalThis.localStorage) {
  const json = storage?.getItem(STORAGE_KEY);
  if (!json) return validateDocument(createDefaultDocument());
  const document = parseDocument(json);
  const version = JSON.parse(json).schemaVersion;
  if (version < 3) {
    if (!storage.getItem(STORAGE_KEY + ".backup.v" + version))
      storage.setItem(STORAGE_KEY + ".backup.v" + version, json);
    storage.setItem(STORAGE_KEY, JSON.stringify(document));
  }
  return document;
}
export function saveDocument(document, storage = globalThis.localStorage) {
  const value = validateDocument(document);
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
  return value;
}
