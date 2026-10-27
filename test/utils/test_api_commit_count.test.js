import { afterEach, describe, expect, it, vi } from "vitest";

import api, { repoAPI } from "@/utils/api";

describe("repository commit count API", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["model", "dataset"])(
    "gets a %s branch's count from its dedicated endpoint",
    async (repoType) => {
      const response = { data: { count: 37, head: "head123" } };
      const get = vi.spyOn(api, "get").mockResolvedValue(response);
      const result = await repoAPI.getCommitCount(
        repoType,
        "alice",
        "repo",
        "main",
      );
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toBe(
        `/api/${repoType}s/alice/repo/commit-count/main`,
      );
      expect(result).toBe(response);
    },
  );

  it("encodes branch names and forwards cancellation to the independent request", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValue({ data: { count: 0, head: null } });
    const controller = new AbortController();
    await repoAPI.getCommitCount("dataset", "alice", "repo", "feature/fix #1", {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/datasets/alice/repo/commit-count/feature%2Ffix%20%231",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
