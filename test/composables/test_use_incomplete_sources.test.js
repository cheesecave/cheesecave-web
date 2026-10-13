// One list per repository type can come back incomplete; a page shows the union.

import { describe, expect, it } from "vitest";
import { useIncompleteSources } from "@/composables/useIncompleteSources";

describe("useIncompleteSources", () => {
  it("starts empty", () => {
    expect(useIncompleteSources().sources.value).toEqual([]);
  });

  it("is the union of what each type reports, and follows a type that is reloaded", () => {
    const { sources, record } = useIncompleteSources();

    record("model", ["HuggingFace"]);
    record("dataset", ["HuggingFace", "Mirror"]);
    expect(sources.value).toEqual(["HuggingFace", "Mirror"]);

    record("dataset", []);
    record("model", []);
    expect(sources.value).toEqual([]);
  });
});
