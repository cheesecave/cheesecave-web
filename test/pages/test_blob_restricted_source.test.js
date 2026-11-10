import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
const mocks = vi.hoisted(() => ({
  route: {
    path: "/models/owner/demo/blob/main/docs/README.md",
    params: {
      namespace: "owner",
      name: "demo",
      branch: "main",
      file: "docs/README.md",
    },
  },
  raw: vi.fn(),
  access: {
    guestOverview: vi.fn(),
    guestTree: vi.fn(),
    guestFileInfo: vi.fn(),
    guestPreview: vi.fn(),
  },
  api: {
    listRefs: vi.fn(),
    listTreePage: vi.fn(),
    getPathsInfo: vi.fn(),
    getCommitDetail: vi.fn(),
    listTree: vi.fn(),
  },
}));
vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    canWriteToNamespace: () => true,
  }),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: mocks.api,
  repositoryAccessAPI: mocks.access,
}));
vi.mock("@/errors", async (load) => ({
  ...(await load()),
  hubFetch: mocks.raw,
}));
import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";
import RestrictedViewer from "@/components/repo/RestrictedRepositoryViewer.vue";
import Tree from "@/components/repo/RepositoryFileTree.vue";
import Commit from "@/components/repo/RepositoryFileCommit.vue";
import Markdown from "@/components/common/MarkdownViewer.vue";
import Code from "@/components/common/CodeViewer.vue";
import Pdf from "@/components/repo/RepositoryPdfPreview.vue";
import Media from "@/components/repo/RepositoryMediaPreview.vue";
const wrappers = [];
let source;
function open(
  path = "docs/README.md",
  content = { kind: "text", text: "# Shared preview", truncated: false },
) {
  mocks.route = {
    path: `/models/owner/demo/blob/main/${path}`,
    params: { namespace: "owner", name: "demo", branch: "main", file: path },
  };
  source.loadFile.mockResolvedValue({
    content,
    info: {
      size: 345,
      last_commit: {
        id: "a".repeat(40),
        title: "File update",
        author: "owner",
        timestamp: 1,
      },
    },
  });
  const w = mount(BlobPage, {
    props: { embedded: true, previewSource: source },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        EntityAvatar: true,
      },
    },
  });
  wrappers.push(w);
  return w;
}
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  source = {
    restricted: true,
    loadFile: vi.fn(),
    fileInfo: vi.fn().mockResolvedValue({
      last_commit: {
        id: "a".repeat(40),
        title: "File update",
        author: "owner",
        timestamp: 1,
      },
    }),
    listTree: vi.fn().mockResolvedValue({
      entries: [
        { path: "docs", type: "directory" },
        { path: "docs/README.md", type: "file" },
      ],
      hasMore: false,
    }),
    loadThumbnail: vi.fn(),
    loadPdfPage: vi.fn(),
    onAccessDenied: vi.fn(),
  };
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
describe("actual ordinary blob workbench with controlled repository source", () => {
  it("uses the actual normal tree, commit, Markdown and toolbar while suppressing raw/download/write actions", async () => {
    const w = open();
    await flushPromises();
    expect(w.findComponent(Tree).exists()).toBe(true);
    expect(w.findComponent(Commit).exists()).toBe(true);
    expect(w.findComponent(Markdown).exists()).toBe(true);
    expect(w.get(".repository-file-workbench").exists()).toBe(true);
    expect(w.get('[aria-label="File actions"]').text()).toContain("Preview");
    expect(w.text()).toContain("File update");
    expect(
      w
        .find(
          'a[href*="/resolve/"],button[aria-label="Download"],button[aria-label="Copy URL"],a[aria-label="Edit"],button[aria-label="Delete file"]',
        )
        .exists(),
    ).toBe(false);
    expect(source.listTree).toHaveBeenCalled();
    expect(source.fileInfo).toHaveBeenCalledWith("docs/README.md");
    expect(mocks.raw).not.toHaveBeenCalled();
    for (const api of Object.values(mocks.api))
      expect(api).not.toHaveBeenCalled();
  });
  it("passes bounded text to the same normal CodeViewer even when original file size is large", async () => {
    const w = open("notes.txt", {
      kind: "text",
      text: "controlled excerpt",
      truncated: true,
    });
    await flushPromises();
    expect(w.findComponent(Code).props("code")).toBe("controlled excerpt");
    expect(w.text()).toContain("This preview is limited");
    expect(mocks.raw).not.toHaveBeenCalled();
  });
  it("uses the actual same CodeViewer for ordinary CSV and controlled row data with correct CSV quoting", async () => {
    const expected = 'name,note\nAlice,"a,b ""quote"""\nBob,"line1\nline2"\n';
    // The ordinary path continues to fetch its normal text source.
    mocks.route = {
      path: "/models/owner/demo/blob/main/samples.csv",
      params: {
        namespace: "owner",
        name: "demo",
        branch: "main",
        file: "samples.csv",
      },
    };
    mocks.api.listRefs.mockResolvedValue({ data: { branches: [] } });
    mocks.api.listTreePage.mockResolvedValue({
      entries: [{ path: "samples.csv", type: "file" }],
      hasMore: false,
    });
    mocks.api.getPathsInfo.mockResolvedValue({ data: [] });
    mocks.raw.mockResolvedValue(
      new Response(expected, {
        headers: { "Content-Length": String(expected.length) },
      }),
    );
    const ordinary = mount(BlobPage, {
      props: { embedded: true },
      global: {
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
          EntityAvatar: true,
        },
      },
    });
    wrappers.push(ordinary);
    await flushPromises();
    expect(ordinary.findComponent(Code).props("code")).toBe(expected);
    const calls = mocks.raw.mock.calls.length;
    for (const api of Object.values(mocks.api)) api.mockClear();
    mocks.access.guestOverview.mockResolvedValue({
      data: { metadata: {}, readme: null },
    });
    mocks.access.guestTree.mockResolvedValue({
      data: {
        entries: [{ path: "samples.csv", type: "file" }],
        has_more: false,
      },
    });
    mocks.access.guestFileInfo.mockResolvedValue({
      data: { path: "samples.csv", size: 1000 },
    });
    mocks.access.guestPreview.mockResolvedValue({
      data: {
        kind: "rows",
        columns: ["name", "note"],
        rows: [
          ["Alice", 'a,b "quote"'],
          ["Bob", "line1\nline2"],
        ],
        truncated: true,
      },
    });
    const guest = mount(RestrictedViewer, {
      props: {
        repository: { type: "model", namespace: "owner", name: "demo" },
        embedded: true,
        view: "files",
        filePath: "samples.csv",
      },
      global: {
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
          EntityAvatar: true,
        },
      },
    });
    wrappers.push(guest);
    await flushPromises();
    expect(guest.findComponent(Code).exists()).toBe(true);
    expect(guest.findComponent(Code).props("code")).toBe(expected);
    expect(guest.find(".controlled-data-table").exists()).toBe(false);
    expect(guest.text()).toContain("This preview is limited");
    expect(mocks.raw).toHaveBeenCalledTimes(calls);
    for (const api of Object.values(mocks.api))
      expect(api).not.toHaveBeenCalled();
    expect(mocks.access.guestPreview).toHaveBeenCalledExactlyOnceWith(
      { type: "model", namespace: "owner", name: "demo" },
      "samples.csv",
    );
  });

  it("does not enable ordinary archive, parquet or tensor byte readers for a controlled source", async () => {
    const w = open("weights.safetensors", {
      kind: "unsupported",
      message: "Unsupported preview",
    });
    await flushPromises();
    expect(w.text()).toContain("Unsupported preview");
    expect(w.findComponent({ name: "FileMetadataPanel" }).exists()).toBe(false);
    expect(mocks.raw).not.toHaveBeenCalled();
  });
  it("forwards a processed PDF to the actual shared PDF component without an original URL", async () => {
    const w = open("manual.pdf", {
      kind: "pdf",
      page_count: 4,
      snapshot: "abc",
    });
    await flushPromises();
    const pdf = w.findComponent(Pdf);
    expect(pdf.exists()).toBe(true);
    expect(pdf.props("url")).toBe("");
    expect(pdf.props("pageCount")).toBe(4);
    expect(pdf.props("loadPage")).toBeTypeOf("function");
    expect(mocks.raw).not.toHaveBeenCalled();
  });
  it("forwards processed video to the same native media component with restricted playback policy", async () => {
    const w = open("clip.mp4", {
      kind: "video",
      playlist_url:
        "/api/models/owner/demo/access/guest/media/hls/playlist?path=clip.mp4&snapshot=abc",
      snapshot: "abc",
    });
    await flushPromises();
    const media = w.findComponent(Media);
    expect(media.exists()).toBe(true);
    expect(media.props("restricted")).toBe(true);
    expect(media.props("src")).not.toContain("/resolve/");
    expect(mocks.raw).not.toHaveBeenCalled();
  });
  it("rejects non-main guest revisions without attempting fallback or ordinary byte APIs", async () => {
    mocks.route.params.branch = "secret";
    const w = mount(BlobPage, {
      props: { embedded: true, previewSource: source },
      global: {
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
          RepositoryFileTree: true,
          RepositoryFileCommit: true,
        },
      },
    });
    wrappers.push(w);
    await flushPromises();
    expect(source.loadFile).not.toHaveBeenCalled();
    expect(mocks.raw).not.toHaveBeenCalled();
  });
});
