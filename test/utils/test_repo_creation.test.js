import { describe, expect, it } from "vitest";
import { validateRepositoryName } from "@/utils/repo-creation";

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
