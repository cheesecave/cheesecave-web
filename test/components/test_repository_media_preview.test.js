import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  load: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  callback: null,
}));
vi.mock("hls.js", () => ({
  default: class {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: "error" };
    loadSource(...args) {
      state.load(...args);
    }
    attachMedia(...args) {
      state.attach(...args);
    }
    destroy() {
      state.destroy();
    }
    on(_e, cb) {
      state.callback = cb;
    }
  },
}));
import Viewer from "@/components/repo/RepositoryMediaPreview.vue";
const wrappers = [];
const open = (props) => {
  const w = mount(Viewer, { props });
  wrappers.push(w);
  return w;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
});
describe("shared repository media player", () => {
  it("retains ordinary native video source", async () => {
    const w = open({
      src: "/models/a/b/resolve/main/test.mp4",
      filename: "test.mp4",
    });
    await flushPromises();
    expect(w.get("video").attributes("src")).toContain("/resolve/");
    expect(w.get("video").attributes("controlslist")).toBeUndefined();
    expect(state.load).not.toHaveBeenCalled();
  });
  it("plays controlled HLS through the same native video with download controls disabled", async () => {
    const src =
      "/api/models/a/b/access/guest/media/hls/playlist?path=test.mp4&snapshot=abcd";
    const w = open({
      src,
      filename: "test.mp4",
      restricted: true,
      playlist: true,
    });
    await flushPromises();
    expect(w.get("video").attributes("disablepictureinpicture")).toBeDefined();
    expect(w.get("video").attributes("disableremoteplayback")).toBeDefined();
    expect(state.load).toHaveBeenCalledWith(src);
    expect(state.attach).toHaveBeenCalledWith(w.get("video").element);
    expect(w.get("video").attributes("controlslist")).toContain("nodownload");
    expect(w.get("video").attributes("src")).toBeUndefined();
    w.unmount();
    expect(state.destroy).toHaveBeenCalled();
  });
  it("refuses an original or cross-origin source in controlled mode", async () => {
    const w = open({
      src: "https://storage.invalid/raw.mp4",
      filename: "test.mp4",
      restricted: true,
      playlist: true,
    });
    await flushPromises();
    expect(state.load).not.toHaveBeenCalled();
    expect(w.text()).toContain("Media preview unavailable");
  });
  it("uses the same restricted audio player and reports lost authorization", async () => {
    const w = open({
      src: "/api/models/a/b/access/guest/media/hls/playlist?path=voice.wav&snapshot=abcd",
      filename: "voice.wav",
      kind: "audio",
      restricted: true,
      playlist: true,
    });
    await flushPromises();
    expect(w.get("audio").attributes("controlslist")).toContain("nodownload");
    state.callback("error", { fatal: false, response: { code: 404 } });
    await flushPromises();
    expect(w.emitted("access-denied")).toHaveLength(1);
    expect(state.destroy).toHaveBeenCalled();
    expect(w.get("audio").attributes("src")).toBeUndefined();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
