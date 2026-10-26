import { parseSpaceResourceUrl } from "../engine/pipeline-config.js";

import { onnxSpaceAPI } from "@/utils/api.js";
export function resourcePath(context, url) {
  const parsed = parseSpaceResourceUrl(url);
  return parsed?.id === context.id && parsed.revision === context.revision
    ? parsed.path
    : "";
}
export async function listSpaceFiles(context, signal) {
  const files = await onnxSpaceAPI.listFiles(context, { signal });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function readLabels(url, signal) {
  const response = await onnxSpaceAPI.readResource(url, { signal });
  if (!response.ok)
    throw new Error(`标签文件读取失败（HTTP ${response.status}）`);
  if (Number(response.headers.get("Content-Length")) > 262144)
    throw new Error("标签文件不能超过 256 KB");
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 262144) {
        await reader.cancel();
        throw new Error("标签文件不能超过 256 KB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("标签文件需要有效 JSON");
  }
  const labels = Array.isArray(parsed) ? parsed : parsed?.labels;
  if (
    !Array.isArray(labels) ||
    !labels.length ||
    labels.length > 200 ||
    labels.some(
      (label) =>
        typeof label !== "string" || !label.trim() || label.length > 200,
    )
  )
    throw new Error("标签文件需要字符串数组，或包含 labels 数组的 JSON 对象");
  return labels;
}
