import { describe, expect, it } from "vitest";
import {
  readDiscoveryQuery,
  discoveryQuery,
  discoveryParams,
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
