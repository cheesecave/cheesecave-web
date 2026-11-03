import { reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: { params: { username: "alice" }, query: {} },
  router: { push: vi.fn(), replace: vi.fn() },
  api: { list: vi.fn() },
  auth: { isAuthenticated: true, username: "alice", organizations: [] },
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

import CollectionsIndex from "@/pages/collections/index.vue";
import OwnerCollections from "@/pages/[username]/collections.vue";

const COL = (n, extra = {}) => ({
  slug: `alice/c${n}-${String(n).repeat(24)}`,
  title: `Collection ${n}`,
  theme: "green",
  private: false,
  upvotes: n,
  lastUpdated: "2026-10-01T12:00:00.000Z",
  owner: { name: "alice", type: "user" },
  items: [],
  ...extra,
});
const stubs = {
  ...ElementPlusStubs,
  RouterLink: RouterLinkStub,
  CollectionCard: {
    props: { collection: Object, showOwner: Boolean },
    template:
      "<div data-card :data-owner=\"showOwner ? 'yes' : 'no'\">{{ collection.title }}</div>",
  },
  CollectionFormDialog: true,
  ErrorState: {
    props: ["error", "retry"],
    template:
      '<div data-error="true"><button data-retry @click="retry">retry</button></div>',
  },
  EntityAvatar: true,
};
const respond = (data, link) => ({ data, headers: link ? { link } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route = reactive({ params: { username: "alice" }, query: {} });
  mocks.auth.isAuthenticated = true;
  mocks.auth.username = "alice";
  mocks.auth.organizations = [];
  mocks.api.list.mockResolvedValue(respond([COL(1), COL(2)]));
});

describe("the page of all collections", () => {
  const open = async () => {
    const wrapper = mount(CollectionsIndex, { global: { stubs } });
    await flushPromises();
    return wrapper;
  };

  it("lists collections with their owners, trending first, twelve at a time", async () => {
    const wrapper = await open();
    expect(mocks.api.list).toHaveBeenCalledWith({
      sort: "trending",
      q: undefined,
      limit: 12,
      cursor: undefined,
    });
    const cards = wrapper.findAll("[data-card]");
    expect(cards.map((c) => c.text())).toEqual([
      "Collection 1",
      "Collection 2",
    ]);
    expect(cards[0].attributes("data-owner")).toBe("yes");
    expect(wrapper.text()).not.toContain("Load more");
  });

  it("says so when nothing matches", async () => {
    mocks.api.list.mockResolvedValue(respond([]));
    expect((await open()).text()).toContain("No collection matches.");
  });

  it("takes the sort and the search from the address", async () => {
    mocks.route.query = { sort: "upvotes", q: "vision" };
    const wrapper = await open();
    expect(mocks.api.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "upvotes", q: "vision" }),
    );
    expect(wrapper.find("input").element.value).toBe("vision");
  });

  it("falls back to trending for a sort it does not know, and ignores a search that is not text", async () => {
    mocks.route.query = { sort: "newest", q: ["a", "b"] };
    const wrapper = await open();
    expect(mocks.api.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "trending" }),
    );
    expect(wrapper.find("input").element.value).toBe("");
  });

  it("changes the address when the sort or the search changes, and loads again when it has", async () => {
    const wrapper = await open();
    wrapper
      .findComponent({ name: "ElRadioGroup" })
      .vm.$emit("update:modelValue", "lastModified");
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: "/collections",
      query: { sort: "lastModified" },
    });
    const input = wrapper.find("input");
    await input.setValue("tag");
    await input.trigger("keyup", { key: "Enter" });
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: "/collections",
      query: { q: "tag" },
    });
    wrapper.findComponent({ name: "ElInput" }).vm.$emit("clear");
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: "/collections",
      query: { q: undefined },
    });
    await input.setValue("");
    await input.trigger("keyup", { key: "Enter" });
    expect(mocks.router.replace).toHaveBeenLastCalledWith({
      path: "/collections",
      query: { q: undefined },
    });
    mocks.api.list.mockClear();
    mocks.route.query = { sort: "upvotes" };
    await flushPromises();
    expect(mocks.api.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "upvotes" }),
    );
    mocks.api.list.mockClear();
    mocks.route.query = { sort: "upvotes", q: "x" };
    await flushPromises();
    expect(mocks.api.list).toHaveBeenCalledTimes(1);
  });

  it("loads the next page by the cursor of the Link header, and stops when there is none", async () => {
    mocks.api.list.mockResolvedValueOnce(
      respond(
        [COL(1)],
        '<https://hub.example/api/collections?sort=trending&limit=12&cursor=abc123>; rel="next"',
      ),
    );
    const wrapper = await open();
    const more = wrapper
      .findAll("button")
      .find((b) => b.text() === "Load more");
    mocks.api.list.mockResolvedValueOnce(respond([COL(2)]));
    await more.trigger("click");
    await flushPromises();
    expect(mocks.api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "abc123" }),
    );
    expect(wrapper.findAll("[data-card]").map((c) => c.text())).toEqual([
      "Collection 1",
      "Collection 2",
    ]);
    expect(
      wrapper.findAll("button").find((b) => b.text() === "Load more"),
    ).toBeUndefined();
  });

  it("shows the error and retries", async () => {
    mocks.api.list.mockRejectedValueOnce(new Error("down"));
    const wrapper = await open();
    expect(wrapper.find("[data-error]").exists()).toBe(true);
    await wrapper.find("[data-retry]").trigger("click");
    await flushPromises();
    expect(wrapper.findAll("[data-card]")).toHaveLength(2);
  });

  it("offers a new collection only to a signed-in user, and opens the new collection when it is made", async () => {
    mocks.auth.isAuthenticated = false;
    expect(
      (await open())
        .findAll("button")
        .find((b) => b.text().includes("New collection")),
    ).toBeUndefined();
    mocks.auth.isAuthenticated = true;
    const wrapper = await open();
    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("New collection"))
      .trigger("click");
    const dialog = wrapper.findComponent({ name: "CollectionFormDialog" });
    expect(dialog.props("modelValue")).toBe(true);
    dialog.vm.$emit("saved", { slug: "alice/new-0123456789abcdef01234567" });
    expect(mocks.router.push).toHaveBeenCalledWith(
      "/collections/alice/new-0123456789abcdef01234567",
    );
  });
});

describe("the new collection asked for by the address (the menus of the header and of the sidebar)", () => {
  const open = async () => {
    const wrapper = mount(CollectionsIndex, { global: { stubs } });
    await flushPromises();
    return wrapper;
  };
  const dialogOf = (wrapper) =>
    wrapper.findComponent({ name: "CollectionFormDialog" });

  it("opens the new collection and takes the mark out of the address, keeping the rest of it", async () => {
    mocks.route.query = { new: "1", sort: "upvotes" };
    const wrapper = await open();
    expect(dialogOf(wrapper).props("modelValue")).toBe(true);
    expect(mocks.router.replace).toHaveBeenCalledWith({
      path: "/collections",
      query: { sort: "upvotes" },
    });
  });

  it("opens it when the address changes while the page is already there", async () => {
    const wrapper = await open();
    expect(dialogOf(wrapper).props("modelValue")).toBe(false);
    mocks.route.query = { new: "1" };
    await flushPromises();
    expect(dialogOf(wrapper).props("modelValue")).toBe(true);
  });

  it("opens nothing for someone who is not signed in, and leaves the address alone", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.route.query = { new: "1" };
    const wrapper = await open();
    expect(dialogOf(wrapper).props("modelValue")).toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});

describe("the collections of one owner", () => {
  const open = async () => {
    const wrapper = mount(OwnerCollections, { global: { stubs } });
    await flushPromises();
    return wrapper;
  };

  it("asks for the owner's own order, and shows the cards and a way back to the profile", async () => {
    const wrapper = await open();
    expect(mocks.api.list).toHaveBeenCalledWith({
      owner: "alice",
      sort: "position",
      limit: 100,
    });
    expect(wrapper.findAll("[data-card]")).toHaveLength(2);
    expect(wrapper.findAll("[data-card]")[0].attributes("data-owner")).toBe(
      "no",
    );
    expect(
      wrapper
        .findAllComponents(RouterLinkStub)
        .find((l) => l.props("to") === "/alice"),
    ).toBeDefined();
  });

  it("offers a new collection to the owner and to a member of the organization, not to others", async () => {
    const make = () =>
      open().then((w) =>
        w.findAll("button").find((b) => b.text().includes("New collection")),
      );
    expect(await make()).toBeDefined();
    mocks.route.params.username = "lab";
    expect(await make()).toBeUndefined();
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "admin" }];
    expect(await make()).toBeDefined();
    mocks.auth.organizations = [{ name: "lab", roleInOrg: "visitor" }];
    expect(await make()).toBeUndefined();
    mocks.auth.isAuthenticated = false;
    mocks.route.params.username = "alice";
    expect(await make()).toBeUndefined();
  });

  it("says when there is nothing, shows the error with a retry, and loads again for another owner", async () => {
    mocks.api.list.mockResolvedValueOnce(respond([]));
    const wrapper = await open();
    expect(wrapper.text()).toContain("No collections yet.");
    mocks.api.list.mockRejectedValueOnce(new Error("down"));
    mocks.route.params = { username: "lab" };
    await flushPromises();
    expect(mocks.api.list).toHaveBeenLastCalledWith({
      owner: "lab",
      sort: "position",
      limit: 100,
    });
    expect(wrapper.find("[data-error]").exists()).toBe(true);
    await wrapper.find("[data-retry]").trigger("click");
    await flushPromises();
    expect(wrapper.findAll("[data-card]")).toHaveLength(2);
  });

  it("opens a new collection once it is made", async () => {
    const wrapper = await open();
    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("New collection"))
      .trigger("click");
    wrapper
      .findComponent({ name: "CollectionFormDialog" })
      .vm.$emit("saved", { slug: "alice/z-0123456789abcdef01234567" });
    expect(mocks.router.push).toHaveBeenCalledWith(
      "/collections/alice/z-0123456789abcdef01234567",
    );
  });
});
