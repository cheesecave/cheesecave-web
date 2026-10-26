import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { AppError, KIND } from "@/errors";
import { createDefaultDocument } from "@/onnx/config/document.js";
import { onnxSpaceAPI } from "@/utils/api.js";
import { useInference } from "@/onnx/runtime/useInference.js";

const workers = [],
  mounted = [];
let bitmap, runtime, documentRef, formData, formApi;
function fixture() {
  const document = createDefaultDocument();
  document.task.model.bytes = 8;
  document.task.model.url = "/spaces/alice/demo/resolve/main/model.onnx";
  document.task.sample.url = "/spaces/alice/demo/resolve/main/sample.jpg";
  return document;
}
function subject(keepAlive = false) {
  documentRef = ref(fixture());
  formData = ref({ backend: "wasm", threshold: 0.278 });
  formApi = ref({ setValue: vi.fn(), disabled: vi.fn() });
  const Component = defineComponent({
    setup() {
      runtime = useInference(documentRef, formData, formApi);
      return () => h("div");
    },
  });
  const visible = ref(true);
  const wrapper = mount(
    keepAlive
      ? defineComponent({
          setup: () => () =>
            h(KeepAlive, null, {
              default: () => (visible.value ? h(Component) : null),
            }),
        })
      : Component,
  );
  mounted.push(wrapper);
  return { wrapper, visible };
}
async function image() {
  await runtime.selectImage("image", new Blob(["image"]), "local.png");
}

describe("ONNX runtime lifecycle", () => {
  beforeEach(() => {
    workers.length = 0;
    bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const OriginalURL = URL;
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        static createObjectURL = vi.fn(() => "blob:test-image");
        static revokeObjectURL = vi.fn();
      },
    );
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          this.postMessage = vi.fn();
          this.terminate = vi.fn();
          workers.push(this);
        }
        emit(data) {
          this.onmessage?.({ data });
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    });
  });
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("unmount aborts pending model headers without turning cancellation into a runtime error", async () => {
    let requestSignal;
    vi.spyOn(onnxSpaceAPI, "readResource").mockImplementation(
      (_url, { signal }) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new AppError({ kind: KIND.CANCELLED })),
            { once: true },
          ),
        );
      },
    );
    const { wrapper } = subject();
    await image();
    const running = runtime.runInference();
    expect(runtime.busy.value).toBe(true);
    wrapper.unmount();
    await running;
    expect(requestSignal.aborted).toBe(true);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[0].postMessage).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(runtime.metrics.value.status).toBe("idle");
    expect(runtime.metrics.value.error).toBeUndefined();
  });

  it("KeepAlive deactivation cancels a streaming download and destroys its Worker", async () => {
    const cancel = vi.fn();
    let requestSignal;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
        },
        cancel,
      }),
    );
    vi.spyOn(onnxSpaceAPI, "readResource").mockImplementation(
      async (_url, { signal }) => {
        requestSignal = signal;
        return response;
      },
    );
    const { visible } = subject(true);
    await image();
    const running = runtime.runInference();
    await flushPromises();
    expect(runtime.downloadPercent.value).toBe(25);
    visible.value = false;
    await nextTick();
    await running;
    expect(requestSignal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(runtime.canRun.value).toBe(false);
    expect(runtime.metrics.value.status).toBe("idle");
    visible.value = true;
    await nextTick();
    expect(runtime.hasSession.value).toBe(false);
    expect(runtime.metrics.value.error).toBeUndefined();
  });

  it("ignores a late model response after the document changed", async () => {
    let respond;
    vi.spyOn(onnxSpaceAPI, "readResource").mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    subject();
    await image();
    const running = runtime.runInference();
    documentRef.value = { ...fixture(), name: "Next document" };
    await nextTick();
    respond(new Response(new Uint8Array(8)));
    await running;
    expect(workers[0].postMessage).not.toHaveBeenCalled();
    expect(runtime.metrics.value.status).toBe("idle");
    expect(runtime.metrics.value.error).toBeUndefined();
  });

  it("ignores old Worker results and clears image data when switching documents mid-run", async () => {
    vi.spyOn(onnxSpaceAPI, "readResource").mockResolvedValue(
      new Response(new Uint8Array(8)),
    );
    subject();
    await image();
    const running = runtime.runInference();
    await flushPromises();
    const worker = workers[0];
    expect(worker.postMessage.mock.calls[0][0].type).toBe("init");
    worker.emit({ type: "ready", actualBackend: "wasm" });
    await flushPromises();
    expect(worker.postMessage.mock.calls[1][0].type).toBe("run");
    documentRef.value = { ...fixture(), name: "Next document" };
    await nextTick();
    await running;
    worker.emit({
      type: "result",
      resultKind: "yolo-detection",
      detections: [{ score: 0.99 }],
      timings: {},
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(runtime.records.value).toEqual([]);
    expect(runtime.snapshot.value.runCount).toBe(0);
    expect(runtime.boundImage.value).toBeUndefined();
    expect(runtime.metrics.value.status).toBe("idle");
  });

  it("Worker startup failure aborts the active model request and remains retryable", async () => {
    let requestSignal;
    vi.spyOn(onnxSpaceAPI, "readResource").mockImplementation(
      (_url, { signal }) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new AppError({ kind: KIND.CANCELLED })),
            { once: true },
          ),
        );
      },
    );
    subject();
    await image();
    const running = runtime.runInference();
    workers[0].onerror({ message: "Worker module failed" });
    expect(requestSignal.aborted).toBe(true);
    await running;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(runtime.metrics.value.status).toBe("error");
    expect(runtime.metrics.value.error).toBe("Worker module failed");
    expect(runtime.canRun.value).toBe(true);
  });

  it("cancels a pending sample request on deactivation without surfacing an error", async () => {
    let requestSignal;
    vi.spyOn(onnxSpaceAPI, "readResource").mockImplementation(
      (_url, { signal }) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new AppError({ kind: KIND.CANCELLED })),
            { once: true },
          ),
        );
      },
    );
    const { visible } = subject(true);
    const pending = runtime.loadSample("image");
    visible.value = false;
    await nextTick();
    await expect(pending).resolves.toBeNull();
    expect(requestSignal.aborted).toBe(true);
    expect(runtime.metrics.value.status).toBe("idle");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("does not revive images or report a stale decoder failure after unmount", async () => {
    let rejectDecode;
    createImageBitmap.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectDecode = reject;
        }),
    );
    const { wrapper } = subject();
    const pending = runtime.selectImage(
      "image",
      new Blob(["bad-image"]),
      "image.png",
    );
    wrapper.unmount();
    rejectDecode(new Error("Image decode failed"));
    await expect(pending).resolves.toBeNull();
    expect(runtime.boundImage.value).toBeUndefined();
    expect(runtime.metrics.value.status).toBe("idle");
  });
});
