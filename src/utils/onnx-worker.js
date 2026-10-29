// src/utils/onnx-worker.js
//
// Runs the whole Range-reading pipeline off the main thread. The graph is drawn by
// Netron in a same-origin iframe, which shares the page's main thread; a big graph
// (thousands of nodes) keeps that thread busy for seconds, and the serial walk over
// the weights, which is a chain of small requests, slows down with it.
//
// Messages in:   { type: "load", url }   { type: "abort" }
// Messages out:  progress, structure, weights, done, error
import { cacheKey, loadWeights, saveWeights } from "./onnx-cache";
import {
  buildModel,
  createRangeReader,
  readStructure,
  readWeights,
  summarizeWeights,
} from "./onnx-range";

let controller = null;

self.onmessage = async ({ data }) => {
  if (data.type === "abort") {
    controller?.abort();
    return;
  }
  if (data.type !== "load") return;
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const reader = createRangeReader(data.url, { signal });
  const stats = () => ({
    requests: reader.stats.requests,
    bytes: reader.stats.bytes,
    size: reader.size,
  });
  const post = (message, transfer) => self.postMessage(message, transfer);

  try {
    const t0 = performance.now();
    const structure = await readStructure(reader, {
      signal,
      onProgress: (phase, detail) =>
        post({ type: "progress", phase, detail, stats: stats() }),
    });
    const { pieces, ...rest } = structure;
    // The intermediate shapes are only needed inside the stripped model
    const info = { ...rest, graph: { ...rest.graph, valueInfo: [] } };
    const structureMs = performance.now() - t0;

    // Weight descriptors of this file seen before in this browser
    const key = cacheKey(data.url, reader.size);
    const cached = await loadWeights(key);
    if (cached) {
      const model = buildModel(structure, cached);
      post(
        {
          type: "done",
          info,
          structureMs,
          weightsMs: null,
          summary: summarizeWeights(cached),
          model,
          stats: stats(),
          cached: true,
        },
        [model.buffer],
      );
      return;
    }

    const first = buildModel(structure);
    post(
      { type: "structure", info, structureMs, model: first, stats: stats() },
      [first.buffer],
    );

    const t1 = performance.now();
    const tensors = await readWeights(reader, structure.initializerRegion, {
      signal,
      onBatch: (list, progress) =>
        post({
          type: "weights",
          count: list.length,
          summary: summarizeWeights(list),
          ratio: progress.total ? progress.position / progress.total : 1,
          stats: stats(),
        }),
    });
    const weightsMs = performance.now() - t1;
    saveWeights(key, tensors);
    const model = buildModel(structure, tensors);
    post(
      {
        type: "done",
        info,
        structureMs,
        weightsMs,
        summary: summarizeWeights(tensors),
        model,
        stats: stats(),
        cached: false,
      },
      [model.buffer],
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    post({
      type: "error",
      message: error.message || String(error),
      stats: stats(),
    });
  }
};
