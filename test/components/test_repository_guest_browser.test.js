import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const api = vi.hoisted(() => ({
  guestOverview: vi.fn(),
  guestTree: vi.fn(),
  guestPreview: vi.fn(),
  guestCommits: vi.fn(),
  guestFileInfo: vi.fn(),
  leaveGuest: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: api }));
import Viewer from "@/components/repo/RestrictedRepositoryViewer.vue";
import CodeViewer from "@/components/common/CodeViewer.vue";

const repo = { type: "model", namespace: "owner", name: "demo" };
const overview = () => ({
  id: "owner/demo",
  type: "model",
  author: "owner",
  created_by: "creator",
  private: true,
  invite_mode: true,
  created_at: "2026-11-01T00:00:00Z",
  last_modified: "2026-11-10T00:00:00Z",
  used_storage: 1234,
  downloads: 7,
  default_branch: "main",
  head: "a".repeat(40),
  readme: {
    path: "README.md",
    text: "---\nlicense: mit\nlanguage: en\n---\n# Model documentation\nUseful card text. [private](README.md)",
    truncated: false,
  },
  metadata: {},
});
const wrappers = [];
const mountViewer = (props = {}) => {
  const wrapper = mount(Viewer, {
    props: { repository: repo, embedded: true, view: "card", ...props },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
};
const button = (wrapper, label) =>
  wrapper.findAll("button,a").find((item) => item.text().trim() === label);

describe("normal repository browsing over controlled guest APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.guestOverview.mockResolvedValue({ data: overview() });
    api.guestTree.mockResolvedValue({
      data: {
        path: "",
        entries: [
          { path: "script.py", type: "file", size: 50, preview_kind: "text" },
          { path: "folder", type: "directory" },
        ],
        has_more: false,
      },
    });
    api.guestPreview.mockResolvedValue({
      data: {
        kind: "text",
        text: "print('bounded')\n",
        truncated: true,
        size: 50,
      },
    });
    api.guestFileInfo.mockResolvedValue({
      data: {
        path: "script.py",
        size: 50,
        last_modified: null,
        last_commit: null,
      },
    });
    api.guestCommits.mockResolvedValue({
      data: {
        commits: [
          {
            id: "a".repeat(40),
            message: "Add model documentation",
            timestamp: 1794268800,
            author: "owner",
          },
        ],
        has_more: false,
      },
    });
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

  it("shows README as the card and ordinary repository sidebar without a Preview only card", async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(api.guestOverview).toHaveBeenCalledWith(repo);
    expect(wrapper.get('[aria-label="Repository card"]').text()).toContain(
      "Model documentation",
    );
    expect(wrapper.text()).toContain("Relationships");
    expect(wrapper.text()).toContain("Created By:");
    expect(wrapper.text()).toContain("creator");
    expect(wrapper.text()).toContain("Info");
    expect(wrapper.text()).toContain("Storage");
    expect(wrapper.text()).not.toContain("Preview only");
    expect(wrapper.findAll("img,video,audio,iframe")).toHaveLength(0);
    expect(wrapper.html()).not.toMatch(/\/resolve\/|secret\.png/);
    expect(api.guestTree).not.toHaveBeenCalled();
    expect(wrapper.emitted("overview")[0][0].id).toBe("owner/demo");
  });

  it("loads every file page and performs folder-scoped prefix search through guestTree", async () => {
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          { path: "first.txt", type: "file", size: 4, preview_kind: "text" },
        ],
        has_more: true,
        next_cursor: "opaque-next",
      },
    });
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          { path: "second.txt", type: "file", size: 5, preview_kind: "text" },
        ],
        has_more: false,
      },
    });
    await button(wrapper, "Load More Files").trigger("click");
    await flushPromises();
    expect(api.guestTree).toHaveBeenLastCalledWith(repo, "", {
      cursor: "opaque-next",
      search: "",
    });
    expect(wrapper.text()).toContain("first.txt");
    expect(wrapper.text()).toContain("second.txt");
    api.guestTree.mockResolvedValueOnce({
      data: { path: "", entries: [], has_more: false },
    });
    await wrapper
      .get('input[aria-label="Filter files by name prefix"]')
      .setValue("second");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(api.guestTree).toHaveBeenLastCalledWith(repo, "", {
      search: "second",
    });
    expect(wrapper.text()).not.toContain("first.txt");
  });

  it("opens a dedicated file view with a normal code presenter and can return to Files", async () => {
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    await button(wrapper, "script.py").trigger("click");
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledWith(repo, "script.py");
    expect(wrapper.get('[aria-label="File header"]').text()).toContain(
      "script.py",
    );
    expect(wrapper.findComponent(CodeViewer).props("code")).toBe(
      "print('bounded')\n",
    );
    expect(wrapper.find('[aria-label="Repository files"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("This preview is limited");
    expect(wrapper.html()).not.toMatch(
      /\/resolve\/|download=|<iframe|<video|<audio/,
    );
    await button(wrapper, "Back to Files").trigger("click");
    expect(wrapper.find('[aria-label="Repository files"]').exists()).toBe(true);
  });

  it("renders Markdown file previews with the same safe card presentation", async () => {
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          { path: "docs/guide.md", type: "file", preview_kind: "text" },
        ],
        has_more: false,
      },
    });
    api.guestPreview.mockResolvedValueOnce({
      data: {
        kind: "text",
        text: "---\nlicense: mit\n---\n# File readme\n![secret](/models/owner/demo/resolve/main/private.png)",
        truncated: false,
      },
    });
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    await button(wrapper, "guide.md").trigger("click");
    await flushPromises();
    expect(
      wrapper.get('[aria-label="Controlled file preview"]').text(),
    ).toContain("File readme");
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("/resolve/");
    expect(wrapper.get('[aria-label="File metadata"]').text()).toContain(
      "license",
    );
  });

  it("shows card metadata and repository information without exposing metadata URL targets", async () => {
    const data = overview();
    data.readme.text =
      "---\nlicense: mit\nlanguage: en\nlicense_link: /models/owner/demo/resolve/main/LICENSE\nbase_model: owner/base\n---\n# Card";
    api.guestOverview.mockResolvedValueOnce({ data });
    const wrapper = mountViewer({ view: "metadata" });
    await flushPromises();
    expect(wrapper.get('[aria-label="Repository metadata"]').text()).toContain(
      "MIT",
    );
    expect(wrapper.html()).not.toContain("/resolve/");
    expect(wrapper.text()).toContain("owner/base");
    expect(api.guestPreview).not.toHaveBeenCalled();
  });

  it("loads and paginates commit metadata without reading historic file contents", async () => {
    api.guestCommits.mockResolvedValueOnce({
      data: {
        commits: [
          {
            id: "a".repeat(40),
            message: "First commit",
            author: "owner",
            timestamp: 1794268800,
          },
        ],
        has_more: true,
        next_cursor: "commit-next",
      },
    });
    const wrapper = mountViewer({ view: "commits" });
    await flushPromises();
    expect(wrapper.text()).toContain("First commit");
    api.guestCommits.mockResolvedValueOnce({
      data: {
        commits: [
          {
            id: "b".repeat(40),
            message: "Earlier commit",
            author: "owner",
            timestamp: 1794182400,
          },
        ],
        has_more: false,
      },
    });
    await button(wrapper, "Load More Commits").trigger("click");
    await flushPromises();
    expect(api.guestCommits).toHaveBeenLastCalledWith(repo, {
      cursor: "commit-next",
    });
    expect(wrapper.text()).toContain("Earlier commit");
    expect(api.guestPreview).not.toHaveBeenCalled();
    expect(api.guestTree).not.toHaveBeenCalled();
  });

  it("ignores late overview responses after changing repositories", async () => {
    let complete;
    api.guestOverview.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = mountViewer();
    await wrapper.setProps({ repository: { ...repo, name: "other" } });
    await flushPromises();
    complete({
      data: {
        ...overview(),
        readme: {
          path: "README.md",
          text: "# OLD PRIVATE CARD",
          truncated: false,
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("OLD PRIVATE CARD");
  });

  it("opens direct file routes without requesting the ordinary file tree", async () => {
    const wrapper = mountViewer({
      view: "files",
      filePath: "folder/script.py",
    });
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledExactlyOnceWith(
      repo,
      "folder/script.py",
    );
    expect(api.guestTree).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="File header"]').text()).toContain(
      "script.py",
    );
    await wrapper.setProps({ filePath: "folder/other.py" });
    await flushPromises();
    expect(api.guestPreview).toHaveBeenLastCalledWith(repo, "folder/other.py");
  });

  it("does not refetch when the parent echoes emitted folder and file route changes", async () => {
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "folder",
        entries: [
          { path: "folder/child.py", type: "file", preview_kind: "text" },
        ],
        has_more: false,
      },
    });
    await button(wrapper, "folder").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("open-folder")[0]).toEqual(["folder"]);
    await wrapper.setProps({ path: "folder" });
    await flushPromises();
    expect(api.guestTree).toHaveBeenCalledTimes(2);
    await button(wrapper, "child.py").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("open-file")[0]).toEqual(["folder/child.py"]);
    await wrapper.setProps({ path: "", filePath: "folder/child.py" });
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledTimes(1);
  });

  it("clears protected content and rechecks access when a guest session is revoked", async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(wrapper.text()).toContain("Useful card text");
    api.guestTree.mockRejectedValueOnce({
      response: {
        status: 404,
        headers: { "x-error-code": "RepoNotFound" },
        data: {},
      },
    });
    await wrapper.setProps({ view: "files" });
    await flushPromises();
    expect(wrapper.emitted("changed")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Useful card text");
    expect(wrapper.find('[aria-label="Directory README"]').exists()).toBe(
      false,
    );
  });

  it("uses the authorized canonical root README for the file page after checking guest preview access", async () => {
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [{ path: "README.md", type: "file", preview_kind: "text" }],
        has_more: false,
      },
    });
    api.guestPreview.mockResolvedValueOnce({
      data: { kind: "text", text: "Short generic excerpt", truncated: true },
    });
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    await button(wrapper, "README.md").trigger("click");
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledWith(repo, "README.md");
    expect(
      wrapper.get('[aria-label="Controlled file preview"]').text(),
    ).toContain("Model documentation");
    expect(wrapper.text()).not.toContain("Short generic excerpt");
  });

  it("shows the latest commit above Files and reuses its page for history", async () => {
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    expect(wrapper.get('[aria-label="Latest commit"]').text()).toContain(
      "Add model documentation",
    );
    expect(api.guestCommits).toHaveBeenCalledExactlyOnceWith(repo, {});
    await button(wrapper, "Add model documentation").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("navigate").at(-1)).toEqual(["commits"]);
    expect(wrapper.text()).toContain("Back to commit history");
    expect(api.guestCommits).toHaveBeenCalledTimes(1);
  });
  it("loads current file size and last commit for direct file headers through the controlled API", async () => {
    api.guestFileInfo.mockResolvedValueOnce({
      data: {
        path: "docs/direct.txt",
        size: 1234,
        last_modified: "2026-11-10T00:00:00Z",
        last_commit: {
          id: "b".repeat(40),
          title: "Update direct file",
          timestamp: 1794268800,
          author: "editor",
        },
      },
    });
    const wrapper = mountViewer({ view: "files", filePath: "docs/direct.txt" });
    await flushPromises();
    expect(api.guestFileInfo).toHaveBeenCalledExactlyOnceWith(
      repo,
      "docs/direct.txt",
    );
    expect(wrapper.get('[aria-label="File header"]').text()).toContain(
      "1.2 KB",
    );
    expect(wrapper.get('[aria-label="File last commit"]').text()).toContain(
      "Update direct file",
    );
    expect(wrapper.get('[aria-label="File last commit"]').text()).toContain(
      "editor",
    );
    expect(wrapper.html()).not.toContain("/resolve/");
  });

  it("shows available per-path commit metadata in normal Files columns", async () => {
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          {
            path: "config.json",
            type: "file",
            size: 100,
            last_commit: {
              id: "c".repeat(40),
              title: "Configure model",
              timestamp: 1794268800,
              author: "owner",
            },
          },
        ],
        has_more: false,
      },
    });
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    const table = wrapper.get('[aria-label="Repository files"]');
    expect(table.text()).toContain("Configure model");
    expect(table.get("thead").text()).toContain("Last commit");
    expect(table.get("thead").text()).toContain("Updated");
  });
  it("keeps a valid bounded preview when the file metadata service fails", async () => {
    api.guestFileInfo.mockRejectedValueOnce({ response: { status: 500 } });
    const wrapper = mountViewer({ view: "files", filePath: "script.py" });
    await flushPromises();
    expect(wrapper.findComponent(CodeViewer).props("code")).toBe(
      "print('bounded')\n",
    );
    expect(wrapper.emitted("changed")).toBeUndefined();
  });
  it("discards a file preview when its parallel metadata authorization is revoked", async () => {
    api.guestFileInfo.mockRejectedValueOnce({ response: { status: 403 } });
    const wrapper = mountViewer({ view: "files", filePath: "script.py" });
    await flushPromises();
    expect(wrapper.findComponent(CodeViewer).exists()).toBe(false);
    expect(wrapper.emitted("changed")).toHaveLength(1);
  });
  it("follows card file links through controlled previews and returns to their folder", async () => {
    const data = overview();
    data.readme.text = "# Card\n[Guide](docs/guide.md)";
    api.guestOverview.mockResolvedValueOnce({ data });
    const wrapper = mountViewer();
    await flushPromises();
    await wrapper.get('a[data-guest-path="docs/guide.md"]').trigger("click");
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledExactlyOnceWith(
      repo,
      "docs/guide.md",
    );
    expect(wrapper.emitted("open-file")).toEqual([["docs/guide.md"]]);
    api.guestTree.mockResolvedValueOnce({
      data: { path: "docs", entries: [], has_more: false },
    });
    await button(wrapper, "Back to Files").trigger("click");
    await flushPromises();
    expect(api.guestTree).toHaveBeenCalledExactlyOnceWith(repo, "docs", {
      search: "",
    });
  });
  it("uses real encoded file and folder links and preserves modified browser navigation", async () => {
    api.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          { path: "docs & examples", type: "directory" },
          { path: "model card.md", type: "file", size: 123 },
        ],
        has_more: false,
      },
    });
    const wrapper = mountViewer({ view: "files" });
    await flushPromises();
    const file = wrapper.get('a[aria-label="model card.md"]');
    const folder = wrapper.get('a[aria-label="docs & examples"]');
    expect(file.attributes("href")).toBe(
      "/models/owner/demo/blob/main/model%20card.md",
    );
    expect(folder.attributes("href")).toBe(
      "/models/owner/demo/tree/main/docs%20%26%20examples",
    );
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      expect(file.element.dispatchEvent(event)).toBe(true);
      expect(
        folder.element.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            ...modifiers,
          }),
        ),
      ).toBe(true);
    }
    expect(api.guestPreview).not.toHaveBeenCalled();
    expect(api.guestTree).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("open-file")).toBeUndefined();
    const primary = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    expect(file.element.dispatchEvent(primary)).toBe(false);
    await flushPromises();
    expect(api.guestPreview).toHaveBeenCalledExactlyOnceWith(
      repo,
      "model card.md",
    );
    expect(wrapper.emitted("open-file")).toEqual([["model card.md"]]);
  });
});
