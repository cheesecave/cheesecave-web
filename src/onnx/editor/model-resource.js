import {
  MODEL_MAX_BYTES,
  validateModelUrl,
} from "../engine/pipeline-config.js";
import { onnxSpaceAPI } from "@/utils/api.js";

async function inspectBytes(buffer, signal) {
  signal?.throwIfAborted();
  // Browser parsing and hashing run in an independent, disposable worker.
  // The Node fallback keeps the same parser available to offline unit tests.
  if (typeof Worker === "undefined") {
    const { inspectOnnxBytes } = await import("./onnx-metadata.js");
    const result = await inspectOnnxBytes(buffer);
    signal?.throwIfAborted();
    return result;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./model-inspection-worker.js", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      signal?.removeEventListener("abort", aborted);
      worker.terminate();
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    signal?.addEventListener("abort", aborted, { once: true });
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error)
        reject(
          Object.assign(new Error(data.error.message), {
            name: data.error.name,
            code: data.error.code,
          }),
        );
      else resolve(data.result);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(
        Object.assign(new Error(event.message || "模型元信息读取失败"), {
          code: "INSPECTION_FAILED",
        }),
      );
    };
    try {
      worker.postMessage(buffer.buffer, [buffer.buffer]);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

// Inspect actual bytes without creating an inference session or trusting saved metadata.
export async function inspectModelResource(url, { signal } = {}) {
  validateModelUrl(url);
  const response = await onnxSpaceAPI.readResource(url, { signal });
  if (!response.ok)
    throw new Error(`模型读取失败（HTTP ${response.status}），请检查文件路径`);
  if (Number(response.headers.get("content-length")) > MODEL_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("模型文件不能超过 300 MB");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取模型文件");
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MODEL_MAX_BYTES) {
        await reader.cancel();
        throw new Error("模型文件不能超过 300 MB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!bytes) throw new Error("模型文件为空");
  signal?.throwIfAborted();
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const result = await inspectBytes(buffer, signal);
  signal?.throwIfAborted();
  return result;
}
