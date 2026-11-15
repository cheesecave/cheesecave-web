import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const api = vi.hoisted(() => ({
  listCommits: vi.fn(),
  getCommitCount: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repoAPI: api }));
import RepoLatestCommit from "@/components/repo/RepoLatestCommit.vue";
import RepoHistoryLink from "@/components/repo/RepoHistoryLink.vue";
import ErrorState from "@/components/common/ErrorState.vue";

const commit = {
  id: "abcdef123456",
  title: "A controlled commit",
  author: "alice",
  date: 1,
};
const wrappers = [];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function render(component, props = {}) {
  const wrapper = mount(component, {
    props: {
      repoType: "model",
      namespace: "acme",
      name: "demo",
      branch: "main",
      ...props,
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        EntityAvatar: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  api.listCommits.mockResolvedValue({ data: { commits: [commit] } });
  api.getCommitCount.mockResolvedValue({ data: { count: 3 } });
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));

describe("Shared directory commit presenters", () => {
  it("preserves ordinary latest commit and exact count APIs", async () => {
    const latest = render(RepoLatestCommit);
    const history = render(RepoHistoryLink);
    await flushPromises();
    expect(api.listCommits).toHaveBeenCalledWith(
      "model",
      "acme",
      "demo",
      "main",
      { limit: 1 },
    );
    expect(api.getCommitCount).toHaveBeenCalledWith(
      "model",
      "acme",
      "demo",
      "main",
      { signal: expect.any(AbortSignal) },
    );
    expect(latest.get(".latest-commit-title").attributes("href")).toBe(
      "/models/acme/demo/commit/abcdef123456",
    );
    expect(history.text()).toContain("History: 3 commits");
  });
  it("renders controlled values using identical presenters without ordinary API requests", async () => {
    const source = {
      latestCommit: vi.fn().mockResolvedValue(commit),
      commitCount: vi.fn().mockResolvedValue(1),
    };
    const latest = render(RepoLatestCommit, { source });
    const history = render(RepoHistoryLink, { source });
    await flushPromises();
    expect(source.latestCommit).toHaveBeenCalledOnce();
    expect(source.commitCount).toHaveBeenCalledOnce();
    expect(latest.get(".latest-commit-title").attributes("href")).toBe(
      "/models/acme/demo/commits/main?commit=abcdef123456",
    );
    expect(history.text()).toContain("History: 1 commit");
    expect(api.listCommits).not.toHaveBeenCalled();
    expect(api.getCommitCount).not.toHaveBeenCalled();
  });
  it("keeps unknown bounded history counts unknown and supports an empty commit", async () => {
    const source = {
      latestCommit: vi.fn().mockResolvedValue(null),
      commitCount: vi.fn().mockResolvedValue(null),
    };
    const latest = render(RepoLatestCommit, { source });
    const history = render(RepoHistoryLink, { source });
    await flushPromises();
    expect(latest.text()).toContain("No commits yet");
    expect(history.text().trim()).toBe("History");
    expect(history.find('[aria-label="Retry commit count"]').exists()).toBe(
      false,
    );
    expect(api.listCommits).not.toHaveBeenCalled();
    expect(api.getCommitCount).not.toHaveBeenCalled();
  });
  it("never falls back to ordinary APIs when controlled callbacks are absent", async () => {
    const latest = render(RepoLatestCommit, { source: {} });
    const history = render(RepoHistoryLink, { source: {} });
    await flushPromises();
    expect(latest.text()).toContain("No commits yet");
    expect(history.text().trim()).toBe("History");
    expect(api.listCommits).not.toHaveBeenCalled();
    expect(api.getCommitCount).not.toHaveBeenCalled();
  });
  it("encodes controlled history destinations", async () => {
    const latest = render(RepoLatestCommit, {
      name: "my repo",
      branch: "release/v2",
      source: { latestCommit: async () => ({ ...commit, id: "abc?def" }) },
    });
    await flushPromises();
    expect(latest.get(".latest-commit-title").attributes("href")).toBe(
      "/models/acme/my%20repo/commits/release%2Fv2?commit=abc%3Fdef",
    );
  });
  it.each([RepoLatestCommit, RepoHistoryLink])(
    "ignores superseded controlled responses and failures for %s",
    async (component) => {
      const old = deferred(),
        denied = vi.fn();
      const source = {
        latestCommit: () => old.promise,
        commitCount: () => old.promise,
        onAccessDenied: denied,
      };
      const wrapper = render(component, { source });
      const next = {
        latestCommit: async () => ({ ...commit, title: "New source" }),
        commitCount: async () => 7,
      };
      await wrapper.setProps({ source: next });
      await flushPromises();
      expect(wrapper.text()).toContain(
        component === RepoLatestCommit ? "New source" : "History: 7 commits",
      );
      old.reject({ response: { status: 403 } });
      await flushPromises();
      expect(denied).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain(
        component === RepoLatestCommit ? "New source" : "History: 7 commits",
      );
      expect(api.listCommits).not.toHaveBeenCalled();
      expect(api.getCommitCount).not.toHaveBeenCalled();
    },
  );
  it.each([RepoLatestCommit, RepoHistoryLink])(
    "rechecks denied controlled requests for %s",
    async (component) => {
      const error = { response: { status: 403 } },
        denied = vi.fn();
      const source = {
        latestCommit: vi.fn().mockRejectedValue(error),
        commitCount: vi.fn().mockRejectedValue(error),
        onAccessDenied: denied,
      };
      render(component, { source });
      await flushPromises();
      expect(denied).toHaveBeenCalledExactlyOnceWith(error);
      expect(api.listCommits).not.toHaveBeenCalled();
      expect(api.getCommitCount).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid controlled counts and retries through the same controlled source", async () => {
    const source = {
      commitCount: vi.fn().mockResolvedValueOnce(-1).mockResolvedValue(2),
      onAccessDenied: vi.fn(),
    };
    const history = render(RepoHistoryLink, { source });
    await flushPromises();
    expect(history.text()).not.toContain("-1");
    await history.get('[aria-label="Retry commit count"]').trigger("click");
    await flushPromises();
    expect(history.text()).toContain("History: 2 commits");
    expect(source.onAccessDenied).toHaveBeenCalledOnce();
    expect(api.getCommitCount).not.toHaveBeenCalled();
  });
  it.each([RepoLatestCommit, RepoHistoryLink])(
    "dispatches optional parent-source retry for %s",
    async (component) => {
      const source = {
        latestCommit: vi
          .fn()
          .mockRejectedValue(new Error("Unavailable history")),
        commitCount: vi
          .fn()
          .mockRejectedValue(new Error("Unavailable history")),
        reload: vi.fn().mockResolvedValue(undefined),
      };
      const wrapper = render(component, { source });
      await flushPromises();
      if (component === RepoLatestCommit)
        await wrapper.getComponent(ErrorState).props("retry")();
      else
        await wrapper.get('[aria-label="Retry commit count"]').trigger("click");
      await flushPromises();
      expect(source.reload).toHaveBeenCalledOnce();
      expect(
        component === RepoLatestCommit
          ? source.latestCommit
          : source.commitCount,
      ).toHaveBeenCalledOnce();
      expect(api.listCommits).not.toHaveBeenCalled();
      expect(api.getCommitCount).not.toHaveBeenCalled();
    },
  );
  it("retries latest commits through its own resource when no parent reload exists", async () => {
    const source = {
      latestCommit: vi
        .fn()
        .mockRejectedValueOnce(new Error("Unavailable history"))
        .mockResolvedValue(commit),
    };
    const wrapper = render(RepoLatestCommit, { source });
    await flushPromises();
    await wrapper.getComponent(ErrorState).props("retry")();
    await flushPromises();
    expect(source.latestCommit).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(commit.title);
    expect(api.listCommits).not.toHaveBeenCalled();
  });
  it("keeps external repositories outside both ordinary and controlled fetches", async () => {
    const source = { latestCommit: vi.fn(), commitCount: vi.fn() };
    render(RepoLatestCommit, { source, external: true });
    const history = render(RepoHistoryLink, {
      source,
      external: true,
      sourceUrl: "https://example.com/history",
    });
    await flushPromises();
    expect(source.latestCommit).not.toHaveBeenCalled();
    expect(source.commitCount).not.toHaveBeenCalled();
    expect(api.listCommits).not.toHaveBeenCalled();
    expect(api.getCommitCount).not.toHaveBeenCalled();
    expect(history.get("a").attributes("href")).toBe(
      "https://example.com/history",
    );
  });
});
