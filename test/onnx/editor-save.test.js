import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue.js";
import { createDefaultDocument } from "../../src/onnx/config/document.js";

vi.mock("@form-create/designer", () => {
  const component = defineComponent({
    name: "FcDesigner",
    setup(_props, { slots, expose }) {
      let rules = [];
      expose({
        addComponent() {},
        setOption() {},
        setRule(value) {
          rules = JSON.parse(JSON.stringify(value));
        },
        getRule() {
          return JSON.parse(JSON.stringify(rules));
        },
      });
      return () => h("div", slots["space-config"]?.());
    },
  });
  component.component = () => {};
  return { default: component };
});
vi.mock("../../src/onnx/editor/useModelResource.js", () => ({
  useModelResource: () => ({
    state: ref({ status: "ready" }),
    ready: ref(true),
    facts: ref({}),
    refresh() {},
  }),
}));
vi.mock("../../src/onnx/editor/useSpaceResources.js", () => ({
  useSpaceResources: () => ({ ready: true }),
}));
vi.mock("../../src/onnx/editor/TaskPipelineSettings.vue", () => ({
  default: defineComponent({ setup: () => () => h("div") }),
}));
import Editor from "../../src/onnx/editor/Editor.vue";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const wrappers = [];
beforeEach(() =>
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    callback();
    return 1;
  }),
);
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});
async function mountEditor(saveDocument, reloadDocument = vi.fn()) {
  const wrapper = mount(Editor, {
    props: {
      context: { id: "alice/demo", revision: "main" },
      document: createDefaultDocument(),
      saveDocument,
      reloadDocument,
      previewTo: "/spaces/alice/demo",
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElInputNumber: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("authoring during an in-flight commit", () => {
  it("keeps changes made after the saved snapshot dirty until a later save succeeds", async () => {
    const pending = deferred();
    const saveDocument = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined);
    const wrapper = await mountEditor(saveDocument);
    await wrapper
      .get('[data-testid="document-name"] input')
      .setValue("Before commit");
    await wrapper.get('[data-testid="save-document"]').trigger("click");
    expect(saveDocument.mock.calls[0][0].name).toBe("Before commit");
    await wrapper
      .get('[data-testid="document-name"] input')
      .setValue("Edited during commit");
    pending.resolve();
    await flushPromises();
    expect(wrapper.get(".cc-save-status").text()).toBe("有未保存修改");
    expect(
      wrapper.get('[data-testid="document-name"] input').element.value,
    ).toBe("Edited during commit");
    await wrapper.get('[data-testid="save-document"]').trigger("click");
    await flushPromises();
    expect(saveDocument.mock.calls[1][0].name).toBe("Edited during commit");
    expect(wrapper.get(".cc-save-status").text()).toMatch(/^已保存/);
  });

  it("does not overwrite a restored document or mark it saved when an older commit finishes", async () => {
    const pending = deferred();
    const remote = createDefaultDocument();
    remote.name = "Restored document";
    remote.ui.rules[0].props.text = "Restored heading";
    const wrapper = await mountEditor(
      vi.fn().mockReturnValue(pending.promise),
      vi.fn().mockResolvedValue(remote),
    );
    await wrapper.get('[data-testid="save-document"]').trigger("click");
    await wrapper.get('[data-testid="reload-document"]').trigger("click");
    await flushPromises();
    pending.resolve();
    await flushPromises();
    expect(
      wrapper.get('[data-testid="document-name"] input').element.value,
    ).toBe("Restored document");
    expect(wrapper.vm.$.setupState.draft.ui.rules[0].props.text).toBe(
      "Restored heading",
    );
    expect(wrapper.get(".cc-save-status").text()).not.toMatch(/^已保存/);
  });
});
