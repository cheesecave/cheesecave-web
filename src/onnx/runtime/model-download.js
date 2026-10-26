import { MODEL_MAX_BYTES } from "../engine/pipeline-config.js";

export async function readModelBytes(
  response,
  expectedBytes,
  progress = () => {},
  signal,
) {
  if (
    !Number.isInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > MODEL_MAX_BYTES
  )
    throw new Error("模型大小无效");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取模型文件");
  const bytes = new Uint8Array(expectedBytes);
  let received = 0;
  const abort = () => {
    void reader.cancel(signal.reason);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (received + value.length > expectedBytes)
        throw new Error("模型大小与配置不匹配，请重新保存模型配置");
      bytes.set(value, received);
      received += value.length;
      progress(received);
    }
    if (received !== expectedBytes)
      throw new Error("模型下载不完整，请重新保存模型配置");
    return bytes.buffer;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
