// The standalone blob page shows a parquet file's metadata (rows, columns,
// row groups) inline, the same view the file-list icon opens in a dialog.
// The footer is range-read by the panel, so the page must not fetch the file.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: {
    path: "/datasets/open-media-lab/showcase/blob/main/archives/models/bundle.tar",
    params: {
      namespace: "open-media-lab",
      name: "showcase",
      branch: "main",
      file: "archives/models/bundle.tar",
    },
    query: {},
  },
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

// The page's FileMetadataPanel mount is the surface we assert. Stub it as
// a presence-detector that surfaces forwarded props as data attributes.
vi.mock("@/components/repo/preview/FileMetadataPanel.vue", () => ({
  default: {
    name: "FileMetadataPanel",
    props: ["kind", "resolveUrl", "filename"],
    template:
      '<div data-stub="FileMetadataPanel" :data-kind="kind" :data-resolve-url="resolveUrl" :data-filename="filename" />',
  },
}));

const fetchMock = vi.fn(async () => new Response("", { status: 200 }));

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

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock;
});

function open(file, ns = "open-media-lab", type = "datasets") {
  mocks.route.path = `/${type}/${ns}/showcase/blob/main/${file}`;
  mocks.route.params = {
    namespace: ns,
    name: "showcase",
    branch: "main",
    file,
  };
  mocks.listTreeImpl.mockResolvedValue({ data: [] });
  const wrapper = mountBlob();
  return flushPromises().then(() => wrapper);
}

describe("blob page · parquet metadata", () => {
  it("renders the metadata panel with an absolute resolve URL", async () => {
    const wrapper = await open("data/train-00000.parquet");
    const panel = wrapper.find('[data-stub="FileMetadataPanel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("data-kind")).toBe("parquet");
    expect(panel.attributes("data-filename")).toBe("train-00000.parquet");
    expect(panel.attributes("data-resolve-url")).toBe(
      `${window.location.origin}/datasets/open-media-lab/showcase/resolve/main/data/train-00000.parquet`,
    );
    // The panel range-reads the footer: the page itself downloads nothing
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Download File");
  });

  it("matches the extension case-insensitively and keeps the repo type", async () => {
    const wrapper = await open("Data/TRAIN.PARQUET", "aurora", "models");
    const panel = wrapper.find('[data-stub="FileMetadataPanel"]');
    expect(panel.attributes("data-resolve-url")).toContain(
      "/models/aurora/showcase/resolve/main/Data/TRAIN.PARQUET",
    );
  });

  it("encodes path segments the way the file list does", async () => {
    const wrapper = await open("a b/c#d.parquet");
    const panel = wrapper.find('[data-stub="FileMetadataPanel"]');
    expect(panel.attributes("data-resolve-url")).toContain(
      "/a%20b/c%23d.parquet",
    );
  });

  it("leaves other binary files on the download fallback", async () => {
    const wrapper = await open("weights/model.bin");
    expect(wrapper.find('[data-stub="FileMetadataPanel"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("Download File");
  });
});
