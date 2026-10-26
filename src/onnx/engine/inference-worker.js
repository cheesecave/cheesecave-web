import {
  preprocessImage,
  postprocessOutput,
  inputDimensions,
} from "./generic-pipeline.js";
import { validateModel, validatePipeline } from "./pipeline-config.js";
let session, ort, actualBackend, initInfo, inputPixels, inputWidth, inputHeight;
let modelConfig, pipelineConfig, inputName, outputName, inputShape;
let firstInferenceMs = null,
  validate = false;
const send = (type, payload) => self.postMessage({ type, ...payload });
function runtimeResources() {
  const entries = performance
    .getEntriesByType("resource")
    .filter((e) => e.name.includes("/vendor/"));
  return {
    runtimeTransferredBytes: entries.reduce(
      (sum, e) => sum + e.transferSize,
      0,
    ),
    runtimeDecodedBytes: entries.reduce((sum, e) => sum + e.decodedBodySize, 0),
    runtimeResources: entries.map((e) => ({
      name: e.name.split("/").pop(),
      transferredBytes: e.transferSize,
      decodedBytes: e.decodedBodySize,
    })),
  };
}
async function verifyModel(modelBytes, modelFetchMs) {
  if (
    !(modelBytes instanceof ArrayBuffer) ||
    modelBytes.byteLength !== modelConfig.bytes
  )
    throw new Error("模型大小与配置不匹配");
  const buffer = new Uint8Array(modelBytes);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== modelConfig.sha256) throw new Error("模型 SHA-256 校验失败");
  return {
    buffer,
    modelFetchMs,
    modelBytes: buffer.byteLength,
    modelTransferredBytes: null,
  };
}
function selectedName(configured, names, kind) {
  if (!configured) {
    if (names.length !== 1)
      throw new Error(`pipeline.${kind}.name: 多个张量时需要明确指定名称`);
    return names[0];
  }
  if (!names.includes(configured))
    throw new Error(`pipeline.${kind}.name: 模型不包含张量 ${configured}`);
  return configured;
}
function configureSession() {
  inputName = selectedName(
    pipelineConfig.input.name,
    session.inputNames,
    "input",
  );
  outputName = selectedName(
    pipelineConfig.output.name,
    session.outputNames,
    "output",
  );
  if (session.inputNames.length !== 1)
    throw new Error("pipeline.input: 当前图像流程需要单个图像输入张量");
  inputShape = inputDimensions(pipelineConfig.input);
  const inputMetadata = session.inputMetadata.find(
    (item) => item.name === inputName,
  );
  const outputMetadata = session.outputMetadata.find(
    (item) => item.name === outputName,
  );
  if (!inputMetadata?.isTensor || inputMetadata.type !== "float32")
    throw new Error("pipeline.input: 当前流程仅支持 float32 张量");
  if (!outputMetadata?.isTensor || outputMetadata.type !== "float32")
    throw new Error("pipeline.output: 当前流程仅支持 float32 张量");
  if (
    inputMetadata.shape.length &&
    (inputMetadata.shape.length !== inputShape.length ||
      inputMetadata.shape.some(
        (size, axis) =>
          typeof size === "number" && size > 0 && size !== inputShape[axis],
      ))
  )
    throw new Error(
      `pipeline.input: 配置 ${inputShape.join(" × ")} 与模型输入 ${inputMetadata.shape.join(" × ")} 不匹配`,
    );
}
async function initialize(
  backend,
  validation,
  model,
  pipeline,
  modelBytes,
  modelFetchMs,
) {
  if (!["auto", "webgpu", "wasm"].includes(backend))
    throw new Error("不支持的计算方式");
  modelConfig = validateModel(model);
  pipelineConfig = validatePipeline(pipeline);
  await session?.release();
  session = null;
  inputPixels = null;
  validate = validation;
  firstInferenceMs = null;
  const modelData = await verifyModel(modelBytes, modelFetchMs);
  let adapterInfo = null;
  const start = performance.now();
  let choice = backend;
  if (backend !== "wasm" && navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (adapter) {
      const info = adapter.info || {};
      adapterInfo = {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
        isFallbackAdapter:
          adapter.isFallbackAdapter ?? info.isFallbackAdapter ?? null,
      };
      if (backend === "auto") choice = "webgpu";
    } else if (backend === "auto") choice = "wasm";
  } else if (backend === "auto") choice = "wasm";
  async function create(selected) {
    const runtimeUrl = new URL(
      `/onnx/vendor/ort.${selected === "webgpu" ? "webgpu" : "wasm"}.min.mjs`,
      self.location.origin,
    ).href;
    ort = await import(/* @vite-ignore */ runtimeUrl);
    ort.env.wasm.wasmPaths = new URL(
      "/onnx/vendor/",
      self.location.origin,
    ).href;
    ort.env.wasm.numThreads =
      selected === "wasm" && self.crossOriginIsolated
        ? Math.min(4, navigator.hardwareConcurrency || 1)
        : 1;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = "warning";
    return await ort.InferenceSession.create(modelData.buffer, {
      executionProviders: [selected],
      graphOptimizationLevel: "all",
    });
  }
  let fallbackReason = null;
  try {
    session = await create(choice);
  } catch (error) {
    if (backend !== "auto" || choice === "wasm") throw error;
    fallbackReason = String(error.message || error);
    choice = "wasm";
    send("fallback", { reason: fallbackReason });
    session = await create("wasm");
  }
  actualBackend = choice;
  try {
    configureSession();
  } catch (error) {
    await session.release();
    session = null;
    throw error;
  }
  initInfo = {
    actualBackend,
    adapter: adapterInfo,
    fallbackReason,
    threads: ort.env.wasm.numThreads,
    runtimeVersion: "1.30.0",
    modelId: modelConfig.id,
    modelLabel: modelConfig.label,
    modelUrl: modelConfig.url,
    modelSha256: modelConfig.sha256,
    pipeline: pipelineConfig,
    resultKind: pipelineConfig.output.kind,
    inputShape,
    inputName,
    outputName,
    inputNames: session.inputNames,
    outputNames: session.outputNames,
    timings: {
      modelFetchMs: modelData.modelFetchMs,
      initMs: performance.now() - start,
    },
    assets: {
      modelBytes: modelData.modelBytes,
      modelTransferredBytes: modelData.modelTransferredBytes,
      ...runtimeResources(),
    },
  };
  send("ready", initInfo);
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
async function run({ rgba, width, height, threshold, iou = 0.7, repeats = 1 }) {
  if (!session) throw new Error("模型还未初始化");
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 100)
    throw new Error("连续测量次数必须为 1–100");
  if (rgba) {
    inputPixels = new Uint8ClampedArray(rgba);
    inputWidth = width;
    inputHeight = height;
  }
  if (!inputPixels) throw new Error("请先选择图片");
  const durations = [],
    totals = [],
    preprocessing = [],
    postprocessing = [];
  let result;
  for (let i = 0; i < repeats; i++) {
    const begin = performance.now();
    const input = preprocessImage(
      inputPixels,
      inputWidth,
      inputHeight,
      pipelineConfig.input,
    );
    const tensor = new ort.Tensor("float32", input.data, input.dims);
    const preEnd = performance.now();
    let output;
    try {
      output = await session.run({ [inputName]: tensor }, [outputName]);
      const inferenceEnd = performance.now();
      const prediction = output[outputName];
      const data = await prediction.getData();
      const processed = postprocessOutput(
        data,
        prediction.dims,
        input.geometry,
        pipelineConfig.output,
        { threshold, iou },
      );
      const finished = performance.now();
      const inferenceMs = inferenceEnd - preEnd;
      if (firstInferenceMs === null) firstInferenceMs = inferenceMs;
      durations.push(inferenceMs);
      totals.push(finished - begin);
      preprocessing.push(preEnd - begin);
      postprocessing.push(finished - inferenceEnd);
      result = {
        ...processed,
        inputShape: input.dims,
        outputShape: prediction.dims,
        image: { width: inputWidth, height: inputHeight },
        timings: {
          ...initInfo.timings,
          firstInferenceMs,
          lastInferenceMs: inferenceMs,
          preprocessMs: preEnd - begin,
          postprocessMs: finished - inferenceEnd,
          totalMs: finished - begin,
        },
        assets: { ...initInfo.assets, ...runtimeResources() },
        actualBackend,
        threads: initInfo.threads,
        adapter: initInfo.adapter,
      };
      if (validate && i === repeats - 1) {
        const inputCopy = input.data.slice(),
          outputCopy = data.slice();
        self.postMessage(
          {
            type: "validation",
            input: inputCopy.buffer,
            output: outputCopy.buffer,
          },
          [inputCopy.buffer, outputCopy.buffer],
        );
      }
      if (repeats > 1)
        send("benchmark-progress", {
          completedRuns: i + 1,
          totalRuns: repeats,
          inferenceMs,
        });
    } finally {
      tensor.dispose();
      if (output) for (const value of Object.values(output)) value.dispose();
    }
  }
  if (repeats > 1)
    result.benchmark = {
      completedRuns: repeats,
      totalRuns: repeats,
      meanMs: durations.reduce((a, b) => a + b, 0) / repeats,
      preprocessMeanMs: preprocessing.reduce((a, b) => a + b, 0) / repeats,
      postprocessMeanMs: postprocessing.reduce((a, b) => a + b, 0) / repeats,
      totalMeanMs: totals.reduce((a, b) => a + b, 0) / repeats,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      inferenceTimesMs: durations,
      totalTimesMs: totals,
      note: `${repeats} 次已热身推理；不包含模型加载及初始化。总流程含前后处理。`,
    };
  send("result", result);
}
self.onmessage = async (event) => {
  try {
    const data = event.data;
    if (data.type === "init")
      await initialize(
        data.backend,
        data.validate,
        data.model,
        data.pipeline,
        data.modelBytes,
        data.modelFetchMs,
      );
    if (data.type === "run") await run(data);
    if (data.type === "clear-input") {
      inputPixels = null;
      inputWidth = inputHeight = undefined;
      send("input-cleared", {});
    }
    if (data.type === "release") {
      await session?.release();
      session = null;
      inputPixels = null;
      send("released", {});
    }
  } catch (error) {
    send("error", {
      message: String(error.message || error),
      stack: error.stack,
    });
  }
};
