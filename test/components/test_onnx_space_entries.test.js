import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  canEdit: vi.fn(),
  route: {
    params: {
      type: "space",
      namespace: "alice",
      name: "demo",
      branch: "draft",
    },
    path: "/spaces/alice/demo/onnx-editor/draft",
  },
}));
vi.mock("@/utils/onnx-space", () => ({
  loadOnnxSpace: mocks.load,
  saveOnnxSpace: mocks.save,
  canEditOnnxSpace: mocks.canEdit,
  onnxEditorLocation: ({ id, revision }) => ({
    path: `/spaces/${id}/onnx-editor/${revision}`,
  }),
  onnxAppLocation: ({ id, revision }) => ({
    path: `/spaces/${id}`,
    query: { revision },
  }),
}));
vi.mock("vue-router/auto", () => ({ useRoute: () => mocks.route }));
vi.mock("@/onnx/OnnxDemo.vue", () => ({
  __esModule: true,
  default: defineComponent({
    name: "OnnxDemo",
    props: ["document", "context"],
    setup: (props) => () =>
      h("div", { "data-demo": "true" }, props.document.name),
  }),
}));
vi.mock("@/onnx/SpaceStudio.vue", () => ({
  __esModule: true,
  default: defineComponent({
    name: "SpaceStudio",
    props: [
      "document",
      "context",
      "saveDocument",
      "reloadDocument",
      "previewTo",
    ],
    setup: () => () => h("div", { "data-studio": "true" }),
  }),
}));
import SpaceApp from "@/components/space/SpaceApp.vue";
import OnnxSpaceSettings from "@/components/space/OnnxSpaceSettings.vue";
import EditorPage from "@/pages/[type]s/[namespace]/[name]/onnx-editor/[branch].vue";
import { useAuthStore } from "@/stores/auth";

const context = { id: "alice/demo", revision: "draft" };
const doc = { schemaVersion: 3, name: "Saved demo" };
const disabled = { version: 1, enabled: false, document: null };
const wrappers = [];
function mounting(component, options = {}) {
  const wrapper = mount(component, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        ErrorState: defineComponent({
          props: ["error", "retry"],
          setup: (props) => () =>
            h(
              "button",
              { "data-error": "true", onClick: props.retry },
              props.error?.message || "error",
            ),
        }),
      },
    },
    ...options,
  });
  wrappers.push(wrapper);
  return wrapper;
}
function defer() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.params.type = "space";
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice" };
  mocks.canEdit.mockReturnValue(true);
  mocks.load.mockResolvedValue({ config: disabled, commit: "head-a" });
  mocks.save.mockImplementation(async (_ctx, config) => ({
    config,
    commit: "head-b",
  }));
});
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("the shared Space App", () => {
  it("keeps the original App content when ONNX is disabled and for external Spaces", async () => {
    const wrapper = mounting(SpaceApp, {
      props: { context },
      slots: { fallback: "Existing SDK App" },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Existing SDK App");
    expect(wrapper.find("[data-demo]").exists()).toBe(false);
    mocks.load.mockClear();
    await wrapper.setProps({ isExternal: true });
    await flushPromises();
    expect(wrapper.text()).toContain("Existing SDK App");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("renders the enabled document natively and sends editors back to the same revision", async () => {
    mocks.load.mockResolvedValue({
      config: { ...disabled, enabled: true, document: doc },
      commit: "h",
    });
    const wrapper = mounting(SpaceApp, {
      props: { context },
      slots: { fallback: "Existing SDK App" },
    });
    await flushPromises();
    expect(wrapper.find("[data-demo]").text()).toBe("Saved demo");
    expect(wrapper.text()).not.toContain("Existing SDK App");
    expect(wrapper.findComponent({ name: "RouterLink" }).props("to")).toEqual({
      path: "/spaces/alice/demo/onnx-editor/draft",
    });
    expect(wrapper.find("iframe").exists()).toBe(false);
  });
  it("shows pending configuration for enabled null and does not mistake load errors for disabled", async () => {
    mocks.load.mockResolvedValueOnce({
      config: { ...disabled, enabled: true },
      commit: "h",
    });
    const wrapper = mounting(SpaceApp, {
      props: { context },
      slots: { fallback: "Existing SDK App" },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("not been configured");
    expect(wrapper.find("[data-demo]").exists()).toBe(false);
    mocks.load.mockRejectedValueOnce(new Error("Cannot read manifest"));
    await wrapper.setProps({ context: { ...context, revision: "broken" } });
    await flushPromises();
    expect(wrapper.find("[data-error]").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Existing SDK App");
  });
  it("ignores late responses from the previous revision", async () => {
    const old = defer();
    mocks.load.mockReturnValueOnce(old.promise);
    const wrapper = mounting(SpaceApp, {
      props: { context },
      slots: { fallback: "Original" },
    });
    await wrapper.setProps({ context: { ...context, revision: "next" } });
    await flushPromises();
    old.resolve({
      config: { ...disabled, enabled: true, document: doc },
      commit: "old",
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Original");
    expect(wrapper.find("[data-demo]").exists()).toBe(false);
  });
});

describe("ONNX settings", () => {
  it("disables and re-enables without deleting the saved document or losing the commit guard", async () => {
    mocks.load.mockResolvedValue({
      config: { ...disabled, enabled: true, document: doc },
      commit: "head-a",
    });
    const wrapper = mounting(OnnxSpaceSettings, { props: { context } });
    await flushPromises();
    await wrapper.get('[data-testid="onnx-enabled"] input').setValue(false);
    await wrapper.get('[data-testid="save-onnx-settings"]').trigger("click");
    await flushPromises();
    expect(mocks.save).toHaveBeenLastCalledWith(
      context,
      { ...disabled, document: doc },
      expect.objectContaining({ parentCommit: "head-a" }),
    );
    await wrapper.get('[data-testid="onnx-enabled"] input').setValue(true);
    await wrapper.get('[data-testid="save-onnx-settings"]').trigger("click");
    await flushPromises();
    expect(mocks.save).toHaveBeenLastCalledWith(
      context,
      { ...disabled, enabled: true, document: doc },
      expect.objectContaining({ parentCommit: "head-b" }),
    );
  });
  it("does not expose writing controls after a load failure or without permission", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Denied"));
    const wrapper = mounting(OnnxSpaceSettings, { props: { context } });
    await flushPromises();
    expect(wrapper.find('[data-testid="save-onnx-settings"]').exists()).toBe(
      false,
    );
    mocks.canEdit.mockReturnValue(false);
    await wrapper.setProps({ context: { ...context, revision: "readonly" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="save-onnx-settings"]').exists()).toBe(
      false,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("the author route", () => {
  it("does not offer the ONNX editor on a model or dataset repository", async () => {
    mocks.route.params.type = "model";
    const wrapper = mounting(EditorPage);
    await flushPromises();
    expect(wrapper.find("[data-studio]").exists()).toBe(false);
    expect(wrapper.find("[data-error]").exists()).toBe(true);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("loads the current branch and saves with the current enabled flag and parent commit", async () => {
    mocks.load.mockResolvedValue({
      config: { ...disabled, enabled: true, document: doc },
      commit: "head-a",
    });
    const wrapper = mounting(EditorPage);
    await flushPromises();
    const studio = wrapper.findComponent({ name: "SpaceStudio" });
    expect(studio.props("context")).toEqual(context);
    expect(studio.props("document")).toEqual(doc);
    expect(studio.props("previewTo")).toEqual({
      path: "/spaces/alice/demo",
      query: { revision: "draft" },
    });
    const updated = { ...doc, name: "Updated" };
    await studio.props("saveDocument")(updated);
    await flushPromises();
    expect(mocks.save).toHaveBeenLastCalledWith(
      context,
      { version: 1, enabled: true, document: updated },
      expect.objectContaining({ parentCommit: "head-a" }),
    );
    await studio.props("saveDocument")(doc);
    expect(mocks.save).toHaveBeenLastCalledWith(
      context,
      { version: 1, enabled: true, document: doc },
      expect.objectContaining({ parentCommit: "head-b" }),
    );
  });
  it("requires enablement and permission before mounting the editor", async () => {
    const wrapper = mounting(EditorPage);
    await flushPromises();
    expect(wrapper.find("[data-studio]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Enable browser ONNX");
    wrapper.unmount();
    mocks.canEdit.mockReturnValue(false);
    mocks.load.mockClear();
    const denied = mounting(EditorPage);
    await flushPromises();
    expect(denied.find("[data-studio]").exists()).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("keeps the editor mounted during reload and preserves the draft when reloading fails", async () => {
    mocks.load.mockResolvedValue({
      config: { ...disabled, enabled: true, document: doc },
      commit: "head-a",
    });
    const wrapper = mounting(EditorPage);
    await flushPromises();
    const studio = wrapper.findComponent({ name: "SpaceStudio" });
    const pending = defer();
    mocks.load.mockReturnValueOnce(pending.promise);
    const reload = studio.props("reloadDocument")();
    await flushPromises();
    expect(wrapper.findComponent({ name: "SpaceStudio" }).vm).toBe(studio.vm);
    const updated = { ...doc, name: "Remote revision" };
    pending.resolve({
      config: { ...disabled, enabled: true, document: updated },
      commit: "head-c",
    });
    await expect(reload).resolves.toEqual(updated);
    expect(wrapper.findComponent({ name: "SpaceStudio" }).vm).toBe(studio.vm);
    mocks.load.mockRejectedValueOnce(new Error("Offline"));
    await expect(studio.props("reloadDocument")()).rejects.toThrow("Offline");
    expect(wrapper.findComponent({ name: "SpaceStudio" }).vm).toBe(studio.vm);
    await studio.props("saveDocument")(doc);
    expect(mocks.save).toHaveBeenLastCalledWith(
      context,
      expect.anything(),
      expect.objectContaining({ parentCommit: "head-c" }),
    );
  });
});
