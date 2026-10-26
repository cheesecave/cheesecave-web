import { effectScope, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/onnx/config/document.js";

const files = [
  {
    type: "file",
    path: "model.onnx",
    url: "/spaces/alice/demo/resolve/main/model.onnx",
  },
];
vi.mock("../../src/onnx/editor/space-resources.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listSpaceFiles: vi.fn(async () => [
    {
      type: "file",
      path: "model.onnx",
      url: "/spaces/alice/demo/resolve/main/model.onnx",
    },
  ]),
}));
import { useSpaceResources } from "../../src/onnx/editor/useSpaceResources.js";

describe("an unconfigured Space model", () => {
  it("has no missing-file error before a model is selected, but is not ready to save", async () => {
    const task = ref(createEmptyDocument().task);
    const scope = effectScope();
    const resources = scope.run(() =>
      useSpaceResources(
        task,
        vi.fn(),
        ref({ id: "alice/demo", revision: "main" }),
      ),
    );
    try {
      await flushPromises();
      expect(resources.status.value).toBe("ready");
      expect(resources.selectionError.value).toBe("");
      expect(resources.ready.value).toBe(false);
      task.value.model.url = "/spaces/alice/demo/resolve/main/missing.onnx";
      expect(resources.selectionError.value).toContain(
        "模型不在当前 Space 仓库中",
      );
      expect(resources.ready.value).toBe(false);
      resources.selectModel("model.onnx");
      expect(task.value.model.url).toBe(files[0].url);
      expect(resources.selectionError.value).toBe("");
      expect(resources.ready.value).toBe(true);
    } finally {
      scope.stop();
    }
  });
});
