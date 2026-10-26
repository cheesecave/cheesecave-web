import {
  computed,
  markRaw,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowReactive,
  watch,
} from "vue";
import { onnxSpaceAPI } from "@/utils/api.js";
import { KIND, decodeError } from "@/errors";
import { readModelBytes } from "./model-download.js";
import { flattenRules } from "../config/document.js";
import { formatBytes, formatMs, resolveTask } from "./context.js";

export function useInference(documentRef, formData, formApi) {
  const images = shallowReactive({});
  const metrics = ref({});
  const records = ref([]);
  const statusText = ref("选择图片或载入示例后开始");
  const downloadPercent = ref(0);
  const hasSession = ref(false);
  const runCount = ref(0);
  const diagnosticsEnabled =
    new URLSearchParams(location.search).get("benchmark") === "1";
  const imageLoadTokens = new Map();
  let worker,
    modelRequest,
    sampleRequest,
    generation = 0,
    pendingReady,
    pendingRun,
    sessionBackend,
    sessionSequence = 0,
    imageSequence = 0,
    lastRunImage = null;
  const busy = computed(() =>
    ["loading", "running", "benchmarking"].includes(metrics.value.status),
  );
  const boundImage = computed(() => images[documentRef.value.bindings.image]);
  const backend = computed(
    () =>
      formData.value[documentRef.value.bindings.backend] ??
      documentRef.value.task.params.backend,
  );
  const threshold = computed(() =>
    Number(
      formData.value[documentRef.value.bindings.threshold] ??
        documentRef.value.task.params.threshold,
    ),
  );
  const snapshot = computed(() => ({
    ...metrics.value,
    runCount: runCount.value,
    task: documentRef.value.task,
  }));
  const canRun = computed(() => !busy.value && !!boundImage.value);
  const canExport = computed(() => !busy.value && records.value.length > 0);

  function blankMetrics() {
    const { model } = resolveTask(documentRef.value.task);
    return {
      status: "idle",
      sessionId: null,
      requestedBackend: backend.value,
      actualBackend: null,
      runtimeVersion: "1.30.0",
      preset: documentRef.value.task.preset,
      presetVersion: documentRef.value.task.version,
      model: model.id,
      modelUrl: model.url,
      modelSha256: model.sha256,
      resultKind: documentRef.value.task.pipeline.output.kind,
      assets: { modelBytes: model.bytes },
      timings: {},
      benchmark: {},
      memory: {},
      detections: [],
      classifications: [],
      adapter: null,
      device: {
        userAgent: navigator.userAgent,
        logicalProcessors: navigator.hardwareConcurrency,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        crossOriginIsolated: window.crossOriginIsolated,
      },
      note: "耗时来自本次浏览器实际执行；MB 为十进制；JS 堆估计不含 Worker、WASM 和 GPU 内存。",
    };
  }
  function measureHeap() {
    const heap = performance.memory;
    metrics.value.memory = {
      jsHeapUsedBytes: heap?.usedJSHeapSize ?? null,
      jsHeapTotalBytes: heap?.totalJSHeapSize ?? null,
      jsHeapLimitBytes: heap?.jsHeapSizeLimit ?? null,
      note: "页面 JS 堆估计，不含 Worker、WASM 和 GPU。",
    };
  }
  function status(value, text) {
    metrics.value.status = value;
    statusText.value = text;
    measureHeap();
  }
  function fail(error) {
    if (
      error?.name === "AbortError" ||
      decodeError(error).kind === KIND.CANCELLED
    )
      return;
    metrics.value.error = String(error?.message || error);
    status("error", "运行失败，可重试或切换计算方式");
  }
  function clearPending(error) {
    pendingReady?.reject(error);
    pendingRun?.reject(error);
    pendingReady = pendingRun = null;
  }
  function terminate() {
    generation++;
    modelRequest?.abort();
    modelRequest = null;
    sampleRequest?.abort();
    sampleRequest = null;
    clearPending(new DOMException("会话已释放", "AbortError"));
    worker?.terminate();
    worker = null;
    hasSession.value = false;
    sessionBackend = null;
    lastRunImage = null;
  }
  function release() {
    terminate();
    const image = boundImage.value;
    metrics.value = blankMetrics();
    if (image)
      metrics.value.image = {
        name: image.name,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      };
    downloadPercent.value = 0;
    formApi.value?.setValue(documentRef.value.bindings.result, []);
    status(image ? "ready" : "idle", "推理会话已释放");
  }
  function closeImages() {
    imageLoadTokens.clear();
    for (const [key, image] of Object.entries(images)) {
      image.bitmap.close();
      URL.revokeObjectURL(image.url);
      delete images[key];
    }
  }
  function clearImage(field) {
    if (busy.value) return false;
    imageLoadTokens.set(field, ++imageSequence);
    const image = images[field];
    if (image) {
      image.bitmap.close();
      URL.revokeObjectURL(image.url);
      delete images[field];
    }
    formApi.value?.setValue(field, null);
    if (field === documentRef.value.bindings.image) {
      worker?.postMessage({ type: "clear-input" });
      metrics.value.detections = [];
      metrics.value.classifications = [];
      metrics.value.benchmark = {};
      delete metrics.value.image;
      delete metrics.value.error;
      formApi.value?.setValue(documentRef.value.bindings.result, []);
      lastRunImage = null;
      status("idle", "图片已清除，选择图片后开始");
    }
    return true;
  }
  function resetParameters() {
    if (busy.value) return;
    const ordinaryInputs = new Set([
      "input",
      "inputNumber",
      "select",
      "slider",
      "switch",
    ]);
    const defaults = {};
    for (const rule of flattenRules(documentRef.value.ui.rules)) {
      if (!rule.field || !ordinaryInputs.has(rule.type)) continue;
      const taskDefault =
        rule.field === documentRef.value.bindings.threshold
          ? documentRef.value.task.params.threshold
          : rule.field === documentRef.value.bindings.backend
            ? documentRef.value.task.params.backend
            : undefined;
      const value =
        rule.value ??
        taskDefault ??
        (rule.type === "switch"
          ? false
          : ["inputNumber", "slider"].includes(rule.type)
            ? (rule.props?.min ?? 0)
            : "");
      defaults[rule.field] = Array.isArray(value) ? [...value] : value;
    }
    if (documentRef.value.bindings.threshold)
      defaults[documentRef.value.bindings.threshold] ??=
        documentRef.value.task.params.threshold;
    defaults[documentRef.value.bindings.backend] ??=
      documentRef.value.task.params.backend;
    formApi.value?.setValue(defaults);
  }
  async function selectImage(field, blob, name, requestedToken = null) {
    if (busy.value) return null;
    if (!blob || blob.size > 50 * 1024 * 1024)
      throw new Error("请选择 50 MB 以内的图片");
    const token = requestedToken ?? ++imageSequence;
    if (requestedToken !== null && imageLoadTokens.get(field) !== token)
      return null;
    imageLoadTokens.set(field, token);
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (error) {
      if (imageLoadTokens.get(field) !== token) return null;
      throw error;
    }
    if (imageLoadTokens.get(field) !== token || busy.value) {
      bitmap.close();
      return null;
    }
    if (bitmap.width * bitmap.height > 16e6) {
      bitmap.close();
      throw new Error("此样例支持不超过 1600 万像素的图片，请先缩小图片");
    }
    images[field]?.bitmap.close();
    if (images[field]?.url) URL.revokeObjectURL(images[field].url);
    const image = {
      bitmap: markRaw(bitmap),
      name,
      width: bitmap.width,
      height: bitmap.height,
      bytes: blob.size,
      url: URL.createObjectURL(blob),
      token,
    };
    images[field] = image;
    if (field === documentRef.value.bindings.image) {
      metrics.value.image = {
        name,
        width: image.width,
        height: image.height,
        bytes: blob.size,
      };
      metrics.value.detections = [];
      metrics.value.classifications = [];
      metrics.value.benchmark = {};
      formApi.value?.setValue(documentRef.value.bindings.result, []);
      delete metrics.value.error;
      status("ready", "图片已就绪");
    }
    return {
      name,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      token,
    };
  }
  async function loadSample(field) {
    if (busy.value) return null;
    const token = ++imageSequence;
    imageLoadTokens.set(field, token);
    const { sample } = resolveTask(documentRef.value.task);
    if (!sample) return null;
    sampleRequest?.abort();
    const aborter = new AbortController();
    sampleRequest = aborter;
    const ownGeneration = generation;
    try {
      const response = await onnxSpaceAPI.readResource(sample.url, {
        signal: aborter.signal,
      });
      if (!response.ok) throw new Error("示例图片加载失败");
      return await selectImage(
        field,
        await response.blob(),
        sample.label,
        token,
      );
    } catch (error) {
      if (
        ownGeneration !== generation ||
        imageLoadTokens.get(field) !== token ||
        error?.name === "AbortError" ||
        decodeError(error).kind === KIND.CANCELLED
      )
        return null;
      throw error;
    } finally {
      if (sampleRequest === aborter) sampleRequest = null;
    }
  }
  function createWorker() {
    const ownGeneration = ++generation;
    worker = new Worker(
      new URL("../engine/inference-worker.js", import.meta.url),
      { type: "module", name: "cheesecave-inference" },
    );
    metrics.value.sessionId = ++sessionSequence;
    worker.onerror = (event) => {
      if (ownGeneration !== generation) return;
      const error = new Error(event.message || "推理 Worker 异常");
      terminate();
      fail(error);
    };
    worker.onmessage = ({ data }) => {
      if (ownGeneration !== generation) return;
      if (data.type === "progress") {
        downloadPercent.value = Math.round((data.received / data.total) * 100);
        statusText.value = `加载模型 ${formatBytes(data.received)} / ${formatBytes(data.total)}`;
      } else if (data.type === "fallback") {
        statusText.value = "WebGPU 初始化失败，正在尝试 WASM";
        metrics.value.fallbackReason = data.reason;
      } else if (data.type === "ready") {
        const { type, ...details } = data;
        Object.assign(metrics.value, details);
        hasSession.value = true;
        pendingReady?.resolve();
        pendingReady = null;
      } else if (data.type === "result") {
        pendingRun?.resolve(data);
        pendingRun = null;
      } else if (data.type === "benchmark-progress") {
        metrics.value.benchmark = {
          ...metrics.value.benchmark,
          completedRuns: data.completedRuns,
          totalRuns: data.totalRuns,
        };
        statusText.value = `连续测量 ${data.completedRuns} / ${data.totalRuns} · ${formatMs(data.inferenceMs)}`;
      } else if (data.type === "validation") {
        window.demoValidation = {
          input: new Float32Array(data.input),
          output: new Float32Array(data.output),
        };
      } else if (data.type === "error") {
        const error = new Error(data.message);
        terminate();
        fail(error);
      }
    };
  }
  async function ensureSession() {
    if (hasSession.value && sessionBackend === backend.value) return;
    if (worker) terminate();
    createWorker();
    sessionBackend = backend.value;
    metrics.value.requestedBackend = backend.value;
    status("loading", "正在加载模型与运行时…");
    const ownGeneration = generation;
    const aborter = new AbortController();
    modelRequest = aborter;
    const start = performance.now();
    const model = documentRef.value.task.model;
    try {
      const response = await onnxSpaceAPI.readResource(model.url, {
        signal: aborter.signal,
      });
      if (ownGeneration !== generation) {
        await response.body?.cancel();
        throw new DOMException("会话已释放", "AbortError");
      }
      const modelBytes = await readModelBytes(
        response,
        model.bytes,
        (received) => {
          if (ownGeneration !== generation) return;
          downloadPercent.value = Math.round((received / model.bytes) * 100);
          statusText.value = `加载模型 ${formatBytes(received)} / ${formatBytes(model.bytes)}`;
        },
        aborter.signal,
      );
      if (ownGeneration !== generation)
        throw new DOMException("会话已释放", "AbortError");
      await new Promise((resolve, reject) => {
        pendingReady = { resolve, reject };
        worker.postMessage(
          {
            type: "init",
            backend: backend.value,
            model: JSON.parse(JSON.stringify(documentRef.value.task.model)),
            pipeline: JSON.parse(
              JSON.stringify(documentRef.value.task.pipeline),
            ),
            modelBytes,
            modelFetchMs: performance.now() - start,
            validate: new URLSearchParams(location.search).has("validate"),
          },
          [modelBytes],
        );
      });
    } finally {
      if (modelRequest === aborter) modelRequest = null;
    }
  }
  function imagePixels(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image.bitmap, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  }
  async function performRun(repeats, record, selectedImage, runThreshold, iou) {
    const ownGeneration = generation;
    const rgba = imagePixels(selectedImage);
    const result = await new Promise((resolve, reject) => {
      pendingRun = { resolve, reject };
      worker.postMessage(
        {
          type: "run",
          rgba: rgba.buffer,
          width: selectedImage.width,
          height: selectedImage.height,
          threshold: runThreshold,
          iou,
          repeats,
        },
        [rgba.buffer],
      );
    });
    if (ownGeneration !== generation)
      throw new DOMException("会话已释放", "AbortError");
    const { type, ...details } = result;
    Object.assign(metrics.value, details, {
      image: {
        name: selectedImage.name,
        width: selectedImage.width,
        height: selectedImage.height,
        bytes: selectedImage.bytes,
      },
      threshold: runThreshold,
      iou,
    });
    runCount.value += repeats;
    lastRunImage = selectedImage.token;
    if (!record) return;
    const values =
      result.resultKind === "classification"
        ? result.classifications
        : result.detections;
    formApi.value?.setValue(documentRef.value.bindings.result, values);
    records.value.unshift({
      at: new Date().toISOString(),
      image: selectedImage.name,
      backend: metrics.value.actualBackend,
      resultKind: result.resultKind,
      resultCount: values.length,
      faces: result.detections?.length ?? 0,
      preprocessMs:
        repeats > 1
          ? result.benchmark.preprocessMeanMs
          : result.timings.preprocessMs,
      inferenceMs:
        repeats > 1 ? result.benchmark.meanMs : result.timings.lastInferenceMs,
      postprocessMs:
        repeats > 1
          ? result.benchmark.postprocessMeanMs
          : result.timings.postprocessMs,
      repeats,
    });
    records.value = records.value.slice(0, 20);
    const summary =
      result.resultKind === "classification"
        ? `分类完成 · ${values[0]?.label || "无结果"}`
        : `检测完成 · ${values.length} 个目标`;
    status(
      "completed",
      repeats > 1
        ? `测量完成 · 平均 ${formatMs(result.benchmark.meanMs)}`
        : summary,
    );
  }
  async function run(repeats = 1) {
    if (busy.value || !boundImage.value) return;
    const selectedImage = boundImage.value,
      runThreshold = threshold.value,
      iou = documentRef.value.task.params.iou;
    if (
      !Number.isFinite(runThreshold) ||
      runThreshold < 0 ||
      runThreshold > 1
    ) {
      fail("置信度阈值必须在 0 到 1 之间");
      return;
    }
    if (!["auto", "wasm", "webgpu"].includes(backend.value)) {
      fail("请选择有效的计算方式");
      return;
    }
    delete metrics.value.error;
    let ownGeneration;
    try {
      const ready = ensureSession();
      ownGeneration = generation;
      await ready;
      if (ownGeneration !== generation) return;
      if (repeats > 1 && lastRunImage !== selectedImage.token) {
        status("running", "连续测量前预热…");
        await performRun(1, false, selectedImage, runThreshold, iou);
      }
      metrics.value.benchmark =
        repeats > 1 ? { completedRuns: 0, totalRuns: repeats } : {};
      status(
        repeats > 1 ? "benchmarking" : "running",
        repeats > 1 ? `正在运行 ${repeats} 次连续测量…` : "正在运行模型…",
      );
      await performRun(repeats, true, selectedImage, runThreshold, iou);
    } catch (error) {
      if (
        ownGeneration !== generation ||
        error?.name === "AbortError" ||
        decodeError(error).kind === KIND.CANCELLED
      )
        return;
      terminate();
      fail(error);
    }
  }
  function exportMetrics() {
    if (!canExport.value) return;
    measureHeap();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...snapshot.value,
            recordedAt: new Date().toISOString(),
            records: records.value,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cheesecave-inference-${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const runInference = () => run(1);
  const benchmarkDiagnostics = () => (diagnosticsEnabled ? run(10) : undefined);
  watch(backend, (value, previous) => {
    if (value !== previous && worker) release();
  });
  watch(busy, (value) => {
    const original = flattenRules(documentRef.value.ui.rules);
    for (const field of [
      documentRef.value.bindings.threshold,
      documentRef.value.bindings.backend,
    ].filter(Boolean)) {
      formApi.value?.disabled(
        value ||
          original.find((rule) => rule.field === field)?.props?.disabled ===
            true,
        [field],
      );
    }
  });
  watch(
    documentRef,
    () => {
      terminate();
      closeImages();
      imageSequence++;
      metrics.value = blankMetrics();
      records.value = [];
      runCount.value = 0;
    },
    { deep: false },
  );
  const dispose = () => {
    terminate();
    closeImages();
    imageSequence++;
    metrics.value = blankMetrics();
    downloadPercent.value = 0;
  };
  window.addEventListener("pagehide", dispose);
  onDeactivated(dispose);
  onBeforeUnmount(() => {
    dispose();
    window.removeEventListener("pagehide", dispose);
  });
  metrics.value = blankMetrics();
  measureHeap();
  return {
    document: documentRef,
    images,
    metrics,
    records,
    statusText,
    downloadPercent,
    hasSession,
    busy,
    boundImage,
    snapshot,
    selectImage,
    loadSample,
    clearImage,
    resetParameters,
    fail,
    canRun,
    canExport,
    runInference,
    exportMetrics,
    diagnosticsEnabled,
    benchmarkDiagnostics,
  };
}
