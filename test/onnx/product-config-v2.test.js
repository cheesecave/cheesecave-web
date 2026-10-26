import { test } from "vitest";
import assert from "node:assert/strict";

import {
  createDefaultDocument,
  validateDocument,
  parseDocument,
  saveDocument,
  loadDocument,
  migrateDocument,
  flattenRules,
  STORAGE_KEY,
} from "../../src/onnx/config/document.js";

import legacy from "./fixtures/legacy-space-v1.json";
import legacyV2 from "./fixtures/legacy-space-v2.json";
const clone = (value) => structuredClone(value);
const actions = (document) =>
  flattenRules(document.ui.rules).filter(
    (rule) => rule.type === "ccActionButton",
  );
const fakeStorage = (initial) => {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test("v3 default has exactly one run-only inference button and one inference per click", () => {
  const document = createDefaultDocument();
  assert.equal(document.schemaVersion, 3);
  assert.equal(document.task.params.repeats, 1);
  assert.equal(actions(document).length, 1);
  assert.equal(actions(document)[0].props.actionId, "run");
  assert.deepEqual(validateDocument(document), document);
  const storage = fakeStorage();
  saveDocument(document, storage);
  assert.deepEqual(loadDocument(storage), document);
});

test("duplicate inference buttons cannot validate, save, or import, including nested duplicates", () => {
  const document = createDefaultDocument();
  document.ui.rules.push({
    type: "ccCard",
    props: { title: "重复按钮" },
    children: [clone(actions(document)[0])],
  });
  assert.throws(() => validateDocument(document));
  assert.throws(() => parseDocument(JSON.stringify(document)));
  const storage = fakeStorage();
  assert.throws(() => saveDocument(document, storage));
  assert.equal(storage.getItem(STORAGE_KEY), null);
  const missing = createDefaultDocument();
  missing.ui.rules = missing.ui.rules.filter(
    (rule) => rule.type !== "ccActionButton",
  );
  assert.throws(() => validateDocument(missing));
});

for (const actionId of [
  "benchmark",
  "reset",
  "release",
  "export",
  "resetParameters",
  "none",
]) {
  test(`inference button cannot change its run-only action to ${actionId}`, () => {
    const document = createDefaultDocument();
    actions(document)[0].props.actionId = actionId;
    assert.throws(() => validateDocument(document));
  });
}

test("ordinary button has a distinct type and supports only none or resetParameters", () => {
  for (const actionId of ["none", "resetParameters"]) {
    const document = createDefaultDocument();
    document.ui.rules.push({
      type: "ccButton",
      props: { actionId, label: "普通按钮", type: "default" },
    });
    validateDocument(document);
    assert.equal(actions(document).length, 1);
  }
  for (const actionId of ["run", "benchmark", "release", "export", "reset"]) {
    const document = createDefaultDocument();
    document.ui.rules.push({
      type: "ccButton",
      props: { actionId, label: "错误按钮" },
    });
    assert.throws(() => validateDocument(document));
  }
});

for (const type of [
  "ccImageInput",
  "ccDetectionResult",
  "ccClassificationResult",
]) {
  test(`${type} requires its own field even when it is not selected in task bindings`, () => {
    const document = createDefaultDocument();
    document.ui.rules.push({ type, props: { title: "未绑定的额外组件" } });
    assert.throws(() => validateDocument(document));
  });
}

test("legacy migration removes obsolete actions recursively while preserving author labels, bindings and layout", () => {
  const original = clone(legacy),
    migrated = migrateDocument(original);
  assert.deepEqual(
    original,
    legacy,
    "migration leaves input snapshot unchanged",
  );
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.task.params.repeats, 1);
  assert.equal(migrated.task.model.id, legacy.task.model);
  assert.equal(migrated.task.pipeline.output.kind, "yolo-detection");
  assert.equal(migrated.name, legacy.name);
  assert.deepEqual(migrated.bindings, legacy.bindings);
  assert.deepEqual(migrated.ui.options, legacy.ui.options);
  assert.equal(actions(migrated).length, 1);
  assert.equal(actions(migrated)[0].props.label, "识别我的图片");
  assert.equal(actions(migrated)[0].props.actionId, "run");
  const operationCard = flattenRules(migrated.ui.rules).find(
    (rule) => rule.type === "ccCard" && rule.props.title === "作者的操作区域",
  );
  assert.equal(operationCard.children.length, 1);
  const expectedUi = clone(legacy.ui);
  flattenRules(expectedUi.rules).find(
    (rule) => rule.field === legacy.bindings.backend,
  ).title = "计算方式";
  const beforeFields = flattenRules(expectedUi.rules).filter(
    (rule) => rule.field,
  );
  const afterFields = flattenRules(migrated.ui.rules).filter(
    (rule) => rule.field,
  );
  assert.deepEqual(afterFields, beforeFields);
  for (const type of ["row", "elTabs"]) {
    assert.deepEqual(
      flattenRules(migrated.ui.rules).find((rule) => rule.type === type),
      flattenRules(expectedUi.rules).find((rule) => rule.type === type),
    );
  }
  assert.deepEqual(
    migrateDocument(migrated),
    migrated,
    "migration is idempotent",
  );
});

test("legacy duplicate runs keep the first authored run label and reduce to a single inference button", () => {
  const document = clone(legacy);
  const duplicate = clone(actions(document)[0]);
  duplicate.props.label = "不要保留的第二个运行按钮";
  document.ui.rules.push(duplicate);
  const migrated = migrateDocument(document);
  assert.equal(actions(migrated).length, 1);
  assert.equal(actions(migrated)[0].props.label, "识别我的图片");
});

test("load upgrades saved v1 in place once and preserves the original JSON backup", () => {
  const raw = JSON.stringify(legacy);
  const storage = fakeStorage({ [STORAGE_KEY]: raw });
  const migrated = loadDocument(storage);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), migrated);
  assert.equal(storage.getItem(STORAGE_KEY + ".backup.v1"), raw);
  assert.deepEqual(loadDocument(storage), migrated);
  assert.equal(storage.getItem(STORAGE_KEY + ".backup.v1"), raw);
});

test("legacy migration validates discarded actions before removal and cannot launder executable content", () => {
  const document = clone(legacy);
  actions(document).find((rule) => rule.props.actionId === "benchmark").on = {
    click: "$EXEC:(()=>{globalThis.unexpected=true})()",
  };
  assert.throws(() => migrateDocument(document));
  assert.throws(() => parseDocument(JSON.stringify(document)));
  const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) });
  assert.throws(() => loadDocument(storage));
  assert.equal(storage.getItem(STORAGE_KEY + ".backup.v1"), null);
});

test("real v2 saved configuration migrates resources to v3 and preserves layout, defaults and its original backup", () => {
  const raw = JSON.stringify(legacyV2),
    storage = fakeStorage({ [STORAGE_KEY]: raw });
  const migrated = loadDocument(storage);
  assert.equal(legacyV2.schemaVersion, 2);
  assert.equal(migrated.schemaVersion, 3);
  const expectedUi = clone(legacyV2.ui);
  flattenRules(expectedUi.rules).find(
    (rule) => rule.field === legacyV2.bindings.backend,
  ).title = "计算方式";
  assert.deepEqual(migrated.ui, expectedUi);
  assert.deepEqual(migrated.bindings, legacyV2.bindings);
  assert.deepEqual(migrated.task.params, legacyV2.task.params);
  assert.equal(migrated.task.model.id, legacyV2.task.model);
  assert.equal(migrated.task.sample.id, legacyV2.task.sample);
  assert.equal(migrated.task.pipeline.output.kind, "yolo-detection");
  assert.equal(storage.getItem(STORAGE_KEY + ".backup.v2"), raw);
  assert.deepEqual(loadDocument(storage), migrated);
  assert.equal(storage.getItem(STORAGE_KEY + ".backup.v2"), raw);
});
