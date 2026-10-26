import { describe, it, expect } from "vitest";
import {
  createDefaultDocument,
  createEmptyDocument,
  validateDocument,
} from "../../src/onnx/config/document.js";

describe("repository ONNX authoring", () => {
  it("starts without fabricated model facts or a bundled sample", () => {
    const draft = createEmptyDocument();
    expect(draft.task.model.url).toBe("");
    expect(draft.task.model.sha256).toBe("");
    expect(draft.task.model.bytes).toBe(0);
    expect(draft.task.sample).toBeNull();
    expect(() => validateDocument(draft)).toThrow();
  });
  it("allows a model demo with local image input and no repository sample", () => {
    const draft = createDefaultDocument();
    draft.task.sample = null;
    expect(validateDocument(draft).task.sample).toBeNull();
  });
});
