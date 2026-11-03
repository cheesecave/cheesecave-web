import { afterEach, describe, expect, it, vi } from "vitest";
import api, { collectionsAPI } from "@/utils/api";

const SLUG = "alice/iccv-2026-6ae8b2220654892215f0a71c";
const ITEM = "6ae8b2220654892215f0a71d";

afterEach(() => vi.restoreAllMocks());

describe("collectionsAPI.list", () => {
  it("sends each parameter, repeating a list and leaving out what is empty", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    await collectionsAPI.list({
      owner: ["alice", "lab"],
      sort: "upvotes",
      q: "",
      limit: 12,
      cursor: undefined,
      expand: null,
    });
    expect(get).toHaveBeenCalledExactlyOnceWith(
      "/api/collections?owner=alice&owner=lab&sort=upvotes&limit=12",
    );
  });

  it("works with no parameter at all", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    await collectionsAPI.list();
    expect(get).toHaveBeenCalledExactlyOnceWith("/api/collections?");
  });

  it("encodes what could break the query", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    await collectionsAPI.list({ q: "a&b=c d" });
    expect(get).toHaveBeenCalledExactlyOnceWith(
      "/api/collections?q=a%26b%3Dc+d",
    );
  });
});

describe("collectionsAPI on one collection", () => {
  it("asks for the right paths and methods", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({});
    const post = vi.spyOn(api, "post").mockResolvedValue({});
    const patch = vi.spyOn(api, "patch").mockResolvedValue({});
    const del = vi.spyOn(api, "delete").mockResolvedValue({});

    await collectionsAPI.get(SLUG);
    await collectionsAPI.create({ title: "T" });
    await collectionsAPI.update(SLUG, { title: "New" });
    await collectionsAPI.remove(SLUG);
    await collectionsAPI.addItem(SLUG, { type: "model", id: "a/b" }, "note");
    await collectionsAPI.updateItem(SLUG, ITEM, { note: "n" });
    await collectionsAPI.removeItem(SLUG, ITEM);
    await collectionsAPI.batchItems(SLUG, [
      { action: "update", _id: ITEM, data: {} },
    ]);
    await collectionsAPI.upvote(SLUG);
    await collectionsAPI.removeUpvote(SLUG);

    expect(get).toHaveBeenCalledExactlyOnceWith(`/api/collections/${SLUG}`);
    expect(patch.mock.calls).toEqual([
      [`/api/collections/${SLUG}`, { title: "New" }],
      [`/api/collections/${SLUG}/items/${ITEM}`, { note: "n" }],
    ]);
    expect(post.mock.calls).toEqual([
      ["/api/collections", { title: "T" }],
      [
        `/api/collections/${SLUG}/items`,
        { item: { type: "model", id: "a/b" }, note: "note" },
      ],
      [
        `/api/collections/${SLUG}/items/batch`,
        [{ action: "update", _id: ITEM, data: {} }],
      ],
      [`/api/collections/${SLUG}/upvote`],
    ]);
    expect(del.mock.calls).toEqual([
      [`/api/collections/${SLUG}`],
      [`/api/collections/${SLUG}/items/${ITEM}`],
      [`/api/collections/${SLUG}/upvote`],
    ]);
  });

  it("accepts letters of any script and dots, hyphens and underscores in a slug", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({});
    await collectionsAPI.get("数据集/合集-6ae8b2220654892215f0a71c");
    await collectionsAPI.get("a.b_c-d/x.y-6ae8b2220654892215f0a71c");
    expect(get.mock.calls[0][0]).toBe(
      "/api/collections/%E6%95%B0%E6%8D%AE%E9%9B%86/%E5%90%88%E9%9B%86-6ae8b2220654892215f0a71c",
    );
    expect(get.mock.calls[1][0]).toBe(
      "/api/collections/a.b_c-d/x.y-6ae8b2220654892215f0a71c",
    );
  });
});

describe("a slug from the address bar cannot steer a request elsewhere", () => {
  const BAD_SLUGS = [
    "../../auth/tokens/x",
    "alice/../../api/auth/tokens",
    "..%2F..%2Fapi/x",
    "alice/x?y=1",
    "alice/x#y",
    "alice/.",
    "./x",
    "alice//x",
    "alice",
    "alice/a/b",
    "/alice/x",
    "-alice/x",
    "alice/x y",
    "alice/%2e%2e",
    "",
    undefined,
    null,
    42,
  ];

  const CALLS = [
    (slug) => collectionsAPI.get(slug),
    (slug) => collectionsAPI.update(slug, {}),
    (slug) => collectionsAPI.remove(slug),
    (slug) => collectionsAPI.addItem(slug, {}, ""),
    (slug) => collectionsAPI.updateItem(slug, ITEM, {}),
    (slug) => collectionsAPI.removeItem(slug, ITEM),
    (slug) => collectionsAPI.batchItems(slug, []),
    (slug) => collectionsAPI.upvote(slug),
    (slug) => collectionsAPI.removeUpvote(slug),
  ];

  it("refuses every one of them, for every call, before anything is sent", async () => {
    const spies = ["get", "post", "patch", "delete"].map((m) =>
      vi.spyOn(api, m).mockResolvedValue({}),
    );
    for (const slug of BAD_SLUGS) {
      for (const call of CALLS) {
        await expect(call(slug)).rejects.toMatchObject({
          message: "Collection not found",
          response: { status: 404 },
        });
      }
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("refuses an item id that is not 24 hex characters", async () => {
    const spies = ["patch", "delete"].map((m) =>
      vi.spyOn(api, m).mockResolvedValue({}),
    );
    for (const id of [
      "../x",
      "short",
      "g".repeat(24),
      "a".repeat(25),
      undefined,
      7,
    ]) {
      await expect(
        collectionsAPI.updateItem(SLUG, id, {}),
      ).rejects.toMatchObject({ response: { status: 404 } });
      await expect(collectionsAPI.removeItem(SLUG, id)).rejects.toMatchObject({
        response: { status: 404 },
      });
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("accepts an item id in either case", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({});
    await collectionsAPI.updateItem(SLUG, ITEM.toUpperCase(), {});
    expect(patch).toHaveBeenCalledOnce();
  });
});
