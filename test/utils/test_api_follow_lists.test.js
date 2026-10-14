// Follower/following lists: the Hub shape (bare array + `Link: rel="next"`) and the legacy object are both
// handed to the dialog as the legacy object, so front and back can be deployed in either order.

import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadApi() {
  vi.resetModules();
  const module = await import("@/utils/api");
  return { apiClient: module.default, socialAPI: module.socialAPI };
}

const hub = (user, type = "user") => ({
  user,
  fullname: `${user} full`,
  type,
  avatarUrl: `/a/${user}.png`,
  isPro: false,
});
const legacyBody = {
  items: [{ username: "x", full_name: "X", is_org: false, avatar_url: null }],
  has_more: true,
  next_cursor: "c1",
};

describe("follow list responses", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["listFollowers", "/api/users/bob%2Fx/followers"],
    ["listFollowing", "/api/users/bob%2Fx/following"],
  ])("%s leaves the legacy object unchanged", async (method, path) => {
    const { apiClient, socialAPI } = await loadApi();
    const get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ data: legacyBody, headers: {} });

    const response = await socialAPI[method]("bob/x", { limit: 20 });

    expect(get).toHaveBeenCalledWith(path, { params: { limit: 20 } });
    expect(response.data).toBe(legacyBody);
  });

  it("turns the Hub array and its Link cursor into the legacy object", async () => {
    const { apiClient, socialAPI } = await loadApi();
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: [hub("alice"), hub("acme", "org")],
      headers: {
        link: '<https://evil.example/api/users/bob/followers?limit=2&cursor=a%2Bb%3D>; rel="next"',
      },
    });

    const response = await socialAPI.listFollowers("bob", { limit: 2 });

    expect(response.data).toEqual({
      items: [
        {
          username: "alice",
          full_name: "alice full",
          is_org: false,
          avatar_url: "/a/alice.png",
        },
        {
          username: "acme",
          full_name: "acme full",
          is_org: true,
          avatar_url: "/a/acme.png",
        },
      ],
      next_cursor: "a+b=",
      has_more: true,
    });
  });

  it("ends the list when the last Hub page has no Link, with or without headers", async () => {
    const { apiClient, socialAPI } = await loadApi();
    const get = vi.spyOn(apiClient, "get");
    get.mockResolvedValueOnce({ data: [hub("a")], headers: {} });
    get.mockResolvedValueOnce({ data: [] });
    get.mockResolvedValueOnce({
      data: [hub("a")],
      headers: { link: '<https://h/x?limit=2>; rel="next"' },
    });

    for (const expectedItems of [1, 0, 1]) {
      const { data } = await socialAPI.listFollowing("bob");
      expect(data.items).toHaveLength(expectedItems);
      expect(data.next_cursor).toBeNull();
      expect(data.has_more).toBe(false);
    }
  });
});
