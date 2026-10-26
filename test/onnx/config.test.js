import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createDefaultDocument,
  validateDocument,
  parseDocument,
  saveDocument,
  loadDocument,
  STORAGE_KEY,
} from "../../src/onnx/config/document.js";

test("default config survives JSON save/load without executable values", () => {
  const data = new Map();
  const storage = {
    setItem: (k, v) => data.set(k, v),
    getItem: (k) => data.get(k),
  };
  const doc = createDefaultDocument();
  doc.name = "我的动漫脸部检测";
  saveDocument(doc, storage);
  assert.deepEqual(loadDocument(storage), doc);
  assert.deepEqual(parseDocument(data.get(STORAGE_KEY)), doc);
});

test("renamed image, threshold, backend and output fields remain valid through explicit bindings", () => {
  const doc = createDefaultDocument();
  for (const [key, name] of Object.entries(doc.bindings)) {
    const rule = doc.ui.rules.find((r) => r.field === name);
    rule.field = "custom_" + name;
    doc.bindings[key] = rule.field;
  }
  assert.deepEqual(validateDocument(doc), doc);
});

for (const marker of [
  "[[FORM-CREATE-PREFIX-() => alert(1)-FORM-CREATE-SUFFIX]]",
  "$FN:() => alert(1)",
  "$FNX:alert(1)",
  "$EXEC:alert(1)",
  "$GLOBAL:network",
  "function () {}",
  "() => 1",
]) {
  test(`reject executable serialization: ${marker.slice(0, 20)}`, () => {
    const doc = createDefaultDocument();
    doc.ui.rules[0].props.text = marker;
    assert.throws(() => parseDocument(JSON.stringify(doc)));
  });
}

for (const [key, payload] of Object.entries({
  on: { click: "$FN:() => 1" },
  effect: { fetch: "https://example.com" },
  template: "<img src=x onerror=alert(1)>",
  computed: { value: "globalThis.x=1" },
  inject: true,
  component: "iframe",
  attrs: { innerHTML: "<script/>" },
  hook: { mounted: "function () {}" },
})) {
  test(`reject unsupported runtime escape: ${key}`, () => {
    const doc = createDefaultDocument();
    doc.ui.rules[0][key] = payload;
    assert.throws(() => validateDocument(doc));
  });
}

test("reject remote resources and unknown actions/components before rendering", () => {
  const model = createDefaultDocument();
  model.task.model.url = "https://example.com/model.onnx";
  assert.throws(() => validateDocument(model));
  const action = createDefaultDocument();
  action.ui.rules.find((r) => r.type === "ccActionButton").props.actionId =
    "fetch";
  assert.throws(() => validateDocument(action));
  const rule = createDefaultDocument();
  rule.ui.rules.push({ type: "html", props: { innerHTML: "anything" } });
  assert.throws(() => validateDocument(rule));
});

test("reject prototype pollution, functions, circular references and invalid bindings", () => {
  assert.throws(() => parseDocument('{"__proto__":{"polluted":true}}'));
  const fn = createDefaultDocument();
  fn.ui.rules[0].props.text = () => 1;
  assert.throws(() => validateDocument(fn));
  const circular = createDefaultDocument();
  circular.self = circular;
  assert.throws(() => validateDocument(circular));
  const missing = createDefaultDocument();
  missing.bindings.result = "absent";
  assert.throws(() => validateDocument(missing));
  assert.equal({}.polluted, undefined);
});
