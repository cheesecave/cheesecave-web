import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  previewFile: vi.fn(),
  executeSQLQuery: vi.fn(),
  listTARFiles: vi.fn(),
  extractTARFile: vi.fn(),
  detectFormat: vi.fn(),
  formatBytes: vi.fn(),
}));
vi.mock("@/components/DatasetViewer/api", () => api);

import DatasetViewer from "@/components/DatasetViewer/DatasetViewer.vue";

const unavailable = () =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status: 503, headers: {}, data: {} },
  });
const mountViewer = (fileName) =>
  mount(DatasetViewer, {
    props: { fileUrl: "/f", fileName },
    global: { stubs: { DataGridEnhanced: true, TARFileList: true } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  api.detectFormat.mockImplementation((n) =>
    n.endsWith(".tar") ? "tar" : n.endsWith(".csv") ? "csv" : null,
  );
});

describe("DatasetViewer failures", () => {
  it("keeps its own message for a file it cannot parse", async () => {
    const wrapper = mountViewer("x.bin");
    await flushPromises();
    expect(wrapper.text()).toContain("Unsupported file format");
    expect(wrapper.emitted("error")[0][0]).toBe("Unsupported file format");
  });

  it("describes a failed request in the app's words", async () => {
    api.listTARFiles.mockRejectedValue(unavailable());
    const wrapper = mountViewer("x.tar");
    await flushPromises();
    expect(wrapper.text()).toContain("Service unavailable");
  });

  it("says so for a request that was cancelled", async () => {
    api.listTARFiles.mockRejectedValue(new DOMException("a", "AbortError"));
    const wrapper = mountViewer("x.tar");
    await flushPromises();
    expect(wrapper.text()).toContain("The request was cancelled.");
  });

  it("describes a member that could not be extracted, and lets go of the selection", async () => {
    api.listTARFiles.mockResolvedValue({ files: [{ name: "a.csv" }] });
    api.extractTARFile.mockRejectedValue(unavailable());
    const wrapper = mountViewer("x.tar");
    await flushPromises();
    await wrapper.vm.selectTARFile({ name: "a.csv" });
    expect(wrapper.text()).toContain("Service unavailable");
    expect(wrapper.vm.selectedTARFile).toBeNull();
  });
});
