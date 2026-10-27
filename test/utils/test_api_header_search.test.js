import { describe, expect, it, vi } from "vitest";
import api, { repoAPI } from "@/utils/api";

describe("local header repository search request", () => {
  it("forwards cancellation and local trending/search params without reordering server results", async () => {
    const response = { data: [{ id: "b/second" }, { id: "a/first" }] };
    const get = vi.spyOn(api, "get").mockResolvedValue(response);
    const controller = new AbortController();
    const result = await repoAPI.listRepos(
      "model",
      { fallback: false, sort: "trending", limit: 3, search: "cats & dogs" },
      { signal: controller.signal },
    );
    expect(get).toHaveBeenCalledExactlyOnceWith("/api/models", {
      signal: controller.signal,
      params: {
        partial: "ok",
        fallback: false,
        sort: "trending",
        limit: 3,
        search: "cats & dogs",
      },
    });
    expect(result).toBe(response);
    expect(result.data.map((repo) => repo.id)).toEqual(["b/second", "a/first"]);
  });
});
