// The standalone blob page shows a .psd as its flattened image, read by Range
// from the file's /resolve/ URL: only the head and the composite, never the
// whole file. Stub the preview as a presence-detector that exposes its source.

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

vi.mock("@/utils/http-errors", () => ({
  classifyError: (err) => ({ kind: "generic", detail: String(err) }),
  classifyResponse: (resp) => ({ kind: "not-found", status: resp?.status }),
  downloadToastFor: (c) => `download-toast:${c?.kind || "?"}`,
  probeUrlAndClassify: vi.fn().mockResolvedValue({ ok: true }),
  ERROR_KIND: {
    NOT_FOUND: "not-found",
    UPSTREAM_UNAVAILABLE: "upstream-unavailable",
  },
}));

// The page's PsdPreview mount is the surface we assert.
const seen = vi.hoisted(() => ({ sources: [] }));
vi.mock("@/components/repo/preview/PsdPreview.vue", () => ({
  default: {
    name: "PsdPreview",
    props: ["source", "filename"],
    setup(props) {
      seen.sources.push(props.source);
      return {};
    },
    template:
      '<div data-stub="PsdPreview" :data-filename="filename"><slot name="error-actions" /></div>',
  },
}));

const fetchMock = vi.fn(async (url, init) => {
  const range = init?.headers?.Range;
  const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(range || "bytes=0-9");
  return new Response(new Uint8Array(Number(b) - Number(a) + 1), {
    status: 206,
    headers: { "Content-Range": `bytes ${a}-${b}/5000` },
  });
});

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

beforeEach(() => {
  seen.sources.length = 0;
});

describe("blob page · psd preview", () => {
  it("renders the PSD preview over a Range source on the file's resolve URL", async () => {
    const wrapper = await open("art/Cover.PSD");
    const panel = wrapper.find('[data-stub="PsdPreview"]');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("data-filename")).toBe("Cover.PSD");
    // nothing is fetched until the preview reads
    expect(fetchMock).not.toHaveBeenCalled();
    const [source] = seen.sources;
    expect(await source.size()).toBe(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/datasets/open-media-lab/showcase/resolve/main/art/Cover.PSD",
    );
    expect(init.headers.Range).toBe("bytes=0-65535");
  });

  it("keeps the repo type in the URL", async () => {
    await open("a.psd", "aurora", "models");
    await seen.sources[0].size();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/models/aurora/showcase/resolve/main/a.psd",
    );
  });

  it("offers Download File when the preview cannot be made", async () => {
    const wrapper = await open("a.psd");
    const button = wrapper.find('[data-stub="PsdPreview"] button');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain("Download File");
  });

  it("leaves other binary files on the download page", async () => {
    const wrapper = await open("weights/model.bin");
    expect(wrapper.find('[data-stub="PsdPreview"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Download File");
  });
});
