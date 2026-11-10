// Component test for the standalone blob page's indexed-tar
// detection.
//
// Contracts being pinned:
//   1. repoType is derived from the FIRST URL segment, not from
//      "/models/" / "/datasets/" / "/spaces/" appearing anywhere in
//      the path. The earlier substring check mis-classified dataset
//      members at paths like `archives/models/bundle.tar` as
//      `model` repos and routed the resolve URL to `/api/models/...`
//      which 404'd.
//   2. A `.tar` blob is checked with ONE request: the sibling
//      `<basename>.json` (the hfutils.index sidecar) is fetched
//      straight away. 200 = indexed (the panel gets the parsed index
//      so it does not fetch it again), 404 = a bare tar (binary
//      fallback), anything else = "could not check" with a Retry,
//      never silently "not indexed". No folder listing, no HEAD.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IndexedTarFetchError,
  IndexedTarFormatError,
} from "@/utils/indexed-tar";

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
  parseTarIndexImpl: vi.fn(),
  pathsInfoImpl: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/utils/api", () => ({
  repoAPI: {
    listTree: (...args) => mocks.listTreeImpl(...args),
    getPathsInfo: (...args) => mocks.pathsInfoImpl(...args),
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

// The sidecar fetch is the surface under test: replace parseTarIndex, keep the rest of the module.
vi.mock("@/utils/indexed-tar", async (importOriginal) => ({
  ...(await importOriginal()),
  parseTarIndex: (...args) => mocks.parseTarIndexImpl(...args),
}));

// The page's TarBrowserPanel mount is the surface we want to assert.
// Stub it as a presence-detector that surfaces forwarded props as
// data attributes.
vi.mock("@/components/repo/preview/TarBrowserPanel.vue", () => ({
  default: {
    name: "TarBrowserPanel",
    props: ["tarUrl", "indexUrl", "filename", "tarTreeEntry", "prefetchedIndex", "zip"],
    template:
      '<div data-stub="TarBrowserPanel" :data-tar-url="tarUrl" :data-index-url="indexUrl" :data-filename="filename" :data-has-tree-entry="tarTreeEntry ? \'true\' : \'false\'" :data-has-prefetched-index="prefetchedIndex ? \'true\' : \'false\'" :data-zip="zip ? JSON.stringify(zip) : \'\'" />',
  },
}));

// Make the body-fetch path inert so the test doesn't loop on
// retries while the indexed-tar detection runs in parallel.
const fetchMock = vi.fn(async () =>
  new Response(new Uint8Array([0x00, 0x01]), {
    status: 200,
    headers: new Headers({ "Content-Length": "2", "X-Error-Code": "" }),
  }),
);

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

const SIDECAR = { filesize: 1024, hash: "", hash_lfs: "", files: { "a.txt": { offset: 512, size: 3 } } };

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock;
  mocks.parseTarIndexImpl.mockReset().mockResolvedValue(SIDECAR);
  mocks.pathsInfoImpl.mockReset().mockResolvedValue({ data: [] });
});

function fetchError(status) {
  return new IndexedTarFetchError(`Failed to fetch (${status})`, { status });
}

function setTar(path, { namespace = "open-media-lab", name = "showcase", type = "datasets" } = {}) {
  const file = path;
  mocks.route.path = `/${type}/${namespace}/${name}/blob/main/${file}`;
  mocks.route.params = { namespace, name, branch: "main", file };
}

describe("blob page · repoType derivation", () => {
  it("treats `archives/models/bundle.tar` under /datasets/ as a dataset, not a model", async () => {
    setTar("archives/models/bundle.tar");
    mountBlob();
    await flushPromises();
    expect(mocks.parseTarIndexImpl).toHaveBeenCalledTimes(1);
    expect(mocks.parseTarIndexImpl.mock.calls[0][0]).toBe(
      "/datasets/open-media-lab/showcase/resolve/main/archives/models/bundle.json",
    );
  });

  it("treats a /models/ path as a model regardless of the inner file path", async () => {
    setTar("archives/some.tar", { namespace: "aurora", name: "lab", type: "models" });
    mountBlob();
    await flushPromises();
    expect(mocks.parseTarIndexImpl.mock.calls[0][0]).toBe(
      "/models/aurora/lab/resolve/main/archives/some.json",
    );
  });

  it("treats a /spaces/ path as a space", async () => {
    setTar("payload.tar", { namespace: "team", name: "demo", type: "spaces" });
    mountBlob();
    await flushPromises();
    expect(mocks.parseTarIndexImpl.mock.calls[0][0]).toBe(
      "/spaces/team/demo/resolve/main/payload.json",
    );
  });
});

describe("blob page · indexed-tar inline detection", () => {
  it("renders TarBrowserPanel after one request: the sidecar itself", async () => {
    setTar("archives/models/bundle.tar");
    const wrapper = mountBlob();
    await flushPromises();
    const panel = wrapper.find('[data-stub="TarBrowserPanel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("data-tar-url")).toContain("archives/models/bundle.tar");
    expect(panel.attributes("data-index-url")).toContain("archives/models/bundle.json");
    expect(panel.attributes("data-filename")).toBe("bundle.tar");
    // The parsed index is handed over: the panel must not fetch it a second time.
    expect(panel.attributes("data-has-prefetched-index")).toBe("true");
    // No folder listing, no HEAD probe.
    expect(mocks.listTreeImpl).not.toHaveBeenCalled();
    expect(mocks.parseTarIndexImpl).toHaveBeenCalledTimes(1);
  });

  it("gives the panel the tar's tree entry from the size lookup, for the hash banner", async () => {
    setTar("archives/models/bundle.tar");
    const tarEntry = { type: "file", path: "archives/models/bundle.tar", size: 1024, oid: "deadbeef" };
    mocks.pathsInfoImpl.mockResolvedValue({ data: [tarEntry] });
    const wrapper = mountBlob();
    await flushPromises();
    const panel = wrapper.find('[data-stub="TarBrowserPanel"]');
    expect(panel.attributes("data-has-tree-entry")).toBe("true");
  });

  it("shows no tree entry when the size lookup finds nothing", async () => {
    setTar("archives/models/bundle.tar");
    const wrapper = mountBlob();
    await flushPromises();
    expect(
      wrapper.find('[data-stub="TarBrowserPanel"]').attributes("data-has-tree-entry"),
    ).toBe("false");
  });

  it("shows a spinner, not 'cannot be previewed', while the sidecar is being fetched", async () => {
    setTar("archives/x.tar");
    let resolveIndex;
    mocks.parseTarIndexImpl.mockReturnValue(new Promise((r) => (resolveIndex = r)));
    const wrapper = mountBlob();
    await flushPromises();
    expect(wrapper.find('[data-testid="tar-detecting"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("cannot be previewed");
    expect(wrapper.text()).not.toContain("too large to preview");
    resolveIndex(SIDECAR);
    await flushPromises();
    expect(wrapper.find('[data-testid="tar-detecting"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(true);
  });

  it("falls back to the binary preview when the sidecar does not exist (404)", async () => {
    setTar("lonely.tar");
    mocks.parseTarIndexImpl.mockRejectedValue(fetchError(404));
    const wrapper = mountBlob();
    await flushPromises();
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tar-detecting"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tar-detect-error"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("cannot be previewed");
  });

  it("mounts the panel when the sidecar is not a valid index, so it can say what is wrong", async () => {
    setTar("archives/odd.tar");
    mocks.parseTarIndexImpl.mockRejectedValue(new IndexedTarFormatError("not an index"));
    const wrapper = mountBlob();
    await flushPromises();
    const panel = wrapper.find('[data-stub="TarBrowserPanel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("data-has-prefetched-index")).toBe("false");
  });

  it("says it could not check, with a Retry, when the sidecar request fails; Retry then succeeds", async () => {
    setTar("archives/x.tar");
    mocks.parseTarIndexImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const wrapper = mountBlob();
    await flushPromises();
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(false);
    const box = wrapper.find('[data-testid="tar-detect-error"]');
    expect(box.exists()).toBe(true);
    expect(box.text()).toContain("Could not check whether this tar has an index");
    // Not the misleading "cannot be previewed".
    expect(wrapper.text()).not.toContain("cannot be previewed");
    await box.find("button").trigger("click");
    await flushPromises();
    expect(mocks.parseTarIndexImpl).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="tar-detect-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(true);
  });

  it("treats a 5xx like a failed check, not like 'no index'", async () => {
    setTar("archives/x.tar");
    mocks.parseTarIndexImpl.mockRejectedValue(fetchError(503));
    const wrapper = mountBlob();
    await flushPromises();
    expect(wrapper.find('[data-testid="tar-detect-error"]').exists()).toBe(true);
  });

  it("ignores an answer that arrives after a newer check started", async () => {
    setTar("archives/x.tar");
    let resolveFirst;
    mocks.parseTarIndexImpl
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockRejectedValueOnce(fetchError(404));
    const wrapper = mountBlob();
    await flushPromises();
    await wrapper.vm.loadFileInfo();
    await flushPromises();
    resolveFirst(SIDECAR); // the first check answers late
    await flushPromises();
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("cannot be previewed");
  });

  it("ignores a late failure of a superseded check", async () => {
    setTar("archives/x.tar");
    let rejectFirst;
    mocks.parseTarIndexImpl
      .mockReturnValueOnce(new Promise((_, rej) => (rejectFirst = rej)))
      .mockResolvedValueOnce(SIDECAR);
    const wrapper = mountBlob();
    await flushPromises();
    await wrapper.vm.loadFileInfo();
    await flushPromises();
    rejectFirst(fetchError(404));
    await flushPromises();
    expect(wrapper.find('[data-stub="TarBrowserPanel"]').exists()).toBe(true);
  });

  it("does not look for a sidecar for a non-tar file", async () => {
    setTar("notes/README.md");
    mountBlob();
    await flushPromises();
    expect(mocks.parseTarIndexImpl).not.toHaveBeenCalled();
    expect(mocks.listTreeImpl).not.toHaveBeenCalled();
  });

  it("matches the tar extension case-insensitively", async () => {
    setTar("archives/BIG.TAR");
    mountBlob();
    await flushPromises();
    expect(mocks.parseTarIndexImpl).toHaveBeenCalledTimes(1);
    expect(mocks.parseTarIndexImpl.mock.calls[0][0]).toContain("archives/BIG.json");
  });
});

describe("blob page · zip inline browser", () => {
  it.each([
    [
      "/datasets/open-media-lab/showcase/blob/main/archives/models/bundle.zip",
      "archives/models/bundle.zip",
      "dataset",
    ],
    [
      "/models/aurora/lab/blob/release%2Fv1/weights.npz",
      "weights.npz",
      "model",
    ],
    [
      "/spaces/team/demo/blob/main/parts/set.zip.001",
      "parts/set.zip.001",
      "space",
    ],
    // Later volumes open the whole set too (zip-archive maps them).
    [
      "/datasets/open-media-lab/showcase/blob/main/parts/set.zip.002",
      "parts/set.zip.002",
      "dataset",
    ],
    [
      "/datasets/open-media-lab/showcase/blob/main/parts/set.z01",
      "parts/set.z01",
      "dataset",
    ],
  ])(
    "renders TarBrowserPanel in zip mode for %s",
    async (path, file, repoType) => {
      const branch = path.includes("release") ? "release/v1" : "main";
      const [, , namespace, name] = path.split("/");
      mocks.route.path = path;
      mocks.route.params = { namespace, name, branch, file };
      const wrapper = mountBlob();
      await flushPromises();
      const panel = wrapper.find('[data-stub="TarBrowserPanel"]');
      expect(panel.exists()).toBe(true);
      expect(JSON.parse(panel.attributes("data-zip"))).toEqual({
        repoType,
        namespace,
        name,
        branch,
        path: file,
      });
      expect(panel.attributes("data-filename")).toBe(file.split("/").pop());
      // Zip detection needs no sibling lookup.
      expect(mocks.listTreeImpl).not.toHaveBeenCalled();
      expect(mocks.parseTarIndexImpl).not.toHaveBeenCalled();
    },
  );

});
