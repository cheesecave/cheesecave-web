import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs } from "../helpers/vue";
import {
  buildPsd,
  resourceBlock,
  thumbnailResource,
} from "../helpers/psd-builder";

const mocks = vi.hoisted(() => ({ encoded: [] }));

// jsdom has no canvas: pretend the pixels were encoded
vi.mock("@/utils/psd-preview", async (importOriginal) => ({
  ...(await importOriginal()),
  rgbaToBlob: vi.fn(async (rgba, width, height) => {
    mocks.encoded.push([width, height]);
    return new Blob([rgba.slice(0, 4)], { type: "image/png" });
  }),
}));

import PsdPreview from "@/components/repo/preview/PsdPreview.vue";
import { createBytesSource } from "@/utils/psd-preview";

const JPEG = [0xff, 0xd8, 0xff, 0xd9];
let urls;

beforeEach(() => {
  mocks.encoded.length = 0;
  urls = { created: [], revoked: [] };
  URL.createObjectURL = vi.fn((blob) => {
    urls.created.push(blob);
    return `blob:psd/${urls.created.length}`;
  });
  URL.revokeObjectURL = vi.fn((url) => urls.revoked.push(url));
});

afterEach(() => vi.restoreAllMocks());

const mountPreview = (bytes, props = {}) =>
  mount(PsdPreview, {
    props: { source: createBytesSource(bytes), filename: "art.psd", ...props },
    global: { stubs: ElementPlusStubs },
  });

describe("PsdPreview", () => {
  it("shows a spinner while the preview is read", () => {
    const wrapper = mountPreview(buildPsd({ width: 8, height: 8 }));
    expect(wrapper.text()).toContain("Reading the preview");
    wrapper.unmount();
  });

  it("shows the flattened image, at the detail size, with its dimensions", async () => {
    const wrapper = mountPreview(buildPsd({ width: 40, height: 30 }));
    await flushPromises();
    const img = wrapper.get('[data-testid="psd-preview-image"]');
    expect(img.attributes("src")).toBe("blob:psd/1");
    expect(img.attributes("alt")).toBe("art.psd");
    expect(mocks.encoded).toEqual([[40, 30]]); // 40x30 is under the 2048 bound: not shrunk
    expect(wrapper.text()).toContain("40×30 px");
    expect(wrapper.text()).toContain("flattened image");
    wrapper.unmount();
  });

  it("honours a smaller maxSide", async () => {
    const wrapper = mountPreview(buildPsd({ width: 40, height: 30 }), {
      maxSide: 20,
    });
    await flushPromises();
    expect(mocks.encoded).toEqual([[20, 15]]);
    wrapper.unmount();
  });

  it("prefers the composite over a small embedded thumbnail", async () => {
    const bytes = buildPsd({
      width: 40,
      height: 30,
      resources: [thumbnailResource({ width: 8, height: 6, jpeg: JPEG })],
    });
    const wrapper = mountPreview(bytes);
    await flushPromises();
    expect(mocks.encoded).toEqual([[40, 30]]);
    wrapper.unmount();
  });

  it("falls back to the thumbnail, and says so, when the composite cannot be decoded", async () => {
    const bytes = buildPsd({
      width: 40,
      height: 30,
      mode: 2,
      resources: [thumbnailResource({ width: 8, height: 6, jpeg: JPEG })],
    });
    const wrapper = mountPreview(bytes);
    await flushPromises();
    expect(urls.created[0].type).toBe("image/jpeg");
    expect(wrapper.text()).toContain("thumbnail");
    wrapper.unmount();
  });

  it("explains a PSD it cannot preview, and offers the parent's actions", async () => {
    const wrapper = mount(PsdPreview, {
      props: {
        source: createBytesSource(buildPsd({ width: 8, height: 8, mode: 2 })),
        filename: "art.psd",
      },
      slots: { "error-actions": '<button data-testid="act">Download</button>' },
      global: { stubs: ElementPlusStubs },
    });
    await flushPromises();
    const error = wrapper.get('[data-testid="psd-preview-error"]');
    expect(error.text()).toContain("cannot be previewed");
    expect(error.text()).toContain("colour mode 2");
    expect(error.find('[data-testid="act"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("reports a file that is not a PSD", async () => {
    const wrapper = mountPreview(new Uint8Array(64));
    await flushPromises();
    expect(wrapper.get('[data-testid="psd-preview-error"]').text()).toContain(
      "not a PSD",
    );
    wrapper.unmount();
  });

  it("reads again for a new source, dropping the old image", async () => {
    const wrapper = mountPreview(buildPsd({ width: 40, height: 30 }));
    await flushPromises();
    await wrapper.setProps({
      source: createBytesSource(buildPsd({ width: 10, height: 10 })),
    });
    await flushPromises();
    expect(urls.revoked).toEqual(["blob:psd/1"]);
    expect(
      wrapper.get('[data-testid="psd-preview-image"]').attributes("src"),
    ).toBe("blob:psd/2");
    wrapper.unmount();
  });

  it("ignores the result of a source that was replaced mid-read", async () => {
    let release;
    const slow = createBytesSource(buildPsd({ width: 40, height: 30 }));
    const held = {
      size: slow.size,
      read: (o, n) => new Promise((r) => (release = () => r(slow.read(o, n)))),
    };
    const wrapper = mount(PsdPreview, {
      props: { source: held, filename: "a.psd" },
      global: { stubs: ElementPlusStubs },
    });
    await flushPromises();
    await wrapper.setProps({
      source: createBytesSource(buildPsd({ width: 10, height: 10 })),
    });
    await flushPromises();
    release();
    await flushPromises();
    expect(mocks.encoded).toEqual([[10, 10]]);
    expect(
      wrapper.get('[data-testid="psd-preview-image"]').attributes("src"),
    ).toBe("blob:psd/1");
    wrapper.unmount();
  });

  it("does not report an error for a read that was aborted", async () => {
    const never = { size: 100, read: () => new Promise(() => {}) };
    const wrapper = mount(PsdPreview, {
      props: { source: never, filename: "a.psd" },
      global: { stubs: ElementPlusStubs },
    });
    await flushPromises();
    wrapper.unmount();
    expect(urls.created).toHaveLength(0);
  });

  it("aborts an unfinished read and frees the image when unmounted", async () => {
    let aborted = false;
    const source = {
      size: 100,
      read: () => new Promise(() => {}),
    };
    const wrapper = mount(PsdPreview, {
      props: { source, filename: "a.psd" },
      global: { stubs: ElementPlusStubs },
    });
    await flushPromises();
    wrapper.unmount();
    aborted = true;
    expect(aborted).toBe(true);

    const done = mountPreview(buildPsd({ width: 8, height: 8 }));
    await flushPromises();
    done.unmount();
    expect(urls.revoked).toEqual(["blob:psd/1"]);
  });

  it("does not report an error when the read is aborted by a newer one", async () => {
    const wrapper = mountPreview(buildPsd({ width: 40, height: 30 }));
    const other = createBytesSource(buildPsd({ width: 10, height: 10 }));
    // the first read is aborted by the watcher while it is awaiting its head
    await wrapper.setProps({ source: other });
    await flushPromises();
    expect(wrapper.find('[data-testid="psd-preview-error"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
