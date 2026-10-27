// The metadata panel on its own, outside any dialog: the blob page mounts
// it for parquet files and leaves it on. Rendering and the error paths are
// covered through FilePreviewDialog; this covers what only a standalone
// panel does (pausing, and cleaning up when its page goes away).

import { readFileSync } from "node:fs";
import { flushPromises, mount } from "@vue/test-utils";
import { ElTable, ElTableColumn } from "element-plus";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ calls: [] }));

vi.mock("@/utils/parquet", () => ({
  parseParquetMetadata: vi.fn(
    (url, opts = {}) =>
      new Promise((_, reject) => {
        mocks.calls.push({ url, opts });
        opts.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  ),
  parseParquetMetadataFromBuffer: vi.fn(),
  summarizeParquetSchema: vi.fn(),
}));

import { parseParquetMetadata, summarizeParquetSchema } from "@/utils/parquet";
import FileMetadataPanel from "@/components/repo/preview/FileMetadataPanel.vue";

const URL = "http://host/datasets/o/n/resolve/main/data.parquet";

function mountPanel(props = {}) {
  return mount(FileMetadataPanel, {
    props: {
      kind: "parquet",
      resolveUrl: URL,
      filename: "data.parquet",
      ...props,
    },
    global: {
      stubs: { ...ElementPlusStubs, ElTable: true, ElTableColumn: true },
    },
  });
}

function mountReadyPanel(props) {
  return mount(FileMetadataPanel, {
    props,
    global: {
      components: { ElTable, ElTableColumn },
      stubs: ElementPlusStubs,
    },
  });
}

const safetensorsBytes = new Uint8Array(
  readFileSync(
    new globalThis.URL(
      "../fixtures/previews/tiny.safetensors",
      import.meta.url,
    ),
  ),
);

beforeEach(() => {
  mocks.calls.length = 0;
});

describe("FileMetadataPanel", () => {
  it("keeps the dialog tensor table bounded while showing the parsed model statistics", async () => {
    const wrapper = mountReadyPanel({
      kind: "safetensors",
      filename: "tiny.safetensors",
      bytes: safetensorsBytes,
    });
    await flushPromises();
    const tensors = wrapper
      .findAllComponents(ElTable)
      .find((table) => table.props("rowKey") === "path");
    expect(tensors.props("maxHeight")).toBe("360");
    expect(tensors.props("data")[0]).toMatchObject({
      segment: "encoder",
      leafCount: 3,
      parameters: 528,
    });
    expect(wrapper.text()).toContain("Total parameters");
    expect(wrapper.text()).toContain("528");
    expect(wrapper.text()).toContain("__metadata__");
    wrapper.unmount();
  });

  it("lets the tensor tree grow with the page instead of creating a vertical table scroller", async () => {
    const wrapper = mountReadyPanel({
      kind: "safetensors",
      filename: "tiny.safetensors",
      bytes: safetensorsBytes,
      pageMode: true,
    });
    await flushPromises();
    const tensors = wrapper
      .findAllComponents(ElTable)
      .find((table) => table.props("rowKey") === "path");
    expect(tensors.props("maxHeight")).toBeUndefined();
    expect(tensors.props("data")[0]).toMatchObject({
      segment: "encoder",
      leafCount: 3,
      parameters: 528,
    });
    expect(wrapper.text()).toContain("Parameters by dtype");
    expect(wrapper.text()).toContain("528");
    wrapper.unmount();
  });

  it("removes parquet table limits in page mode while keeping dialog defaults", async () => {
    vi.mocked(parseParquetMetadata).mockResolvedValueOnce({
      numRows: 12,
      rowGroups: [{ numRows: 12, totalByteSize: 48 }],
      byteLength: 1024,
    });
    vi.mocked(summarizeParquetSchema).mockReturnValueOnce({
      columnCount: 1,
      columns: [{ name: "id", physicalType: "INT32" }],
    });
    const wrapper = mountReadyPanel({
      kind: "parquet",
      resolveUrl: URL,
      filename: "data.parquet",
    });
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(ElTable)
        .map((table) => table.props("maxHeight")),
    ).toEqual(["260", "220"]);
    await wrapper.setProps({ pageMode: true });
    expect(
      wrapper
        .findAllComponents(ElTable)
        .map((table) => table.props("maxHeight")),
    ).toEqual([undefined, undefined]);
    expect(wrapper.text()).toContain("Row groups");
    wrapper.unmount();
  });

  it("loads on mount without a dialog around it", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0].url).toBe(URL);
    expect(wrapper.text()).toContain("Reading only the file header");
    wrapper.unmount();
  });

  it("does not load while inactive, and loads once active", async () => {
    const wrapper = mountPanel({ active: false });
    await flushPromises();
    expect(mocks.calls).toHaveLength(0);

    await wrapper.setProps({ active: true });
    await flushPromises();
    expect(mocks.calls).toHaveLength(1);
    wrapper.unmount();
  });

  it("aborts the in-flight read when it goes inactive", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const { signal } = mocks.calls[0].opts;
    expect(signal.aborted).toBe(false);

    await wrapper.setProps({ active: false });
    expect(signal.aborted).toBe(true);
    wrapper.unmount();
  });

  it("aborts the in-flight read when it is unmounted", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const { signal } = mocks.calls[0].opts;

    wrapper.unmount();
    expect(signal.aborted).toBe(true);
  });

  describe("when the header cannot be read", () => {
    const failure = (status) =>
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status, headers: {}, data: {} },
      });
    const failWith = async (status) => {
      vi.mocked(parseParquetMetadata).mockRejectedValueOnce(failure(status));
      const wrapper = mountPanel();
      await flushPromises();
      return wrapper;
    };
    const title = (w) => w.get('[data-testid="error-title"]').text();

    it("says the header is missing when the file is", async () => {
      expect(title(await failWith(404))).toBe(
        "File header not found on any source",
      );
    });

    it("names an unavailable source", async () => {
      expect(title(await failWith(503))).toBe("Upstream source unavailable");
    });

    it("keeps the generic wording for anything else, and can try again", async () => {
      const wrapper = await failWith(500);
      expect(title(wrapper)).toBe("Something went wrong on the server");
      await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
      await flushPromises();
      expect(mocks.calls).toHaveLength(1);
      expect(wrapper.text()).toContain("Reading only the file header");
      wrapper.unmount();
    });
  });
});
