// The inline archive browser (indexed tar, zip) on the file detail page sits
// inside the bordered `.file-detail-content` box. The panel itself is shared
// with the archive dialog and draws edge to edge, so the file page wraps it in
// `.file-archive-preview`, which carries the padding. Without the wrapper the
// path chip, filter and page-size controls touch the box border.
//
// The wrapper is only for the embedded layout; the standalone page keeps its
// `.card` and the panel inside it unchanged.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: { path: "", params: {}, query: {} },
  listTreeImpl: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/utils/api", () => ({
  repoAPI: {
    listTree: (...args) => mocks.listTreeImpl(...args),
    commitFiles: vi.fn(),
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    canWriteToNamespace: () => false,
  }),
}));

vi.mock("@/utils/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/components/repo/preview/TarBrowserPanel.vue", () => ({
  default: {
    name: "TarBrowserPanel",
    props: ["tarUrl", "indexUrl", "filename", "tarTreeEntry", "zip"],
    template: '<div data-stub="TarBrowserPanel" />',
  },
}));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";

const fetchMock = vi.fn(
  async () =>
    new Response(new Uint8Array([0x00, 0x01]), {
      status: 200,
      headers: new Headers({ "Content-Length": "2", "X-Error-Code": "" }),
    }),
);

function open(file, entries, embedded) {
  mocks.route.path = `/datasets/acme/demo/blob/main/${file}`;
  mocks.route.params = {
    namespace: "acme",
    name: "demo",
    branch: "main",
    file,
  };
  mocks.listTreeImpl.mockResolvedValue({ data: entries });
  return mount(BlobPage, {
    props: { embedded },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        RepositoryFileTree: { template: "<div />" },
        RepositoryFileCommit: { template: "<div />" },
        MarkdownViewer: { template: "<div />" },
        CodeViewer: { template: "<div />" },
        ErrorState: { template: "<div />" },
      },
    },
  });
}

const tarEntries = [
  { type: "file", path: "bundle.tar", size: 1024, oid: "ab" },
  { type: "file", path: "bundle.json", size: 64 },
];

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock;
});

describe("archive browser padding on the file page", () => {
  it.each([
    ["an indexed tar", "bundle.tar", tarEntries],
    ["a zip", "bundle.zip", []],
  ])("wraps the panel of %s in the padded wrapper", async (_, file, entries) => {
    const wrapper = open(file, entries, true);
    await flushPromises();
    const box = wrapper.find(".file-detail-content");
    const wrap = box.find(".file-archive-preview");
    expect(wrap.exists()).toBe(true);
    expect(wrap.find('[data-stub="TarBrowserPanel"]').exists()).toBe(true);
    // The panel is no longer a direct child of the bordered box.
    expect(box.element.querySelector(":scope > [data-stub]")).toBeNull();
  });

  it.each([
    ["an indexed tar", "bundle.tar", tarEntries],
    ["a zip", "bundle.zip", []],
  ])("leaves the standalone page of %s unwrapped", async (_, file, entries) => {
    const wrapper = open(file, entries, false);
    await flushPromises();
    expect(wrapper.find(".file-archive-preview").exists()).toBe(false);
    const holder = wrapper
      .findAll(".card")
      .find((card) => card.find('[data-stub="TarBrowserPanel"]').exists());
    expect(holder).toBeTruthy();
  });
});
