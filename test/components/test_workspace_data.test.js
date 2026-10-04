import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getUserOverview: vi.fn(),
  listRepos: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repoAPI: api, authAPI: {}, settingsAPI: {} }));

import { useAuthStore } from "@/stores/auth";
import { useWorkspaceData } from "@/components/home/workspace/useWorkspaceData";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

describe("workspace data lifecycle", () => {
  const wrappers = [];
  let auth;
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    auth = useAuthStore();
    auth.user = { username: "alice" };
    api.getUserOverview.mockResolvedValue({
      data: { models: [], datasets: [], spaces: [] },
    });
    api.listRepos.mockResolvedValue({ data: [] });
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

  function start() {
    let data;
    const wrapper = mount(
      defineComponent({
        setup() {
          data = useWorkspaceData();
          return () => h("div");
        },
      }),
    );
    wrappers.push(wrapper);
    return { data, wrapper };
  }

  it("clears private data and local controls synchronously on account switches", async () => {
    auth.userOrganizations = [{ name: "alice-private-org" }];
    api.getUserOverview.mockResolvedValueOnce({
      data: {
        models: [
          { id: "alice/private", private: true, lastModified: "2026-01-01" },
        ],
      },
    });
    api.listRepos.mockResolvedValueOnce({
      data: [{ id: "alice/trending-private" }],
    });
    const { data } = start();
    await flushPromises();
    data.filter.value = "private";
    data.feedType.value = "dataset";
    data.personalExpanded.value = true;
    auth.user = { username: "bob" };
    expect(data.repositories.value).toEqual([]);
    expect(data.trendingRepositories.value).toEqual([]);
    expect(data.organizations.value).toEqual([]);
    expect(data.filter.value).toBe("");
    expect(data.feedType.value).toBe("all");
    expect(data.personalExpanded.value).toBe(false);
    expect(data.loading.value).toBe(true);
    expect(api.getUserOverview).toHaveBeenLastCalledWith("bob", "updated", 7);
    auth.userOrganizations = [{ name: "bob-team" }];
    expect(data.organizations.value).toEqual([{ name: "bob-team" }]);
    await flushPromises();
  });

  it("rejects old same-account responses after logout and sign-in", async () => {
    const oldPersonal = deferred();
    const oldTrending = deferred();
    api.getUserOverview.mockReturnValueOnce(oldPersonal.promise);
    api.listRepos.mockReturnValueOnce(oldTrending.promise);
    const { data } = start();
    auth.user = null;
    expect(data.loading.value).toBe(false);
    expect(data.trendingLoading.value).toBe(false);
    auth.user = { username: "alice" };
    await flushPromises();
    oldPersonal.resolve({ data: { models: [{ id: "alice/stale" }] } });
    oldTrending.resolve({ data: [{ id: "alice/stale-trending" }] });
    await flushPromises();
    expect(data.repositories.value).toEqual([]);
    expect(data.trendingRepositories.value).toEqual([]);
    expect(data.error.value).toBe(false);
    expect(data.trendingError.value).toBe(false);
  });

  it.each(["token", "account id"])(
    "clears already displayed repositories when the same user's %s changes",
    async (change) => {
      auth.user = { username: "alice", id: 1 };
      auth.token = "old-session";
      api.getUserOverview.mockResolvedValueOnce({
        data: { models: [{ id: "alice/private" }] },
      });
      api.listRepos.mockResolvedValueOnce({
        data: [{ id: "alice/private-trending" }],
      });
      const { data } = start();
      await flushPromises();
      expect(data.repositories.value).toHaveLength(1);
      expect(data.trendingRepositories.value).toHaveLength(1);
      api.getUserOverview.mockReturnValueOnce(deferred().promise);
      api.listRepos.mockReturnValueOnce(deferred().promise);
      data.filter.value = "private";
      data.feedType.value = "space";
      data.personalExpanded.value = true;
      if (change === "token") auth.token = "new-session";
      else auth.user.id = 2;
      expect(data.repositories.value).toEqual([]);
      expect(data.trendingRepositories.value).toEqual([]);
      expect(data.filter.value).toBe("");
      expect(data.feedType.value).toBe("all");
      expect(data.personalExpanded.value).toBe(false);
      expect(data.loading.value).toBe(true);
      expect(data.trendingLoading.value).toBe(true);
    },
  );

  it.each(["token", "account id"])(
    "clears same-name private data on %s changes and rejects late results",
    async (change) => {
      auth.user = {
        username: "alice",
        id: 1,
        organizations: [{ name: "old-team" }],
      };
      auth.token = "old-session";
      api.getUserOverview.mockResolvedValueOnce({
        data: { models: [{ id: "alice/private" }] },
      });
      api.listRepos.mockResolvedValueOnce({
        data: [{ id: "alice/private-trending" }],
      });
      const { data } = start();
      await flushPromises();
      const oldPersonal = deferred();
      const oldTrending = deferred();
      api.getUserOverview.mockReturnValueOnce(oldPersonal.promise);
      api.listRepos.mockReturnValueOnce(oldTrending.promise);
      data.loadRepositories();
      data.loadTrending();
      if (change === "token") auth.token = "new-session";
      else auth.user.id = 2;
      expect(data.repositories.value).toEqual([]);
      expect(data.trendingRepositories.value).toEqual([]);
      expect(data.organizations.value).toEqual([]);
      expect(api.getUserOverview).toHaveBeenCalledTimes(3);
      expect(api.getUserOverview).toHaveBeenLastCalledWith(
        "alice",
        "updated",
        7,
      );
      await flushPromises();
      oldPersonal.resolve({
        data: { models: [{ id: "alice/stale-private" }] },
      });
      oldTrending.reject(new Error("old session failure"));
      await flushPromises();
      expect(data.repositories.value).toEqual([]);
      expect(data.trendingRepositories.value).toEqual([]);
      expect(data.loading.value).toBe(false);
      expect(data.trendingLoading.value).toBe(false);
      expect(data.error.value).toBe(false);
      expect(data.trendingError.value).toBe(false);
    },
  );

  it("uses fresh organizations embedded in a replacement user instead of stale store data", async () => {
    auth.userOrganizations = [{ name: "alice-team" }];
    const { data } = start();
    auth.user = { username: "bob", organizations: [{ name: "bob-team" }] };
    expect(data.organizations.value).toEqual([{ name: "bob-team" }]);
    auth.user = {
      username: "bob",
      organizations: [{ name: "bob-updated-team" }],
    };
    expect(data.organizations.value).toEqual([{ name: "bob-updated-team" }]);
    auth.user = null;
    expect(data.organizations.value).toEqual([]);
    await flushPromises();
  });

  it("keeps trending type races independent of personal updates", async () => {
    const oldModels = deferred();
    api.listRepos.mockReturnValueOnce(oldModels.promise);
    api.listRepos.mockResolvedValueOnce({ data: [{ id: "bob/dataset" }] });
    api.getUserOverview.mockResolvedValue({
      data: { models: [{ id: "alice/own" }] },
    });
    const { data } = start();
    data.trendingType.value = "dataset";
    await flushPromises();
    oldModels.reject(new Error("late model failure"));
    await flushPromises();
    expect(data.trendingRepositories.value).toEqual([{ id: "bob/dataset" }]);
    expect(data.trendingError.value).toBe(false);
    expect(data.repositories.value[0].id).toBe("alice/own");
    expect(api.getUserOverview).toHaveBeenCalledTimes(1);
  });

  it("ignores completion and errors after disposal", async () => {
    const personal = deferred();
    const trending = deferred();
    api.getUserOverview.mockReturnValueOnce(personal.promise);
    api.listRepos.mockReturnValueOnce(trending.promise);
    const { data, wrapper } = start();
    wrapper.unmount();
    personal.resolve({ data: { spaces: [{ id: "alice/late-space" }] } });
    trending.reject(new Error("late error"));
    await flushPromises();
    expect(data.repositories.value).toEqual([]);
    expect(data.trendingError.value).toBe(false);
  });

  it("merges recently active models, datasets and spaces with creation fallback", async () => {
    api.getUserOverview.mockResolvedValueOnce({
      data: {
        models: [
          {
            id: "alice/old-active",
            createdAt: "2020-01-01",
            lastModified: "2026-03-04",
          },
          {
            id: "alice/model",
            createdAt: "2026-03-01",
            lastModified: "2026-03-01",
          },
        ],
        datasets: [
          {
            id: "alice/new-dataset",
            createdAt: "2026-03-03",
            lastModified: null,
          },
        ],
        spaces: [
          {
            id: "alice/space",
            createdAt: "2026-03-02",
            lastModified: "2026-03-02",
          },
        ],
      },
    });
    const { data } = start();
    await flushPromises();
    expect(api.getUserOverview).toHaveBeenCalledWith("alice", "updated", 7);
    expect(
      data.repositories.value.map(({ id, type }) => ({ id, type })),
    ).toEqual([
      { id: "alice/old-active", type: "model" },
      { id: "alice/new-dataset", type: "dataset" },
      { id: "alice/space", type: "space" },
      { id: "alice/model", type: "model" },
    ]);
  });
});
