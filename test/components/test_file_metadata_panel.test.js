// The metadata panel on its own, outside any dialog: the blob page mounts
// it for parquet files and leaves it on. Rendering and the error paths are
// covered through FilePreviewDialog; this covers what only a standalone
// panel does (pausing, and cleaning up when its page goes away).

import { flushPromises, mount } from "@vue/test-utils";
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

import { parseParquetMetadata } from "@/utils/parquet";
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

beforeEach(() => {
  mocks.calls.length = 0;
});

describe("FileMetadataPanel", () => {
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
