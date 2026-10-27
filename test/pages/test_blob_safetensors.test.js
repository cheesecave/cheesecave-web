import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: { path: "", params: {}, query: {} },
  getPathsInfo: vi.fn(),
}));
vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: { getPathsInfo: (...args) => mocks.getPathsInfo(...args) },
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    canWriteToNamespace: () => false,
  }),
}));
vi.mock("@/components/repo/preview/FileMetadataPanel.vue", () => ({
  default: {
    name: "FileMetadataPanel",
    props: ["kind", "resolveUrl", "filename", "pageMode"],
    template: '<div data-testid="model-metadata" />',
  },
}));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";
import FileMetadataPanel from "@/components/repo/preview/FileMetadataPanel.vue";

const wrappers = [];
const fetchSpy = vi.fn();
function open({
  file = "model-00001-of-00003.safetensors",
  branch = "main",
  embedded = true,
} = {}) {
  mocks.route = {
    path: `/models/mai_lin/private-vision-checkpoint/blob/${branch}/${file}`,
    params: {
      namespace: "mai_lin",
      name: "private-vision-checkpoint",
      branch,
      file,
    },
    query: {},
  };
  const wrapper = mount(BlobPage, {
    props: { embedded },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        RepositoryFileTree: true,
        RepositoryFileCommit: true,
        MarkdownViewer: true,
        CodeViewer: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSpy);
  mocks.getPathsInfo.mockImplementation(
    async (_type, _namespace, _name, _branch, [path]) => ({
      data: [{ type: "file", path, size: 79_700_000 }],
    }),
  );
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe("blob page safetensors metadata", () => {
  it("keeps the large-file notice and download action with model metadata below the preview", async () => {
    const wrapper = open();
    await flushPromises();
    expect(wrapper.getComponent(FileMetadataPanel).props()).toMatchObject({
      kind: "safetensors",
      filename: "model-00001-of-00003.safetensors",
      pageMode: true,
      resolveUrl: `${window.location.origin}/models/mai_lin/private-vision-checkpoint/resolve/main/model-00001-of-00003.safetensors`,
    });
    const preview = wrapper.get(".file-detail-content");
    expect(preview.text()).toContain("File is 79.7 MB, too large to preview");
    expect(preview.text()).toContain("Binary File");
    expect(preview.get("button").text()).toContain("Download File");
    expect(preview.find('[data-testid="model-metadata"]').exists()).toBe(false);
    expect(
      preview.element.nextElementSibling.querySelector(
        '[data-testid="model-metadata"]',
      ),
    ).not.toBeNull();
    expect(wrapper.get(".file-detail-stats").text()).toContain("79.7 MB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts header preview independently of a slow file-size request", async () => {
    let resolveSize;
    mocks.getPathsInfo.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSize = resolve;
        }),
    );
    const wrapper = open();
    await flushPromises();
    expect(wrapper.findComponent(FileMetadataPanel).exists()).toBe(true);
    expect(wrapper.find(".file-detail-toolbar").exists()).toBe(true);
    resolveSize({ data: [] });
    await flushPromises();
  });

  it("keeps the metadata preview usable when the file size cannot be read", async () => {
    mocks.getPathsInfo.mockRejectedValue(new Error("size unavailable"));
    const wrapper = open();
    await flushPromises();
    expect(wrapper.findComponent(FileMetadataPanel).exists()).toBe(true);
    expect(wrapper.text()).toContain("This file type cannot be previewed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the encoded resolve URL for uppercase extensions and special path or branch characters", async () => {
    const wrapper = open({
      file: "weights/a b#c.SAFETENSORS",
      branch: "feature/test",
    });
    await flushPromises();
    expect(wrapper.getComponent(FileMetadataPanel).props("resolveUrl")).toBe(
      `${window.location.origin}/models/mai_lin/private-vision-checkpoint/resolve/feature%2Ftest/weights/a%20b%23c.SAFETENSORS`,
    );
  });

  it("does not treat unsupported binary weights as safetensors", async () => {
    const wrapper = open({ file: "pytorch_model.bin" });
    await flushPromises();
    expect(wrapper.findComponent(FileMetadataPanel).exists()).toBe(false);
    expect(wrapper.text()).toContain("Binary File");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
