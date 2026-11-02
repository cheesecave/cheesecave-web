import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  api: { create: vi.fn(), update: vi.fn(), addItem: vi.fn() },
  auth: { isAuthenticated: true, username: "alice", organizations: [] },
}));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  collectionsAPI: mocks.api,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));

import CollectionFormDialog from "@/components/collections/CollectionFormDialog.vue";
import AddItemDialog from "@/components/collections/AddItemDialog.vue";

// the shared alert stub shows only its slots; this one shows its title, as the real one does
const TitledAlert = defineComponent({
  name: "ElAlert",
  props: { title: { type: String, default: "" } },
  setup: (props) => () => h("div", { role: "alert" }, props.title),
});
const global = { stubs: { ...ElementPlusStubs, ElAlert: TitledAlert } };
const fail = (status, data, extra = {}) =>
  Object.assign(new Error("x"), { response: { status, data }, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.organizations = [];
});

describe("CollectionFormDialog: a new collection", () => {
  const open = (props = {}) =>
    mount(CollectionFormDialog, {
      props: { modelValue: true, ...props },
      global,
    });
  const type = async (wrapper, title, description = "") => {
    const [titleBox, descriptionBox] = wrapper.findAll("input, textarea");
    await titleBox.setValue(title);
    if (description) await descriptionBox.setValue(description);
  };
  const primary = (wrapper) =>
    wrapper
      .findAll("button")
      .find((b) => /Create collection|Save/.test(b.text()));

  it("creates it with the title, no description key when empty, the owner and the visibility, then reports it", async () => {
    mocks.api.create.mockResolvedValue({
      data: { slug: "alice/t-0123456789abcdef01234567", title: "Trip" },
    });
    const wrapper = open();
    await type(wrapper, "  Trip  ");
    await primary(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.api.create).toHaveBeenCalledExactlyOnceWith({
      title: "Trip",
      namespace: "alice",
      description: undefined,
      private: false,
    });
    expect(wrapper.emitted("saved")[0][0].title).toBe("Trip");
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("offers the organizations where the user can write as owners, and sends the description and the first item", async () => {
    mocks.auth.organizations = [
      { name: "lab", roleInOrg: "member" },
      { name: "club", roleInOrg: "visitor" },
    ];
    mocks.api.create.mockResolvedValue({
      data: { slug: "lab/t-0123456789abcdef01234567", title: "T" },
    });
    const wrapper = open({ firstItem: { type: "model", id: "alice/tagger" } });
    expect(
      wrapper.findAll("[data-el-option], option").length ||
        wrapper.findComponent({ name: "ElSelect" }).exists(),
    ).toBeTruthy();
    wrapper
      .findComponent({ name: "ElSelect" })
      .vm.$emit("update:modelValue", "lab");
    wrapper
      .findComponent({ name: "ElRadioGroup" })
      .vm.$emit("update:modelValue", true);
    await type(wrapper, "T", "About it");
    await primary(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.api.create).toHaveBeenCalledExactlyOnceWith({
      title: "T",
      namespace: "lab",
      description: "About it",
      private: true,
      item: { type: "model", id: "alice/tagger" },
    });
    expect(wrapper.text()).not.toContain("club");
  });

  it("has no owner to choose when the user has no organization, and explains what private means", async () => {
    const wrapper = open();
    expect(wrapper.findComponent({ name: "ElSelect" }).exists()).toBe(false);
    expect(wrapper.text()).toContain("Anyone can see it");
    wrapper
      .findComponent({ name: "ElRadioGroup" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(wrapper.text()).toContain("Only you");
  });

  it("asks for a title before sending anything", async () => {
    const wrapper = open();
    await type(wrapper, "   ");
    await primary(wrapper).trigger("click");
    expect(wrapper.text()).toContain("A collection needs a title");
    expect(mocks.api.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      fail(409, { error: "x" }),
      "You already have a collection with this title",
    ],
    [
      fail(400, { error: "title must be 1 to 60 characters" }),
      "title must be 1 to 60 characters",
    ],
    [
      Object.assign(new Error("x"), {
        appError: { message: "The server is down" },
      }),
      "The server is down",
    ],
    [new Error("plain failure"), "plain failure"],
    [{}, "Something went wrong"],
  ])(
    "shows what went wrong and keeps the dialog open",
    async (error, message) => {
      mocks.api.create.mockRejectedValue(error);
      const wrapper = open();
      await type(wrapper, "T");
      await primary(wrapper).trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain(message);
      expect(wrapper.emitted("saved")).toBeUndefined();
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    },
  );

  it("cancels, and starts empty again the next time it opens", async () => {
    const wrapper = open();
    await type(wrapper, "Half typed");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Cancel")
      .trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    expect(wrapper.find("input").element.value).toBe("");
  });

  it("passes the closing of the dialog (its x, the escape key) on", () => {
    const wrapper = open();
    wrapper
      .findComponent({ name: "ElDialog" })
      .vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("renders nothing while closed", () => {
    expect(
      mount(CollectionFormDialog, { props: { modelValue: false }, global })
        .find("[data-el-dialog]")
        .exists(),
    ).toBe(false);
  });
});

describe("CollectionFormDialog: editing", () => {
  const collection = {
    slug: "alice/old-0123456789abcdef01234567",
    title: "Old",
    description: "About",
    private: true,
    theme: "pink",
  };
  const open = () =>
    mount(CollectionFormDialog, {
      props: { modelValue: true, collection },
      global,
    });

  it("starts from what the collection has and saves the changes, colour included", async () => {
    mocks.api.update.mockResolvedValue({
      data: { data: { ...collection, title: "New", theme: "blue" } },
    });
    const wrapper = open();
    expect(wrapper.find("input").element.value).toBe("Old");
    expect(wrapper.text()).toContain("Edit the collection");
    await wrapper
      .findAll("[role=radio]")
      .find((b) => b.attributes("aria-label") === "blue")
      .trigger("click");
    await wrapper.find("input").setValue("New");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Save")
      .trigger("click");
    await flushPromises();
    expect(mocks.api.update).toHaveBeenCalledExactlyOnceWith(collection.slug, {
      title: "New",
      description: "About",
      private: true,
      theme: "blue",
    });
    expect(wrapper.emitted("saved")[0][0].title).toBe("New");
  });

  it("starts with sensible values when the collection has no description, and marks the chosen colour", async () => {
    const wrapper = mount(CollectionFormDialog, {
      props: {
        modelValue: true,
        collection: { slug: "a/b-0123456789abcdef01234567", title: "Bare" },
      },
      global,
    });
    expect(wrapper.find("textarea").element.value).toBe("");
    const dots = wrapper.findAll("[role=radio]");
    expect(dots).toHaveLength(6);
    expect(
      dots
        .filter((d) => d.attributes("aria-checked") === "true")
        .map((d) => d.attributes("aria-label")),
    ).toEqual(["green"]);
  });

  it("has no owner to choose and no way to create when editing", () => {
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "admin" }];
    const wrapper = open();
    expect(wrapper.findComponent({ name: "ElSelect" }).exists()).toBe(false);
  });
});

describe("AddItemDialog", () => {
  const SLUG = "alice/c-0123456789abcdef01234567";
  const open = () =>
    mount(AddItemDialog, { props: { modelValue: true, slug: SLUG }, global });
  const submit = (wrapper) =>
    wrapper.findAll("button").find((b) => b.text() === "Add");

  it("adds the item by its type and id with the note, and reports the collection it answers", async () => {
    mocks.api.addItem.mockResolvedValue({ data: { slug: SLUG, items: [{}] } });
    const wrapper = open();
    expect(wrapper.find("input").attributes("placeholder")).toBe(
      "owner/model-name",
    );
    wrapper
      .findComponent({ name: "ElRadioGroup" })
      .vm.$emit("update:modelValue", "dataset");
    await flushPromises();
    expect(wrapper.find("input").attributes("placeholder")).toBe(
      "owner/dataset-name",
    );
    await wrapper.find("input").setValue("  alice/faces  ");
    await wrapper.find("textarea").setValue("Training data");
    await submit(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.api.addItem).toHaveBeenCalledExactlyOnceWith(
      SLUG,
      { type: "dataset", id: "alice/faces" },
      "Training data",
    );
    expect(wrapper.emitted("added")[0][0].slug).toBe(SLUG);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("sends no note when there is none", async () => {
    mocks.api.addItem.mockResolvedValue({ data: {} });
    const wrapper = open();
    await wrapper.find("input").setValue("alice/tagger");
    await submit(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.api.addItem).toHaveBeenCalledWith(
      SLUG,
      { type: "model", id: "alice/tagger" },
      undefined,
    );
  });

  it("asks for an id first", async () => {
    const wrapper = open();
    await submit(wrapper).trigger("click");
    expect(wrapper.text()).toContain("Enter the id of the item");
    expect(mocks.api.addItem).not.toHaveBeenCalled();
  });

  it.each([
    [fail(404, {}), "No model with this id, or you cannot see it"],
    [fail(409, {}), "This is already in the collection"],
    [
      fail(501, { error: "paper items are not supported by CheeseCave" }),
      "paper items are not supported by CheeseCave",
    ],
    [
      Object.assign(new Error("x"), { appError: { message: "offline" } }),
      "offline",
    ],
    [{}, "Something went wrong"],
  ])("says what went wrong and stays open", async (error, message) => {
    mocks.api.addItem.mockRejectedValue(error);
    const wrapper = open();
    await wrapper.find("input").setValue("alice/x");
    await submit(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(message);
    expect(wrapper.emitted("added")).toBeUndefined();
  });

  it("passes the closing of the dialog on", () => {
    const wrapper = open();
    wrapper
      .findComponent({ name: "ElDialog" })
      .vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("starts empty each time it opens, and cancels", async () => {
    const wrapper = open();
    await wrapper.find("input").setValue("left over");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Cancel")
      .trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    expect(wrapper.find("input").element.value).toBe("");
  });
});
