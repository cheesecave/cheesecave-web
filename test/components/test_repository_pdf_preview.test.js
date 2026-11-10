import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const pdf = vi.hoisted(() => ({
  getDocument: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
  pages: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdf.getDocument,
}));
import Viewer from "@/components/repo/RepositoryPdfPreview.vue";
const wrappers = [];
const open = (props) => {
  const w = mount(Viewer, { props });
  wrappers.push(w);
  return w;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  });
  pdf.render.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  pdf.pages.mockResolvedValue({
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
    render: pdf.render,
  });
  pdf.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: pdf.pages,
      destroy: pdf.destroy,
    }),
    destroy: pdf.destroy,
  });
  vi.stubGlobal(
    "Image",
    class {
      width = 600;
      height = 800;
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("one repository PDF viewer for ordinary and controlled sources", () => {
  it("uses the same pager, zoom and canvas for ordinary PDF bytes", async () => {
    const w = open({
      url: "/models/acme/demo/resolve/main/manual.pdf",
      filename: "manual.pdf",
    });
    await flushPromises();
    expect(pdf.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/models/acme/demo/resolve/main/manual.pdf",
        isEvalSupported: false,
      }),
    );
    expect(w.get("canvas").exists()).toBe(true);
    expect(w.get('[aria-label="PDF page"]').element.value).toBe("1");
    await w.get('[aria-label="Next PDF page"]').trigger("click");
    await flushPromises();
    expect(pdf.pages).toHaveBeenLastCalledWith(2);
    await w.get('[aria-label="Zoom in PDF"]').trigger("click");
    await flushPromises();
    expect(w.text()).toContain("125%");
    expect(w.find("iframe").exists()).toBe(false);
  });
  it("shows equivalent PDF points and high-resolution raster pages at the same logical size and zoom", async () => {
    pdf.pages.mockResolvedValue({
      getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
      render: pdf.render,
    });
    const ordinary = open({ url: "/ordinary.pdf", filename: "ordinary.pdf" });
    await flushPromises();
    vi.stubGlobal(
      "Image",
      class {
        width = 1236;
        height = 1600;
        set src(value) {
          this.value = value;
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const controlled = open({
      pageCount: 3,
      loadPage: vi.fn().mockResolvedValue("data:image/png;base64,AA=="),
      filename: "controlled.pdf",
    });
    await flushPromises();
    const ordinaryCanvas = ordinary.get("canvas").element,
      controlledCanvas = controlled.get("canvas").element;
    expect(ordinaryCanvas.style.height).toBe("800px");
    expect(controlledCanvas.style.height).toBe("800px");
    expect(
      Math.abs(
        parseFloat(ordinaryCanvas.style.width) -
          parseFloat(controlledCanvas.style.width),
      ),
    ).toBeLessThan(1);
    await ordinary.get('[aria-label="Zoom in PDF"]').trigger("click");
    await controlled.get('[aria-label="Zoom in PDF"]').trigger("click");
    await flushPromises();
    expect(parseFloat(ordinaryCanvas.style.height)).toBeCloseTo(1000, 6);
    expect(parseFloat(controlledCanvas.style.height)).toBeCloseTo(1000, 6);
    expect(
      Math.abs(
        parseFloat(ordinaryCanvas.style.width) -
          parseFloat(controlledCanvas.style.width),
      ),
    ).toBeLessThan(1);
  });

  it("bounds huge PDF page canvases and rejects invalid viewport dimensions", async () => {
    pdf.pages.mockResolvedValueOnce({
      getViewport: ({ scale }) => ({
        width: 100000 * scale,
        height: 200000 * scale,
      }),
      render: pdf.render,
    });
    const huge = open({ url: "/huge.pdf" });
    await flushPromises();
    expect(huge.get("canvas").element.width).toBe(400);
    expect(huge.get("canvas").element.height).toBe(800);
    pdf.render.mockClear();
    pdf.pages.mockResolvedValueOnce({
      getViewport: () => ({ width: Infinity, height: 800 }),
      render: pdf.render,
    });
    const invalid = open({ url: "/invalid.pdf" });
    await flushPromises();
    expect(invalid.text()).toContain("PDF preview unavailable");
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it("renders authorized raster pages in that same canvas without fetching PDF bytes", async () => {
    const load = vi.fn().mockResolvedValue("data:image/png;base64,AA==");
    const w = open({ filename: "manual.pdf", pageCount: 3, loadPage: load });
    await flushPromises();
    expect(load).toHaveBeenCalledWith(1, expect.any(Object));
    expect(pdf.getDocument).not.toHaveBeenCalled();
    expect(w.get("canvas").exists()).toBe(true);
    expect(w.find("a[download],iframe").exists()).toBe(false);
    await w.get('[aria-label="Next PDF page"]').trigger("click");
    await flushPromises();
    expect(load).toHaveBeenLastCalledWith(2, expect.any(Object));
  });
  it("clears private canvas while a different source loads and ignores an older document completing last", async () => {
    let finishOld;
    const old = { numPages: 7, getPage: vi.fn(), destroy: vi.fn() };
    pdf.getDocument.mockReturnValueOnce({
      promise: new Promise((resolve) => (finishOld = resolve)),
      destroy: vi.fn(),
    });
    const w = open({ url: "/old.pdf", filename: "old.pdf" });
    await flushPromises();
    await w.setProps({ url: "/new.pdf", filename: "new.pdf" });
    await flushPromises();
    expect(w.get('[aria-label="PDF page"]').attributes("max")).toBe("3");
    finishOld(old);
    await flushPromises();
    await w.get('[aria-label="Next PDF page"]').trigger("click");
    await flushPromises();
    expect(old.getPage).not.toHaveBeenCalled();
    expect(old.destroy).toHaveBeenCalled();
    expect(pdf.pages).toHaveBeenLastCalledWith(2);
    let finishPage;
    await w.setProps({
      loadPage: () => new Promise((resolve) => (finishPage = resolve)),
      pageCount: 2,
    });
    await flushPromises();
    expect(w.get("canvas").element.width).toBe(0);
    expect(w.get("canvas").element.height).toBe(0);
    finishPage("data:image/png;base64,AA==");
    await flushPromises();
  });
  it("revokes derived page object URLs immediately when the viewer unmounts", async () => {
    const OriginalURL = URL,
      create = vi.fn(() => "blob:pdf-page"),
      revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        static createObjectURL = (value) => create(value);
        static revokeObjectURL = (value) => revoke(value);
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        width = 600;
        height = 800;
        set src(value) {
          this.value = value;
        }
      },
    );
    const w = open({
      pageCount: 1,
      loadPage: vi
        .fn()
        .mockResolvedValue(new Blob(["png"], { type: "image/png" })),
    });
    await flushPromises();
    expect(create).toHaveBeenCalled();
    w.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:pdf-page");
  });

  it("reports controlled-page denial and does not fall back to an original URL", async () => {
    const denied = {
      response: { status: 404, headers: { "x-error-code": "RepoNotFound" } },
    };
    const w = open({
      url: "/raw.pdf",
      pageCount: 2,
      loadPage: vi.fn().mockRejectedValue(denied),
    });
    await flushPromises();
    expect(w.emitted("access-denied")[0]).toEqual([denied]);
    expect(pdf.getDocument).not.toHaveBeenCalled();
    expect(w.text()).toContain("PDF preview unavailable");
  });
});
