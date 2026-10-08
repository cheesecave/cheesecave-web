// The blob page's size line for binary and media files. A file the page
// never downloads has no size of its own; the size must come from the
// backend (paths-info), and an unknown size must not read as "0 B".

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: {
    path: "/datasets/open-media-lab/showcase/blob/main/gallery/cover.avif",
    params: {
      namespace: "open-media-lab",
      name: "showcase",
      branch: "main",
      file: "gallery/cover.avif",
    },
    query: {},
  },
  getPathsInfoImpl: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/utils/api", () => ({
  repoAPI: {
    listTree: vi.fn().mockResolvedValue({ data: [] }),
    fileExists: vi.fn().mockResolvedValue(true),
    getPathsInfo: (...args) => mocks.getPathsInfoImpl(...args),
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
  default: { name: "TarBrowserPanel", template: "<div />" },
}));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";

function mountBlob() {
  return mount(BlobPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        MarkdownViewer: { template: "<div data-stub=MarkdownViewer />" },
        CodeViewer: { template: "<div data-stub=CodeViewer />" },
        ErrorState: { template: "<div data-stub=ErrorState />" },
      },
    },
  });
}

function openFile(file) {
  mocks.route.path = `/datasets/open-media-lab/showcase/blob/main/${file}`;
  mocks.route.params = {
    namespace: "open-media-lab",
    name: "showcase",
    branch: "main",
    file,
  };
}

// The size line is the element that carries the formatted size and the
// separator; find it by the file's extension text that follows it.
function sizeLine(wrapper) {
  return wrapper.find("h1").element.parentElement.querySelector(".text-xs")
    .textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPathsInfoImpl.mockResolvedValue({
    data: [{ type: "file", path: "gallery/cover.avif", size: 2048 }],
  });
});

describe("blob page · size of a file that is not downloaded", () => {
  it("shows the size the backend reports for an image", async () => {
    openFile("gallery/cover.avif");
    const wrapper = mountBlob();
    await flushPromises();

    expect(sizeLine(wrapper)).toContain("2.0 KB");
    expect(sizeLine(wrapper)).not.toContain("0 B");
  });

  it("asks paths-info for exactly this file on this branch", async () => {
    openFile("gallery/cover.avif");
    mountBlob();
    await flushPromises();

    expect(mocks.getPathsInfoImpl).toHaveBeenCalledWith(
      "dataset",
      "open-media-lab",
      "showcase",
      "main",
      ["gallery/cover.avif"],
    );
  });

  it("shows the size of a large video in megabytes", async () => {
    mocks.getPathsInfoImpl.mockResolvedValue({
      data: [{ type: "file", path: "clips/op.mkv", size: 5_000_000 }],
    });
    openFile("clips/op.mkv");
    const wrapper = mountBlob();
    await flushPromises();

    expect(sizeLine(wrapper)).toContain("5.0 MB");
  });

  it("shows 0 B for a real empty file", async () => {
    mocks.getPathsInfoImpl.mockResolvedValue({
      data: [{ type: "file", path: "gallery/cover.avif", size: 0 }],
    });
    openFile("gallery/cover.avif");
    const wrapper = mountBlob();
    await flushPromises();

    expect(sizeLine(wrapper)).toContain("0 B");
  });

  it("shows no size, rather than 0 B, when paths-info cannot tell", async () => {
    mocks.getPathsInfoImpl.mockRejectedValue(new Error("network down"));
    openFile("gallery/cover.avif");
    const wrapper = mountBlob();
    await flushPromises();

    expect(sizeLine(wrapper)).not.toContain("0 B");
    expect(sizeLine(wrapper)).not.toContain("•");
    expect(wrapper.text()).not.toContain("Failed to load file");
  });

  it("shows no size when paths-info returns no entry for the file", async () => {
    mocks.getPathsInfoImpl.mockResolvedValue({ data: [] });
    openFile("gallery/cover.avif");
    const wrapper = mountBlob();
    await flushPromises();

    expect(sizeLine(wrapper)).not.toContain("0 B");
  });
});
