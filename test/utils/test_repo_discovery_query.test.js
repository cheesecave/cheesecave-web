import { describe, expect, it } from "vitest";
import {
  readDiscoveryQuery,
  discoveryQuery,
  discoveryParams,
  toggleFacet,
} from "@/utils/repo-discovery";

describe("discovery query canonicalization", () => {
  it.each(["trending", "recent", "updated", "downloads", "likes"])(
    "keeps the selected %s sort through URL parsing and API serialization",
    (sort) => {
      const state = readDiscoveryQuery({ sort }, "recent");
      expect(state.sort).toBe(sort);
      expect(discoveryParams(state).get("sort")).toBe(sort);
    },
  );
  it("rejects an unknown URL sort and keeps the saved fallback", () => {
    expect(readDiscoveryQuery({ sort: "unsupported" }, "downloads").sort).toBe(
      "downloads",
    );
  });
  it("normalizes mixed case URLs and deduplicates selections before requesting", () => {
    const state = readDiscoveryQuery(
      {
        library: [" Transformers ", "transformers"],
        license: "MIT",
        page: "2",
      },
      "recent",
    );
    expect(state.selected).toEqual({
      library: ["transformers"],
      license: ["mit"],
    });
    expect(discoveryQuery(state)).toEqual({
      sort: "recent",
      page: "2",
      library: ["transformers"],
      license: ["mit"],
    });
    expect(discoveryParams(state).getAll("library")).toEqual(["transformers"]);
    expect(discoveryParams(state).get("offset")).toBe("24");
  });
});

describe("toggling one filter value", () => {
  it("adds a value, keeping each key's values sorted", () => {
    expect(
      toggleFacet({ task: ["text-generation"] }, "task", "image-to-text"),
    ).toEqual({
      task: ["image-to-text", "text-generation"],
    });
    expect(toggleFacet({}, "license", "mit")).toEqual({ license: ["mit"] });
  });

  it("removes a value that is selected, and drops a key left empty", () => {
    expect(
      toggleFacet({ task: ["a", "b"], license: ["mit"] }, "task", "a"),
    ).toEqual({ task: ["b"], license: ["mit"] });
    expect(toggleFacet({ license: ["mit"] }, "license", "mit")).toEqual({});
  });

  it("leaves the selection it was given untouched", () => {
    const selected = Object.freeze({ task: Object.freeze(["a"]) });
    expect(toggleFacet(selected, "task", "b")).toEqual({ task: ["a", "b"] });
    expect(selected).toEqual({ task: ["a"] });
  });
});
