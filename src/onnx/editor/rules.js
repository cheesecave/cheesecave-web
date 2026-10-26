let serial = 0;
const fieldId = (prefix) => `${prefix}_${Date.now().toString(36)}_${++serial}`;
const input = (field, title, props = {}) => ({
  type: "input",
  field,
  title,
  props,
});
const number = (field, title, props = {}) => ({
  type: "inputNumber",
  field,
  title,
  props,
});
const toggle = (field, title) => ({ type: "switch", field, title });
const select = (field, title, values) => ({
  type: "select",
  field,
  title,
  options: values.map((value) =>
    typeof value === "string" ? { label: value, value } : value,
  ),
});
const columns = () => [
  number("formCreateCol>span", "默认列数（24 为整行）", { min: 1, max: 24 }),
  ...["xs", "sm", "md", "lg", "xl"].map((size, i) =>
    number(
      `formCreateCol>${size}`,
      ["窄屏列数", "小屏列数", "中屏列数", "大屏列数", "超宽屏列数"][i],
      { min: 1, max: 24 },
    ),
  ),
];
const simple = (name, label, menu, make, panel, extra = {}) => ({
  name,
  label,
  menu,
  icon: extra.icon || "icon-input",
  event: false,
  validate: false,
  rule: make,
  props: () => [...panel(), ...columns()],
  ...extra,
});

export function createDragRules() {
  return [
    simple(
      "ccImageInput",
      "本地图片",
      "inference",
      () => ({
        type: "ccImageInput",
        field: fieldId("image"),
        props: {
          title: "输入图片",
          description: "选择或拖入图片",
          showSample: true,
        },
      }),
      () => [
        input("title", "图片区标题"),
        input("description", "说明"),
        toggle("showSample", "显示示例按钮"),
      ],
      { input: true, icon: "icon-image" },
    ),
    simple(
      "ccDetectionResult",
      "检测结果",
      "inference",
      () => ({
        type: "ccDetectionResult",
        field: fieldId("result"),
        props: { title: "检测结果", showScores: true },
      }),
      () => [input("title", "结果区标题"), toggle("showScores", "显示置信度")],
      { input: true, icon: "icon-image" },
    ),
    simple(
      "ccClassificationResult",
      "分类结果",
      "inference",
      () => ({
        type: "ccClassificationResult",
        field: fieldId("classification"),
        props: { title: "分类结果", showScores: true },
      }),
      () => [input("title", "结果区标题"), toggle("showScores", "显示置信度")],
      { input: true, icon: "icon-table" },
    ),
    simple(
      "ccActionButton",
      "运行推理",
      "inference",
      () => ({
        type: "ccActionButton",
        props: { actionId: "run", label: "开始检测", type: "primary" },
        col: { span: 24 },
        wrap: { show: false },
      }),
      () => [
        input("label", "按钮文字"),
        select("type", "按钮颜色", [
          "primary",
          "default",
          "success",
          "warning",
          "danger",
          "info",
        ]),
      ],
      { only: true, icon: "icon-button" },
    ),
    simple(
      "ccButton",
      "普通按钮",
      "inputs",
      () => ({
        type: "ccButton",
        props: {
          actionId: "resetParameters",
          label: "重置参数",
          type: "default",
        },
        wrap: { show: false },
      }),
      () => [
        input("label", "按钮文字"),
        select("actionId", "按钮用途", [
          { value: "none", label: "未绑定" },
          { value: "resetParameters", label: "重置参数" },
        ]),
        select("type", "按钮颜色", [
          "primary",
          "default",
          "success",
          "warning",
          "danger",
          "info",
        ]),
      ],
      { icon: "icon-button" },
    ),
    simple(
      "ccInferenceStatus",
      "推理状态",
      "inference",
      () => ({
        type: "ccInferenceStatus",
        props: { title: "运行与测量", showDetails: true, showHistory: true },
      }),
      () => [
        input("title", "状态区标题"),
        toggle("showDetails", "显示详细指标"),
        toggle("showHistory", "显示测量记录"),
      ],
      { icon: "icon-alert" },
    ),
    simple(
      "input",
      "文本输入",
      "inputs",
      () => ({
        type: "input",
        field: fieldId("input"),
        title: "文本输入",
        value: "",
        props: { placeholder: "请输入" },
      }),
      () => [
        input("placeholder", "占位文字"),
        input("formCreateValue", "默认值"),
        select("type", "输入类型", ["text", "textarea"]),
        number("maxlength", "最大字数", { min: 1, max: 5000 }),
        toggle("clearable", "可清空"),
      ],
      { input: true },
    ),
    simple(
      "inputNumber",
      "数值输入",
      "inputs",
      () => ({
        type: "inputNumber",
        field: fieldId("number"),
        title: "数值",
        value: 0.278,
        props: { min: 0, max: 1, step: 0.001, precision: 3 },
      }),
      () => [
        number("formCreateValue", "默认值"),
        number("min", "最小值"),
        number("max", "最大值"),
        number("step", "步长", { min: 0.001 }),
        number("precision", "小数位", { min: 0, max: 6 }),
      ],
      { input: true, icon: "icon-number" },
    ),
    simple(
      "select",
      "选择器",
      "inputs",
      () => ({
        type: "select",
        field: fieldId("select"),
        title: "选择器",
        value: "auto",
        options: [
          { label: "自动选择", value: "auto" },
          { label: "WebGPU", value: "webgpu" },
          { label: "WASM · CPU", value: "wasm" },
        ],
        props: {},
      }),
      () => [
        {
          type: "CcOptionsEditor",
          field: "formCreateOptions",
          title: "静态选项",
        },
        input("formCreateValue", "默认选项值"),
        input("placeholder", "占位文字"),
        toggle("clearable", "可清空"),
        toggle("filterable", "可搜索"),
      ],
      { input: true, icon: "icon-select" },
    ),
    simple(
      "slider",
      "滑块",
      "inputs",
      () => ({
        type: "slider",
        field: fieldId("slider"),
        title: "滑块",
        value: 0.278,
        props: { min: 0, max: 1, step: 0.001, showInput: true },
      }),
      () => [
        number("formCreateValue", "默认值"),
        number("min", "最小值"),
        number("max", "最大值"),
        number("step", "步长", { min: 0.001 }),
        toggle("showInput", "显示数字输入"),
      ],
      { input: true, icon: "icon-slider" },
    ),
    simple(
      "switch",
      "开关",
      "inputs",
      () => ({
        type: "switch",
        field: fieldId("switch"),
        title: "开关",
        value: false,
        props: {},
      }),
      () => [
        toggle("formCreateValue", "默认开启"),
        input("activeText", "开启文字"),
        input("inactiveText", "关闭文字"),
      ],
      { input: true, icon: "icon-switch" },
    ),
    simple(
      "ccHeading",
      "标题",
      "layout",
      () => ({ type: "ccHeading", props: { text: "新的标题", level: 2 } }),
      () => [
        input("text", "标题文字"),
        select(
          "level",
          "标题级别",
          [1, 2, 3, 4, 5, 6].map((value) => ({ value, label: `H${value}` })),
        ),
      ],
      { icon: "icon-title" },
    ),
    simple(
      "ccText",
      "说明文字",
      "layout",
      () => ({ type: "ccText", props: { text: "在这里填写说明。" } }),
      () => [input("text", "说明文字", { type: "textarea", rows: 4 })],
      { icon: "icon-text" },
    ),
    simple(
      "ccCard",
      "卡片",
      "layout",
      () => ({ type: "ccCard", props: { title: "卡片" }, children: [] }),
      () => [input("title", "卡片标题")],
      { drag: true, mask: false, icon: "icon-card" },
    ),
    simple(
      "row",
      "栅格布局",
      "layout",
      () => ({ type: "row", props: { gutter: 20 }, children: [] }),
      () => [number("gutter", "列间距", { min: 0, max: 64 })],
      { children: "col", childrenLen: 2, mask: false, icon: "icon-row" },
    ),
    simple(
      "col",
      "列",
      null,
      () => ({
        type: "col",
        props: { span: 12, xs: 24, md: 12 },
        children: [],
      }),
      () => [
        number("span", "列宽", { min: 1, max: 24 }),
        number("xs", "窄屏列宽", { min: 1, max: 24 }),
        number("md", "桌面列宽", { min: 1, max: 24 }),
      ],
      { drag: true, inside: true, dragBtn: false, mask: false },
    ),
    simple(
      "elTabs",
      "标签页",
      "layout",
      () => ({ type: "elTabs", props: { type: "border-card" }, children: [] }),
      () => [
        select("type", "标签样式", ["", "card", "border-card"]),
        toggle("stretch", "均分标签宽度"),
      ],
      { children: "elTabPane", childrenLen: 2, mask: false, icon: "icon-tab" },
    ),
    simple(
      "elTabPane",
      "选项卡",
      null,
      () => ({
        type: "elTabPane",
        props: { label: "选项卡", name: fieldId("tab") },
        children: [],
      }),
      () => [input("label", "标签文字"), input("name", "标签标识")],
      { drag: true, inside: true, dragBtn: false, mask: false },
    ),
  ];
}

export const designerConfig = {
  showSaveBtn: false,
  showPreviewBtn: false,
  showJsonPreview: false,
  showInputData: false,
  showAi: false,
  showLanguage: false,
  showControl: false,
  showCustomProps: false,
  showEventForm: false,
  showValidateForm: false,
  showStyleForm: false,
  showComponentName: false,
  showDevice: true,
  switchType: false,
  hotKey: false,
  exitConfirm: false,
  baseRule: () => [
    input("field", "字段标识"),
    input("title", "表单标签"),
    input("info", "帮助文字"),
  ],
  formOptions: {
    form: { labelPosition: "top", labelWidth: "120px" },
    submitBtn: false,
    resetBtn: false,
  },
  checkDrag: ({ menu, toMenu }) => {
    if (toMenu?.name === "row") return menu.name === "col";
    if (toMenu?.name === "elTabs") return menu.name === "elTabPane";
    return true;
  },
};
