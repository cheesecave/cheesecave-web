import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  getPathsInfo: vi.fn(),
  getCommitDetail: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repoAPI: mocks }));

import RepositoryFileCommit from "@/components/repo/RepositoryFileCommit.vue";

const sha = "1234567890abcdef";
const commit = { id: sha, title: "Update this file", author: "alice", date: 1 };
const entry = (path, lastCommit = commit) => ({
  type: "file",
  path,
  lastCommit,
});
const wrappers = [];
const pending = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
function render(props = {}) {
  const wrapper = mount(RepositoryFileCommit, {
    props: {
      repoType: "dataset",
      namespace: "acme",
      name: "demo",
      branch: "main",
      path: "docs/readme.md",
      ...props,
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        EntityAvatar: true,
        ElTable: true,
        ElTableColumn: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("RepositoryFileCommit", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.getPathsInfo.mockReset();
    mocks.getCommitDetail.mockReset();
    mocks.getPathsInfo.mockResolvedValue({ data: [entry("docs/readme.md")] });
    mocks.getCommitDetail.mockResolvedValue({ data: commit });
  });
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  it("requests expanded metadata for this file and renders real commit links with a plain date", async () => {
    const wrapper = render();
    await vi.waitFor(() => expect(wrapper.text()).toContain(commit.title));
    expect(mocks.getPathsInfo).toHaveBeenCalledExactlyOnceWith(
      "dataset",
      "acme",
      "demo",
      "main",
      ["docs/readme.md"],
      true,
    );
    expect(wrapper.get('a[href="/alice"]').text()).toBe("alice");
    expect(mocks.getCommitDetail).not.toHaveBeenCalled();
    const commitLinks = wrapper.findAll(
      `a[href="/datasets/acme/demo/commit/${sha}"]`,
    );
    expect(commitLinks.map((link) => link.text())).toEqual([
      commit.title,
      "1234567",
    ]);
    expect(wrapper.get(".file-commit-date").element.tagName).toBe("SPAN");
    expect(
      wrapper.get('a[href="/datasets/acme/demo/commits/main"]').text(),
    ).toBe("History");
  });

  it("keeps the selected branch on encoded commit and repository history links", async () => {
    const wrapper = render({ branch: "release/v2", name: "my repo" });
    await vi.waitFor(() => expect(wrapper.text()).toContain(commit.title));
    expect(wrapper.get(".file-commit-title").attributes("href")).toBe(
      `/datasets/acme/my%20repo/commit/${sha}?branch=release%2Fv2`,
    );
    expect(wrapper.get(".file-commit-history").attributes("href")).toBe(
      "/datasets/acme/my%20repo/commits/release%2Fv2",
    );
  });

  it("encodes a revision before paths-info so URL fragments stay part of the branch", async () => {
    const wrapper = render({ branch: "feature/a#b" });
    await vi.waitFor(() => expect(wrapper.text()).toContain(commit.title));
    expect(mocks.getPathsInfo).toHaveBeenCalledExactlyOnceWith(
      "dataset",
      "acme",
      "demo",
      "feature%2Fa%23b",
      ["docs/readme.md"],
      true,
    );
    expect(wrapper.get(".file-commit-title").attributes("href")).toBe(
      `/datasets/acme/demo/commit/${sha}?branch=feature%2Fa%23b`,
    );
  });

  it.each([
    { data: [] },
    { data: [entry("another.md")] },
    { data: [entry("docs/readme.md", null)] },
    { data: [entry("docs/readme.md", {})] },
  ])(
    "does not substitute another file or invent missing commit data: %j",
    async ({ data }) => {
      mocks.getPathsInfo.mockResolvedValue({ data });
      const wrapper = render();
      await vi.waitFor(() =>
        expect(wrapper.text()).toContain("No commit information"),
      );
      expect(wrapper.find(".file-commit-title").exists()).toBe(false);
      expect(wrapper.get(".file-commit-history").attributes("href")).toBe(
        "/datasets/acme/demo/commits/main",
      );
    },
  );

  it("shows its own loading and failure state, with a working retry", async () => {
    const gate = pending();
    mocks.getPathsInfo.mockImplementationOnce(() => gate.promise);
    const wrapper = render();
    expect(wrapper.get('[role="status"]').text()).toContain(
      "Loading file commit",
    );
    expect(wrapper.get(".file-commit-history").exists()).toBe(true);
    gate.resolve(
      Promise.reject({
        response: { status: 503, data: { error: "Unavailable" } },
      }),
    );
    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').exists()).toBe(true),
    );
    const retry = wrapper
      .findAll("button")
      .find((button) => /retry/i.test(button.text()));
    expect(retry).toBeDefined();
    await retry.trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain(commit.title));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.getPathsInfo).toHaveBeenCalledTimes(2);
  });

  it("ignores an old file and branch response after navigation", async () => {
    const gate = pending();
    mocks.getPathsInfo.mockImplementationOnce(() => gate.promise);
    const wrapper = render();
    mocks.getPathsInfo.mockResolvedValue({
      data: [
        entry("new.md", {
          ...commit,
          id: "new1234567",
          title: "New file change",
        }),
      ],
    });
    await wrapper.setProps({ path: "new.md", branch: "dev" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("New file change"));
    gate.resolve({ data: [entry("docs/readme.md")] });
    await flushPromises();
    expect(wrapper.text()).toContain("New file change");
    expect(wrapper.text()).not.toContain(commit.title);
    expect(wrapper.get(".file-commit-title").attributes("href")).toBe(
      "/datasets/acme/demo/commit/new1234567?branch=dev",
    );
  });

  it("loads a missing author by the exact file commit without delaying its summary", async () => {
    const authorGate = pending();
    mocks.getPathsInfo.mockResolvedValue({
      data: [entry("docs/readme.md", { ...commit, author: undefined })],
    });
    mocks.getCommitDetail.mockImplementationOnce(() => authorGate.promise);
    const wrapper = render();
    await vi.waitFor(() => expect(wrapper.text()).toContain(commit.title));
    expect(wrapper.get(".file-commit-sha").text()).toBe("1234567");
    expect(wrapper.find(".file-commit-author").exists()).toBe(false);
    expect(mocks.getCommitDetail).toHaveBeenCalledExactlyOnceWith(
      "dataset",
      "acme",
      "demo",
      sha,
      { signal: expect.any(AbortSignal) },
    );
    authorGate.resolve({ data: commit });
    await vi.waitFor(() =>
      expect(wrapper.get(".file-commit-author").text()).toBe("alice"),
    );
  });

  it("keeps the summary visible when author lookup fails and retries the author only", async () => {
    mocks.getPathsInfo.mockResolvedValue({
      data: [entry("docs/readme.md", { ...commit, author: undefined })],
    });
    mocks.getCommitDetail.mockRejectedValueOnce({
      response: { status: 503, data: { error: "Unavailable" } },
    });
    const wrapper = render();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').exists()).toBe(true),
    );
    expect(wrapper.get(".file-commit-title").text()).toBe(commit.title);
    const retry = wrapper
      .findAll("button")
      .find((button) => /retry/i.test(button.text()));
    await retry.trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.get(".file-commit-author").text()).toBe("alice"),
    );
    expect(mocks.getPathsInfo).toHaveBeenCalledTimes(1);
    expect(mocks.getCommitDetail).toHaveBeenCalledTimes(2);
  });

  it("ignores author responses for a previously selected file", async () => {
    const authorGate = pending();
    mocks.getPathsInfo.mockResolvedValueOnce({
      data: [entry("docs/readme.md", { ...commit, author: undefined })],
    });
    mocks.getCommitDetail.mockImplementationOnce(() => authorGate.promise);
    const wrapper = render();
    await vi.waitFor(() =>
      expect(mocks.getCommitDetail).toHaveBeenCalledTimes(1),
    );
    mocks.getPathsInfo.mockResolvedValue({
      data: [
        entry("other.md", {
          ...commit,
          id: "new1234567",
          author: "bob",
          title: "Other file",
        }),
      ],
    });
    await wrapper.setProps({ path: "other.md", branch: "dev" });
    await vi.waitFor(() =>
      expect(wrapper.get(".file-commit-author").text()).toBe("bob"),
    );
    authorGate.resolve({ data: commit });
    await flushPromises();
    expect(wrapper.get(".file-commit-author").text()).toBe("bob");
    expect(wrapper.text()).not.toContain("alice");
  });
});
