import { inspectOnnxBytes } from "./onnx-metadata.js";

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ result: await inspectOnnxBytes(new Uint8Array(data)) });
  } catch (error) {
    self.postMessage({
      error: {
        name: error.name,
        code: error.code || "INSPECTION_FAILED",
        message: error.message || String(error),
      },
    });
  }
};
