import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const SLUG = "alice/iccv-6ae8b2220654892215f0a71c";
const mocks = vi.hoisted(() => ({
  route: {
    params: { owner: "alice", slug: "iccv-6ae8b2220654892215f0a71c" },
    path: "/collections/alice/iccv-6ae8b2220654892215f0a71c",
    fullPath: "/collections/alice/iccv-6ae8b2220654892215f0a71c",
  },
  router: { push: vi.fn(), replace: vi.fn() },
  api: {
    get: vi.fn(),
    upvote: vi.fn(),
    removeUpvote: vi.fn(),
    remove: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
  },
  auth: { isAuthenticated: true, username: "alice", organizations: [] },
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/utils/api", async (original) => ({
  ...(await original()),
  collectionsAPI: mocks.api,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
  }),
  ElMessageBox: { confirm: mocks.confirm },
}));

import CollectionPage from "@/pages/collections/[owner]/[slug].vue";

const ITEM = (n, extra = {}) => ({
  _id: String(n).repeat(24),
  type: "model",
  id: `alice/m${n}`,
  position: n,
  private: false,
  likes: 1,
  downloads: 2,
  lastModified: "2026-10-01T12:00:00.000Z",
  ...extra,
});
const COLLECTION = (extra = {}) => ({
  slug: SLUG,
  title: "ICCV 2026",
  description: "Models and data",
  theme: "orange",
  private: false,
  upvotes: 2,
  isUpvotedByUser: false,
  lastUpdated: "2026-10-01T12:00:00.000Z",
  owner: { name: "alice", type: "user" },
  items: [ITEM(1), ITEM(2), ITEM(3)],
  ...extra,
});

const stubs = {
  ...ElementPlusStubs,
  RouterLink: RouterLinkStub,
  EntityAvatar: true,
  PrivateBadge: true,
  ErrorState: {
    props: ["error", "retry"],
    template:
      '<div data-error="true">{{ error.message }}<button data-retry @click="retry">retry</button></div>',
  },
  CollectionFormDialog: true,
  AddItemDialog: true,
};

async function mountPage(collection = COLLECTION()) {
  mocks.api.get.mockImplementation(async () => ({
    data: structuredClone(collection),
  })); // a fresh copy per request, as over the wire
  const wrapper = mount(CollectionPage, { global: { stubs, directives: {} } });
  await flushPromises();
  return wrapper;
}
const button = (wrapper, text) =>
  wrapper.findAll("button").find((b) => b.text().includes(text));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.params = {
    owner: "alice",
    slug: "iccv-6ae8b2220654892215f0a71c",
  };
  mocks.route.path = `/collections/${SLUG}`;
  mocks.route.fullPath = mocks.route.path;
  mocks.auth.isAuthenticated = true;
  mocks.auth.username = "alice";
  mocks.auth.organizations = [];
  mocks.api.updateItem.mockResolvedValue({});
  document.title = "";
});

describe("the collection page", () => {
  it("shows the title, the description, its owner, the number of items and its cards", async () => {
    const wrapper = await mountPage();
    expect(mocks.api.get).toHaveBeenCalledWith(SLUG);
    expect(wrapper.find("h1").text()).toContain("ICCV 2026");
    expect(wrapper.text()).toContain("Models and data");
    expect(wrapper.text()).toContain("3 items");
    expect(wrapper.findAll(".item-card")).toHaveLength(3);
    expect(wrapper.find(".collection-head").attributes("style")).toContain(
      "--theme: #f97316",
    );
    expect(document.title).toBe("ICCV 2026 - collection");
    expect(mocks.router.replace).not.toHaveBeenCalled(); // already the canonical address
  });

  it("says '1 item' for one, hides the description when empty, marks a private collection and shows an organization owner", async () => {
    const wrapper = await mountPage(
      COLLECTION({
        items: [ITEM(1)],
        description: undefined,
        private: true,
        owner: { name: "lab", type: "org" },
      }),
    );
    expect(wrapper.text()).toContain("1 item");
    expect(wrapper.text()).not.toContain("1 items");
    expect(wrapper.findComponent({ name: "PrivateBadge" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "EntityAvatar" }).props("isOrg")).toBe(
      true,
    );
  });

  it("asks for the canonical address when it was opened by another one", async () => {
    mocks.route.path = "/collections/alice/iccv"; // the short form
    await mountPage();
    expect(mocks.router.replace).toHaveBeenCalledWith(`/collections/${SLUG}`);
  });

  it("shows nothing to change to someone who may not, and the controls to the owner and to an organization member", async () => {
    mocks.auth.isAuthenticated = false;
    expect(button(await mountPage(), "Add to the collection")).toBeUndefined();
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "mika";
    expect(button(await mountPage(), "Edit")).toBeUndefined();
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "member" }];
    expect(
      button(
        await mountPage(COLLECTION({ owner: { name: "lab", type: "org" } })),
        "Edit",
      ),
    ).toBeDefined();
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "visitor" }];
    expect(
      button(
        await mountPage(COLLECTION({ owner: { name: "lab", type: "org" } })),
        "Edit",
      ),
    ).toBeUndefined();
    mocks.auth.username = "alice";
    mocks.auth.organizations = [];
    expect(button(await mountPage(), "Edit")).toBeDefined();
  });

  it("explains an empty collection, to the owner and to a visitor", async () => {
    const owner = await mountPage(COLLECTION({ items: [] }));
    expect(owner.text()).toContain("Nothing here yet.");
    expect(owner.text()).toContain('Use "Add to the collection"');
    mocks.auth.isAuthenticated = false;
    const visitor = await mountPage(COLLECTION({ items: [] }));
    expect(visitor.text()).toContain("Nothing here yet.");
    expect(visitor.text()).not.toContain("Use");
  });

  it("shows the error with a retry, and nothing while it loads", async () => {
    mocks.api.get.mockRejectedValueOnce(new Error("Collection not found"));
    const wrapper = mount(CollectionPage, { global: { stubs } });
    expect(
      wrapper.find(".el-skeleton, [data-el-skeleton]").exists() ||
        wrapper.html().includes("skeleton"),
    ).toBeTruthy();
    await flushPromises();
    expect(wrapper.find("[data-error]").text()).toContain(
      "Collection not found",
    );
    mocks.api.get.mockResolvedValue({ data: COLLECTION() });
    await wrapper.find("[data-retry]").trigger("click");
    await flushPromises();
    expect(wrapper.find("h1").text()).toContain("ICCV 2026");
  });

  it("loads again when the address changes", async () => {
    const route = reactive({ ...mocks.route });
    mocks.route = route;
    const wrapper = await mountPage();
    mocks.api.get.mockClear();
    route.params = { owner: "alice", slug: "other-6ae8b2220654892215f0a71d" };
    await flushPromises();
    expect(mocks.api.get).toHaveBeenCalledWith(
      "alice/other-6ae8b2220654892215f0a71d",
    );
    wrapper.unmount();
    mocks.route = { ...route };
  });
});

describe("upvoting and sharing", () => {
  it("upvotes and takes the upvote back, with the count the server answers", async () => {
    const wrapper = await mountPage();
    mocks.api.upvote.mockResolvedValue({ data: { upvotes: 3 } });
    await button(wrapper, "Upvote").trigger("click");
    await flushPromises();
    expect(mocks.api.upvote).toHaveBeenCalledWith(SLUG);
    expect(button(wrapper, "Upvoted").text()).toContain("3");
    mocks.api.removeUpvote.mockResolvedValue({ data: { upvotes: 2 } });
    await button(wrapper, "Upvoted").trigger("click");
    await flushPromises();
    expect(mocks.api.removeUpvote).toHaveBeenCalledWith(SLUG);
    expect(button(wrapper, "Upvote").text()).toContain("2");
  });

  it("sends a signed-out visitor to sign in, and comes back here", async () => {
    mocks.auth.isAuthenticated = false;
    const wrapper = await mountPage();
    await button(wrapper, "Upvote").trigger("click");
    expect(mocks.router.push).toHaveBeenCalledWith({
      path: "/login",
      query: { redirect: mocks.route.fullPath },
    });
    expect(mocks.api.upvote).not.toHaveBeenCalled();
  });

  it("says when the upvote did not go through", async () => {
    const wrapper = await mountPage();
    mocks.api.upvote.mockRejectedValue({
      response: { data: { error: "Collection not found" } },
    });
    await button(wrapper, "Upvote").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Collection not found");
    mocks.api.upvote.mockRejectedValue({ appError: { message: "offline" } });
    await button(wrapper, "Upvote").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenLastCalledWith("offline");
    mocks.api.upvote.mockRejectedValue({});
    await button(wrapper, "Upvote").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenLastCalledWith("Something went wrong");
  });

  it("copies the link, or shows it when the clipboard is not there", async () => {
    const wrapper = await mountPage();
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await button(wrapper, "Share").trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/collections/${SLUG}`,
    );
    expect(mocks.success).toHaveBeenCalledWith("Link copied");
    writeText.mockRejectedValue(new Error("denied"));
    await button(wrapper, "Share").trigger("click");
    await flushPromises();
    expect(mocks.info).toHaveBeenCalledWith(
      `${window.location.origin}/collections/${SLUG}`,
    );
  });
});

describe("changing the collection", () => {
  it("opens the dialogs for editing and for adding", async () => {
    const wrapper = await mountPage();
    await button(wrapper, "Edit").trigger("click");
    expect(
      wrapper
        .findComponent({ name: "CollectionFormDialog" })
        .props("modelValue"),
    ).toBe(true);
    await button(wrapper, "Add to the collection").trigger("click");
    expect(
      wrapper.findComponent({ name: "AddItemDialog" }).props("modelValue"),
    ).toBe(true);
  });

  it("reloads after an item is added, and after an edit lands on the address of the new slug", async () => {
    const wrapper = await mountPage();
    mocks.api.get.mockClear();
    wrapper.findComponent({ name: "AddItemDialog" }).vm.$emit("added");
    await flushPromises();
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
    mocks.api.get.mockResolvedValue({
      data: COLLECTION({
        slug: "alice/renamed-6ae8b2220654892215f0a71c",
        title: "Renamed",
      }),
    });
    wrapper.findComponent({ name: "CollectionFormDialog" }).vm.$emit("saved");
    await flushPromises();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/collections/alice/renamed-6ae8b2220654892215f0a71c",
    );
  });

  it("deletes the collection after a confirmation, and goes to the list of its owner", async () => {
    mocks.confirm.mockResolvedValue();
    mocks.api.remove.mockResolvedValue({});
    const wrapper = await mountPage();
    await button(wrapper, "Delete").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.confirm.mock.calls[0][0]).toContain("ICCV 2026");
    expect(mocks.api.remove).toHaveBeenCalledWith(SLUG);
    expect(mocks.success).toHaveBeenCalledWith("Collection deleted");
    expect(mocks.router.push).toHaveBeenCalledWith("/alice/collections");
  });

  it("deletes nothing when the confirmation is refused, and says when the deletion fails", async () => {
    const wrapper = await mountPage();
    mocks.confirm.mockRejectedValueOnce("cancel");
    await button(wrapper, "Delete").trigger("click");
    await flushPromises();
    expect(mocks.api.remove).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue();
    mocks.api.remove.mockRejectedValue({
      response: {
        data: { error: "You don't have permission to edit this collection" },
      },
    });
    await button(wrapper, "Delete").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith(
      "You don't have permission to edit this collection",
    );
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("removes an item from the page once the server has, and says when it could not", async () => {
    mocks.api.removeItem.mockResolvedValueOnce({});
    const wrapper = await mountPage();
    await wrapper
      .findAll('button[aria-label="Remove from the collection"]')[1]
      .trigger("click");
    await flushPromises();
    expect(mocks.api.removeItem).toHaveBeenCalledWith(SLUG, "2".repeat(24));
    expect(wrapper.findAll(".item-card")).toHaveLength(2);
    mocks.api.removeItem.mockRejectedValueOnce({});
    await wrapper
      .findAll('button[aria-label="Remove from the collection"]')[0]
      .trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Something went wrong");
    expect(wrapper.findAll(".item-card")).toHaveLength(2);
  });
});

describe("notes", () => {
  it("edits a note in a dialog, saves it and reloads", async () => {
    const wrapper = await mountPage(
      COLLECTION({
        items: [ITEM(1, { note: { text: "old", html: "old" } }), ITEM(2)],
      }),
    );
    await wrapper
      .findAll('button[aria-label="Edit the note"]')[0]
      .trigger("click");
    const box = wrapper.find("[data-el-dialog='Note'] textarea");
    expect(box.element.value).toBe("old");
    await box.setValue("new note");
    mocks.api.updateItem.mockResolvedValue({});
    mocks.api.get.mockClear();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(mocks.api.updateItem).toHaveBeenCalledWith(SLUG, "1".repeat(24), {
      note: "new note",
    });
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
    expect(wrapper.find("[data-el-dialog='Note']").exists()).toBe(false);
  });

  it("starts an empty note for an item without one, cancels, and says when saving failed", async () => {
    const wrapper = await mountPage();
    await wrapper
      .findAll('button[aria-label="Edit the note"]')[1]
      .trigger("click");
    expect(wrapper.find("[data-el-dialog='Note'] textarea").element.value).toBe(
      "",
    );
    await button(wrapper, "Cancel").trigger("click");
    expect(wrapper.find("[data-el-dialog='Note']").exists()).toBe(false);
    await wrapper
      .findAll('button[aria-label="Edit the note"]')[1]
      .trigger("click");
    mocks.api.updateItem.mockRejectedValueOnce({
      response: { data: { error: "note must be at most 500 characters" } },
    });
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith(
      "note must be at most 500 characters",
    );
    expect(wrapper.find("[data-el-dialog='Note']").exists()).toBe(true);
    wrapper
      .findComponent({ name: "ElDialog" })
      .vm.$emit("update:modelValue", false);
  });
});

describe("moving cards", () => {
  const order = (wrapper) =>
    wrapper.findAll(".item-card h3").map((h) => h.text());

  it("moves a card with the buttons: later, earlier, and not past either end", async () => {
    const wrapper = await mountPage();
    const downs = () => wrapper.findAll('button[aria-label="Move later"]');
    const ups = () => wrapper.findAll('button[aria-label="Move earlier"]');
    expect(ups()[0].attributes("disabled")).toBeDefined();
    expect(downs()[2].attributes("disabled")).toBeDefined();
    await downs()[0].trigger("click");
    expect(order(wrapper)).toEqual(["alice/m2", "alice/m1", "alice/m3"]);
    expect(mocks.api.updateItem).toHaveBeenLastCalledWith(
      SLUG,
      "1".repeat(24),
      { position: 1 },
    );
    await ups()[2].trigger("click");
    expect(order(wrapper)).toEqual(["alice/m2", "alice/m3", "alice/m1"]);
    expect(mocks.api.updateItem).toHaveBeenLastCalledWith(
      SLUG,
      "3".repeat(24),
      { position: 1 },
    );
  });

  it("moves a card by dropping it on another, and does nothing when it is dropped on itself or on nothing", async () => {
    const wrapper = await mountPage();
    const cells = () => wrapper.findAll("[draggable='true']");
    await cells()[2].trigger("dragstart");
    await cells()[0].trigger("drop");
    expect(order(wrapper)).toEqual(["alice/m3", "alice/m1", "alice/m2"]);
    expect(mocks.api.updateItem).toHaveBeenLastCalledWith(
      SLUG,
      "3".repeat(24),
      { position: 0 },
    );
    mocks.api.updateItem.mockClear();
    await cells()[1].trigger("dragstart");
    await cells()[1].trigger("drop"); // onto itself
    await cells()[0].trigger("drop"); // no drag in progress
    await cells()[1].trigger("dragstart");
    await cells()[1].trigger("dragend");
    await cells()[0].trigger("drop"); // the drag ended elsewhere
    await cells()[0].trigger("dragover");
    expect(mocks.api.updateItem).not.toHaveBeenCalled();
  });

  it("puts the page right again from the server when a move was refused", async () => {
    const wrapper = await mountPage();
    mocks.api.updateItem.mockRejectedValueOnce({
      response: { data: { error: "no" } },
    });
    mocks.api.get.mockClear();
    await wrapper
      .findAll('button[aria-label="Move later"]')[0]
      .trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("no");
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
    expect(order(wrapper)).toEqual(["alice/m1", "alice/m2", "alice/m3"]);
  });

  it("does not make the cards draggable for someone who may not change them", async () => {
    mocks.auth.isAuthenticated = false;
    const wrapper = await mountPage();
    expect(wrapper.findAll("[draggable='true']")).toHaveLength(0);
  });
});
