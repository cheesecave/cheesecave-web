import { describe, expect, it } from "vitest";
import { parseApiError, readErrorMessage } from "../../src/shared/api-error.js";

// What the web UI used before its errors were decoded by src/errors; the
// admin app still shares this parser.
const getApiErrorMessage = (error, fallback) =>
  parseApiError(error, fallback, { preferDetail: false });

describe("UI API error compatibility and shared parsing", () => {
  it("keeps HF top-level errors ahead of details and backend messages ahead of fallbacks", () => {
    expect(
      getApiErrorMessage(
        {
          response: {
            data: {
              error: "HF conflict",
              detail: "FastAPI detail",
              message: "Top message",
            },
          },
        },
        "Create failed",
      ),
    ).toBe("HF conflict");
    expect(
      getApiErrorMessage(
        {
          response: {
            data: { detail: "FastAPI detail", message: "Top message" },
          },
        },
        "Create failed",
      ),
    ).toBe("FastAPI detail");
    expect(
      getApiErrorMessage(
        { response: { data: { message: "Top message" } } },
        "Create failed",
      ),
    ).toBe("Top message");
  });

  it("keeps action fallbacks ahead of network error messages", () => {
    expect(
      getApiErrorMessage(
        new Error("Network Error"),
        "Could not create repository",
      ),
    ).toBe("Could not create repository");
  });

  it.each([
    [
      { error: { detail: { message: "Nested HF failure" } } },
      "Nested HF failure",
    ],
    [
      { detail: { error: { message: "Nested detail failure" } } },
      "Nested detail failure",
    ],
    [
      {
        detail: [
          { loc: ["body", "name"], msg: "Name required" },
          { msg: "Invalid type" },
        ],
      },
      "Name required; Invalid type",
    ],
    [
      {
        detail: { unknown: "Do not expose metadata" },
        message: "Safe message",
      },
      "Safe message",
    ],
  ])(
    "extracts backend structures without stringifying objects",
    (data, expected) => {
      expect(getApiErrorMessage({ response: { data } }, "Request failed")).toBe(
        expected,
      );
    },
  );

  it("ignores unknown objects and cycles while still finding readable sibling messages", () => {
    const cycle = {};
    cycle.error = cycle;
    cycle.message = "Readable sibling";
    expect(readErrorMessage(cycle)).toBe("Readable sibling");
    const arrayCycle = [];
    arrayCycle.push(
      arrayCycle,
      { msg: "Validation failure" },
      { unknown: "Secret metadata" },
    );
    expect(readErrorMessage(arrayCycle)).toBe("Validation failure");
    expect(
      getApiErrorMessage(
        { response: { data: { detail: { unknown: true } } } },
        "Save failed",
      ),
    ).toBe("Save failed");
    delete cycle.message;
    expect(
      getApiErrorMessage(
        { response: { data: { error: cycle } } },
        "Save failed",
      ),
    ).toBe("Save failed");
    expect(readErrorMessage({ toString: () => "Secret metadata" })).toBe("");
  });

  it("bounds deeply nested bodies and preserves repeated independent validation entries", () => {
    let deep = { message: "Unreachable" };
    for (let i = 0; i < 10000; i++) deep = { error: deep };
    expect(readErrorMessage(deep)).toBe("");
    const item = { msg: "Required" };
    expect(readErrorMessage([item, item])).toBe("Required; Required");
  });
});
