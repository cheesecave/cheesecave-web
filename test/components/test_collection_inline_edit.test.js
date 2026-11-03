import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
import InlineEdit from "@/components/collections/InlineEdit.vue";

// like the real field: it can be focused from outside
const focus = vi.fn();
const Field = defineComponent({
  name: "ElInput",
  props: {
    modelValue: { type: String, default: "" },
    type: { type: String, default: "text" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit, attrs, expose }) {
    expose({ focus });
    return () =>
      h(props.type === "textarea" ? "textarea" : "input", {
        ...attrs,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (e) => emit("update:modelValue", e.target.value),
      });
  },
});

function open(props = {}) {
  const save = vi.fn().mockResolvedValue(true);
  const wrapper = mount(InlineEdit, {
    props: { modelValue: "Old", label: "title", canEdit: true, save, ...props },
    global: { stubs: { ...ElementPlusStubs, ElInput: Field } },
  });
  return { wrapper, save };
}
const pencil = (wrapper) => wrapper.find('button[aria-label^="Edit the"]');
const field = (wrapper) => wrapper.find("input, textarea");
const named = (wrapper, text) =>
  wrapper.findAll("button").find((b) => b.text() === text);
const start = async (wrapper) => {
  await pencil(wrapper).trigger("click");
  return field(wrapper);
};

describe("InlineEdit: what is shown", () => {
  it("shows the text in its tag with the class it is given, and a pencil to the one who may edit", () => {
    const { wrapper } = open({ tag: "h1", textClass: "big" });
    expect(wrapper.find("h1.big").text()).toBe("Old");
    expect(pencil(wrapper).attributes("aria-label")).toBe("Edit the title");
  });

  it("shows no pencil, and no placeholder, to someone who may not edit", () => {
    const { wrapper } = open({
      canEdit: false,
      modelValue: "",
      placeholder: "Add one",
    });
    expect(pencil(wrapper).exists()).toBe(false);
    expect(wrapper.text()).toBe("");
    expect(open({ canEdit: false }).wrapper.text()).toBe("Old");
  });

  it("shows the placeholder to the one who may edit while there is no text", () => {
    const { wrapper } = open({ modelValue: "", placeholder: "Add one" });
    expect(wrapper.text()).toBe("Add one");
  });
});

describe("InlineEdit: changing the text", () => {
  it("opens a field with the text, focused, and saves a trimmed change on Enter, then shows the text again", async () => {
    const { wrapper, save } = open();
    const box = await start(wrapper);
    expect(box.element.value).toBe("Old");
    expect(box.attributes("aria-label")).toBe("title");
    expect(focus).toHaveBeenCalled();
    await box.setValue("  New  ");
    await box.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(save).toHaveBeenCalledExactlyOnceWith("New");
    expect(field(wrapper).exists()).toBe(false);
  });

  it("saves with the Save button too, and Cancel or Esc leave the text as it was", async () => {
    const { wrapper, save } = open();
    await (await start(wrapper)).setValue("New");
    await named(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(save).toHaveBeenCalledWith("New");
    await (await start(wrapper)).setValue("Other");
    await named(wrapper, "Cancel").trigger("click");
    expect(field(wrapper).exists()).toBe(false);
    const box = await start(wrapper);
    await box.setValue("Third");
    await box.trigger("keydown", { key: "Escape" });
    expect(field(wrapper).exists()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("closes without saving when nothing changed", async () => {
    const { wrapper, save } = open();
    const box = await start(wrapper);
    await box.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(save).not.toHaveBeenCalled();
    expect(field(wrapper).exists()).toBe(false);
  });

  it("stays open when the save did not go through, and only then", async () => {
    const { wrapper, save } = open();
    save.mockResolvedValueOnce(false);
    await (await start(wrapper)).setValue("New");
    await named(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(field(wrapper).exists()).toBe(true);
    await named(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(field(wrapper).exists()).toBe(false);
  });

  it("does not save an empty text when one is required, and the button says so", async () => {
    const { wrapper, save } = open({ required: true });
    const box = await start(wrapper);
    await box.setValue("   ");
    expect(named(wrapper, "Save").attributes("disabled")).toBeDefined();
    await box.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(save).not.toHaveBeenCalled();
    expect(field(wrapper).exists()).toBe(true);
  });

  it("saves an empty text when it is not required (the description is cleared)", async () => {
    const { wrapper, save } = open({ label: "description" });
    await (await start(wrapper)).setValue("");
    await named(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(save).toHaveBeenCalledExactlyOnceWith("");
  });

  it("in a text of several lines, Enter is a new line and Ctrl or Cmd with Enter saves", async () => {
    const { wrapper, save } = open({ multiline: true, maxlength: 150 });
    const box = await start(wrapper);
    expect(box.element.tagName).toBe("TEXTAREA");
    await box.setValue("one");
    await box.trigger("keydown", { key: "Enter" });
    expect(save).not.toHaveBeenCalled();
    await box.trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();
    expect(save).toHaveBeenCalledWith("one");
    const again = await start(wrapper);
    await again.setValue("two");
    await again.trigger("keydown", { key: "Enter", metaKey: true });
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith("two");
  });

  it("ignores other keys", async () => {
    const { wrapper, save } = open();
    const box = await start(wrapper);
    await box.setValue("New");
    await box.trigger("keydown", { key: "a" });
    expect(save).not.toHaveBeenCalled();
    expect(field(wrapper).exists()).toBe(true);
  });

  it("keeps the field disabled while it saves", async () => {
    const { wrapper, save } = open();
    let done;
    save.mockReturnValue(new Promise((resolve) => (done = resolve)));
    await (await start(wrapper)).setValue("New");
    await named(wrapper, "Save").trigger("click");
    expect(field(wrapper).element.disabled).toBe(true);
    done(true);
    await flushPromises();
    expect(field(wrapper).exists()).toBe(false);
  });
});
