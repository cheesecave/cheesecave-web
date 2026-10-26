import { test } from "vitest";
import assert from "node:assert/strict";
import {
  modelFacts,
  applyModelFacts,
} from "../../src/onnx/editor/model-facts.js";
import {
  parseSpaceResourceUrl,
  validateModelUrl,
  validateResourceUrl,
} from "../../src/onnx/engine/pipeline-config.js";
import defaultTask from "../../src/onnx/config/default-task.json" with { type: "json" };
const pipeline = () => structuredClone(defaultTask.pipeline);
const metadata = (
  shape = ["batch", 3, 384, 384],
  outputs = [{ name: "scores", type: "float32", shape: ["batch", 2] }],
) => ({
  inputs: [{ name: "pixels", type: "float32", shape }],
  outputs,
  metadata: { externalData: false },
});

test("fixed dimensions and single IO names override stale saved fields", () => {
  const config = pipeline();
  config.output.kind = "classification";
  config.output.labels = ["anime", "real"];
  const facts = applyModelFacts(metadata(), config);
  assert.equal(facts.error, "");
  assert.equal(config.input.name, "pixels");
  assert.equal(config.output.name, "scores");
  assert.equal(config.input.width, 384);
  assert.equal(config.input.height, 384);
  assert.equal(config.input.layout, "NCHW");
});
test("dynamic dimensions remain authored while known dimensions are derived", () => {
  const config = pipeline();
  const data = metadata(
    ["batch", 3, "height", "width"],
    [{ name: "boxes", type: "float32", shape: ["batch", 5, "anchors"] }],
  );
  config.input.width = 512;
  config.input.height = 320;
  const facts = applyModelFacts(data, config);
  assert.equal(facts.width, null);
  assert.equal(facts.height, null);
  assert.equal(config.input.width, 512);
  assert.equal(config.input.height, 320);
  assert.equal(facts.autoLayout, null);
  assert.equal(facts.autoOutputLayout, null);
  assert.equal(facts.error, "");
});
test("NHWC fixed shape derives rectangular dimensions and ambiguous layout stays configurable", () => {
  const config = pipeline();
  applyModelFacts(metadata([1, 224, 320, 3]), config);
  assert.equal(config.input.layout, "NHWC");
  assert.equal(config.input.width, 320);
  assert.equal(config.input.height, 224);
  assert.equal(modelFacts(metadata([1, 3, 224, 3]), config).autoLayout, null);
  const ambiguous = metadata([1, 3, 224, "channels"]);
  config.input.layout = "NHWC";
  applyModelFacts(ambiguous, config);
  assert.equal(modelFacts(ambiguous, config).autoLayout, null);
  assert.equal(config.input.layout, "NHWC");
});
test("multiple outputs require actual selection and do not carry a stale output name", () => {
  const config = pipeline();
  config.output.kind = "classification";
  config.output.labels = ["a", "b"];
  const data = metadata();
  data.outputs.push({ ...data.outputs[0], name: "other" });
  assert.match(applyModelFacts(data, config).error, /请选择/);
  assert.equal(config.output.name, "");
  config.output.name = "other";
  assert.equal(modelFacts(data, config).error, "");
});
test("incompatible model contracts are identified before saving", () => {
  for (const mutate of [
    (data) => (data.metadata.externalData = true),
    (data) => data.inputs.push(data.inputs[0]),
    (data) => (data.inputs[0].type = "int64"),
    (data) => (data.inputs[0].shape = [1, 3]),
    (data) => (data.inputs[0].shape[0] = 2),
    (data) => (data.inputs[0].shape[2] = 2048),
  ]) {
    const data = metadata();
    mutate(data);
    assert.notEqual(modelFacts(data, pipeline()).error, "");
  }
  assert.match(modelFacts(metadata(), pipeline()).error, /输出类型/);
  const config = pipeline();
  config.output.kind = "classification";
  assert.match(modelFacts(metadata(), config).error, /类别标签/);
  for (const shape of [
    [1, 3, 0, 384],
    [0, 3, 384, 384],
    [1, 3, -1, 384],
  ])
    assert.match(modelFacts(metadata(shape), config).error, /固定维度/);
  const data = metadata();
  data.outputs[0].shape = [1, 0];
  assert.match(modelFacts(data, config).error, /固定维度/);
});
test("Space resolve URLs retain repository, revision and unicode path without opening arbitrary endpoints", () => {
  const url =
    "/spaces/local/browser-demo/resolve/main/models/%E6%A8%A1%E5%9E%8B.onnx";
  assert.deepEqual(parseSpaceResourceUrl(url), {
    id: "local/browser-demo",
    revision: "main",
    path: "models/模型.onnx",
  });
  assert.equal(validateModelUrl(url), url);
  assert.equal(
    validateResourceUrl(
      "/spaces/local/browser-demo/resolve/main/examples/image.png",
      "/assets/",
    ),
    "/spaces/local/browser-demo/resolve/main/examples/image.png",
  );
  for (const value of [
    "/spaces/a/b/resolve/main/../secrets",
    "/spaces/a/b/resolve/main/%2e%2e/secrets",
    "/spaces/a/b/resolve/main/%252e%252e/secrets",
    "/spaces/a/b/resolve/main/a?token=x",
    "/spaces/a/b/resolve/main/a%5Cb",
    "https://example.com/model.onnx",
    "//example.com/a",
    "/api/admin",
  ]) {
    assert.equal(parseSpaceResourceUrl(value), null);
    assert.throws(() => validateModelUrl(value));
  }
});
