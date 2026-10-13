// The repository list endpoints answer a bare array and, when there is more, `Link: <url>; rel="next"` (the format of
// GitHub and of the Hugging Face Hub). `X-Cheesecave-Incomplete` names the external sources the server had to leave
// out when the caller accepted a partial answer (`partial=ok`).

import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadApi() {
  vi.resetModules();
  const module = await import("@/utils/api");
  return { apiClient: module.default, repoAPI: module.repoAPI };
}

const page = (items, headers = {}) => ({ data: items, headers });
const repo = (id) => ({ id });

describe("repository list requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a partial answer by default, and lets the caller say otherwise", async () => {
    const { apiClient, repoAPI } = await loadApi();
    const get = vi.spyOn(apiClient, "get").mockResolvedValue(page([]));

    await repoAPI.listRepos("model", { limit: 3, sort: "trending" });
    await repoAPI.listRepos("dataset", { partial: "no" });

    expect(get).toHaveBeenNthCalledWith(1, "/api/models", {
      params: { partial: "ok", limit: 3, sort: "trending" },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/api/datasets", {
      params: { partial: "no" },
    });
  });

  it("returns what an old server answers: one page, no headers", async () => {
    const { apiClient, repoAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: [repo("a/one"), repo("a/two")] });

    const result = await repoAPI.listAllRepos("space", {
      author: "a",
      sort: "recent",
    });

    expect(result).toEqual({
      data: [repo("a/one"), repo("a/two")],
      incomplete: [],
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/spaces", {
      params: { partial: "ok", limit: 100000, author: "a", sort: "recent" },
    });
  });

  it("follows the next link until the last page and keeps the order", async () => {
    const { apiClient, repoAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce(
        page([repo("a/1")], {
          link: '</api/models?author=a&cursor=c1>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(
        page([repo("a/2")], {
          link: '</api/models?author=a&cursor=c2>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(page([repo("a/3")], {}));

    const result = await repoAPI.listAllRepos("model", { author: "a" });

    expect(result.data.map((item) => item.id)).toEqual(["a/1", "a/2", "a/3"]);
    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "/api/models",
      "/api/models?author=a&cursor=c1",
      "/api/models?author=a&cursor=c2",
    ]);
  });

  it("asks only its own origin, whatever host the link names", async () => {
    // the request carries the session and the tokens: a link must not be able to send them elsewhere
    const { apiClient, repoAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce(
        page([repo("a/1")], {
          link: '<https://elsewhere.example:9000/api/models?author=a&cursor=c1>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(page([repo("a/2")]));

    await repoAPI.listAllRepos("model", { author: "a" });

    expect(get.mock.calls[1][0]).toBe("/api/models?author=a&cursor=c1");
  });

  it.each([
    ['<ok?c=1>; rel="prev", <ok?c=2>; rel="next"', "ok?c=2"],
    ["<ok?c=2>; rel=next", "ok?c=2"],
    ['<ok?c=2>; title="the next one"; rel="next"', "ok?c=2"],
    ['<ok?c=2>; rel="next last"', "ok?c=2"],
  ])("reads the next relation of %s", async (link, target) => {
    const { apiClient, repoAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce(page([repo("a/1")], { link }))
      .mockResolvedValueOnce(page([repo("a/2")]));

    await repoAPI.listAllRepos("model", {});

    expect(get.mock.calls[1][0]).toBe(`/${target}`);
  });

  it.each(['<ok?c=1>; rel="prev"', "garbage", ""])(
    "stops where there is no next relation (%j)",
    async (link) => {
      const { apiClient, repoAPI } = await loadApi();
      const get = vi
        .spyOn(apiClient, "get")
        .mockResolvedValue(page([repo("a/1")], { link }));

      const result = await repoAPI.listAllRepos("model", {});

      expect(result.data).toHaveLength(1);
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it("collects the sources the server left out, once each", async () => {
    const { apiClient, repoAPI } = await loadApi();
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce(
        page([repo("a/1")], {
          link: '</api/models?cursor=c1>; rel="next"',
          "x-cheesecave-incomplete": "HuggingFace, Mirror",
        }),
      )
      .mockResolvedValueOnce(
        page([repo("a/2")], { "x-cheesecave-incomplete": " HuggingFace ,," }),
      );

    const result = await repoAPI.listAllRepos("model", {});

    expect(result.incomplete).toEqual(["HuggingFace", "Mirror"]);
  });

  it("does not loop on a server that repeats its link", async () => {
    const { apiClient, repoAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue(
        page([repo("a/1")], { link: '</api/models?cursor=same>; rel="next"' }),
      );

    const result = await repoAPI.listAllRepos("model", {});

    // the first page, the page behind the link, then the repeated link is refused
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(2);
  });

  it("stops after a bounded number of pages", async () => {
    const { apiClient, repoAPI } = await loadApi();
    let counter = 0;
    const get = vi.spyOn(apiClient, "get").mockImplementation(async () =>
      page([repo(`a/${counter}`)], {
        link: `</api/models?cursor=c${++counter}>; rel="next"`,
      }),
    );

    const result = await repoAPI.listAllRepos("model", {});

    expect(get).toHaveBeenCalledTimes(100);
    expect(result.data).toHaveLength(100);
  });

  it("copes with a page that has no body", async () => {
    const { apiClient, repoAPI } = await loadApi();
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({
        data: null,
        headers: { link: '</x?c=1>; rel="next"' },
      })
      .mockResolvedValueOnce({ data: null });

    const result = await repoAPI.listAllRepos("model", {});

    expect(result).toEqual({ data: [], incomplete: [] });
  });
});
