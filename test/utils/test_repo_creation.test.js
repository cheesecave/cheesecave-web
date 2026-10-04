import { describe, expect, it } from "vitest";
import { validateRepositoryName } from "@/utils/repo-creation";
import { getApiErrorMessage } from "@/utils/api-error";

describe("repository creation policy", () => {
  it.each(["a", "model.v1", "my-model", "my_model", "Model3"])(
    "accepts the backend-supported name %s without a two-character minimum",
    (name) => expect(validateRepositoryName(name)).toBeNull(),
  );

  it.each(["", "   ", "bad/name", "bad\n", "café", null])(
    "rejects an empty or unsupported UI name %s",
    (name) => expect(validateRepositoryName(name)).toEqual(expect.any(String)),
  );
});

describe("API error messages", () => {
  it.each([
    [
      { error: "Repository already exists", detail: "old error" },
      "Repository already exists",
    ],
    [{ detail: "Legacy error" }, "Legacy error"],
    [{ detail: { error: "Quota exceeded" } }, "Quota exceeded"],
    [{ detail: { message: "Permission denied" } }, "Permission denied"],
    [
      {
        detail: [
          { loc: ["body", "name"], msg: "Invalid name" },
          { msg: "Invalid type" },
        ],
      },
      "Invalid name; Invalid type",
    ],
    [{ message: "Service unavailable" }, "Service unavailable"],
    [
      { error: {}, detail: { unexpected: true } },
      "Unable to create repository",
    ],
    [{ detail: [{ unexpected: true }] }, "Unable to create repository"],
  ])("returns readable text for %j", (data, expected) => {
    expect(
      getApiErrorMessage({ response: { data } }, "Unable to create repository"),
    ).toBe(expected);
  });

  it("uses the supplied fallback for a network error without a response", () => {
    expect(
      getApiErrorMessage(
        new Error("Network Error"),
        "Unable to create repository",
      ),
    ).toBe("Unable to create repository");
  });
});
