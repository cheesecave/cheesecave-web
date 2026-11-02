import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  api: { list: vi.fn(), get: vi.fn(), addItem: vi.fn(), removeItem: vi.fn() },
  auth: { isAuthenticated: true, username: "alice", organizations: [{ name: "lab", roleInOrg: "member" }, { name: "club", roleInOrg: "visitor" }] },
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/utils/api", async (original) => ({ ...(await original()), collectionsAPI: mocks.api }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), { success: mocks.success, error: mocks.error }),
}));

import AddToCollectionMenu from "@/components/collections/AddToCollectionMenu.vue";

const ROW = (name, title, extra = {}) => ({ name: `alice/${name}-0123456789abcdef01234567`, title, private: false, upvotes: 0, ...extra });
const A = ROW("a", "Alpha");
const B = ROW("b", "Beta", { private: true });

function mountMenu() {
  return mount(AddToCollectionMenu, {
    props: { repoType: "model", repoId: "alice/tagger" },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub, CollectionFormDialog: true } },
  });
}
const openIt = async (wrapper) => {
  wrapper.findComponent({ name: "ElPopover" }).vm.$emit("show");
  await flushPromises();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.list.mockImplementation(async (params) => ({ data: params.item ? [A] : [A, B] }));
});

describe("AddToCollectionMenu", () => {
  it("lists the collections the user can write in, ticking those that already hold the repository", async () => {
    const wrapper = mountMenu();
    await openIt(wrapper);
    expect(mocks.api.list).toHaveBeenCalledWith({ owner: ["alice", "lab"], sort: "position", expand: "false", limit: 200 });
    expect(mocks.api.list).toHaveBeenCalledWith({ owner: ["alice", "lab"], item: "models/alice/tagger", expand: "false", limit: 200 });
    const rows = wrapper.findAll(".rows li");
    expect(rows.map((r) => r.text())).toEqual(["Alpha", "Beta"]);
    expect(rows.map((r) => r.find("input").element.checked)).toEqual([true, false]);
    expect(rows[1].find(".i-carbon-locked").exists()).toBe(true);
    expect(rows[0].find(".i-carbon-locked").exists()).toBe(false);
    expect(wrapper.find("a").props?.() ?? wrapper.findComponent(RouterLinkStub).props("to")).toBe("/alice/collections");
  });

  it("says there is nothing yet when the user has no collection", async () => {
    mocks.api.list.mockResolvedValue({ data: [] });
    const wrapper = mountMenu();
    await openIt(wrapper);
    expect(wrapper.text()).toContain("You have no collection yet.");
  });

  it("adds the repository when an unticked collection is ticked", async () => {
    mocks.api.addItem.mockResolvedValue({ data: {} });
    const wrapper = mountMenu();
    await openIt(wrapper);
    const box = wrapper.findAll(".rows li")[1].find("input");
    await box.setValue(true);
    await flushPromises();
    expect(mocks.api.addItem).toHaveBeenCalledExactlyOnceWith(B.name, { type: "model", id: "alice/tagger" });
    expect(wrapper.findAll(".rows li")[1].find("input").element.checked).toBe(true);
  });

  it("removes the repository when a ticked collection is unticked, finding its item first", async () => {
    mocks.api.get.mockResolvedValue({ data: { items: [{ _id: "x".repeat(24), id: "alice/other", type: "model" }, { _id: "y".repeat(24), id: "alice/tagger", type: "model" }] } });
    mocks.api.removeItem.mockResolvedValue({});
    const wrapper = mountMenu();
    await openIt(wrapper);
    await wrapper.findAll(".rows li")[0].find("input").setValue(false);
    await flushPromises();
    expect(mocks.api.get).toHaveBeenCalledExactlyOnceWith(A.name);
    expect(mocks.api.removeItem).toHaveBeenCalledExactlyOnceWith(A.name, "y".repeat(24));
    expect(wrapper.findAll(".rows li")[0].find("input").element.checked).toBe(false);
  });

  it("does not try to remove what the collection no longer holds, and still unticks it", async () => {
    mocks.api.get.mockResolvedValue({ data: { items: [] } });
    const wrapper = mountMenu();
    await openIt(wrapper);
    await wrapper.findAll(".rows li")[0].find("input").setValue(false);
    await flushPromises();
    expect(mocks.api.removeItem).not.toHaveBeenCalled();
    expect(wrapper.findAll(".rows li")[0].find("input").element.checked).toBe(false);
  });

  it("says why a change failed, with the server's words when it has some", async () => {
    mocks.api.addItem.mockRejectedValueOnce({ response: { data: { error: "A collection can have at most 1000 items" } } });
    mocks.api.addItem.mockRejectedValueOnce({});
    const wrapper = mountMenu();
    await openIt(wrapper);
    await wrapper.findAll(".rows li")[1].find("input").setValue(true);
    await flushPromises();
    expect(mocks.error).toHaveBeenLastCalledWith("A collection can have at most 1000 items");
    const again = wrapper.findAll(".rows li")[1].find("input");
    again.element.checked = true;
    await again.trigger("change");                  // the box went back to unticked after the failure: tick it again
    await flushPromises();
    expect(mocks.error).toHaveBeenLastCalledWith("That did not work");
    expect(mocks.api.addItem).toHaveBeenCalledTimes(2);
  });

  it("says when the collections cannot be loaded", async () => {
    mocks.api.list.mockRejectedValueOnce({ response: { data: { error: "nope" } } });
    const wrapper = mountMenu();
    await openIt(wrapper);
    expect(mocks.error).toHaveBeenLastCalledWith("nope");
    mocks.api.list.mockRejectedValueOnce({});
    await openIt(wrapper);
    expect(mocks.error).toHaveBeenLastCalledWith("The collections could not be loaded");
  });

  it("opens the new-collection dialog with the repository as its first item, and reloads after it", async () => {
    const wrapper = mountMenu();
    await openIt(wrapper);
    expect(wrapper.findComponent({ name: "CollectionFormDialog" }).props("modelValue")).toBe(false);
    await wrapper.find("button.new").trigger("click");
    const dialog = wrapper.findComponent({ name: "CollectionFormDialog" });
    expect(dialog.props("modelValue")).toBe(true);
    expect(dialog.props("firstItem")).toEqual({ type: "model", id: "alice/tagger" });
    mocks.api.list.mockClear();
    dialog.vm.$emit("saved", { title: "Fresh" });
    await flushPromises();
    expect(mocks.success).toHaveBeenCalledWith({ message: 'Added to "Fresh"', duration: 4000 });
    expect(mocks.api.list).toHaveBeenCalledTimes(2);
  });

  it("works for a user with no organizations loaded", async () => {
    mocks.auth.organizations = undefined;
    const wrapper = mountMenu();
    await openIt(wrapper);
    expect(mocks.api.list).toHaveBeenCalledWith(expect.objectContaining({ owner: ["alice"] }));
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "member" }, { name: "club", roleInOrg: "visitor" }];
  });
});
