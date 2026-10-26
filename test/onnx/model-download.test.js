import { it, expect } from "vitest";
import { readModelBytes } from "../../src/onnx/runtime/model-download.js";

it("checks actual streamed length rather than trusting response headers", async () => {
  await expect(
    readModelBytes(new Response(new Uint8Array([1, 2, 3])), 2),
  ).rejects.toThrow(/大小/);
  await expect(
    readModelBytes(new Response(new Uint8Array([1])), 2),
  ).rejects.toThrow(/不完整/);
});
it("reports download progress and returns transferable bytes", async () => {
  const progress = [];
  const data = await readModelBytes(
    new Response(new Uint8Array([1, 2])),
    2,
    (n) => progress.push(n),
  );
  expect([...new Uint8Array(data)]).toEqual([1, 2]);
  expect(progress).toEqual([2]);
});
it("cancels the stream when the active session has been released", async () => {
  const aborter = new AbortController();
  aborter.abort();
  await expect(
    readModelBytes(
      new Response(new Uint8Array([1, 2])),
      2,
      undefined,
      aborter.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
