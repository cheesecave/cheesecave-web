import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { RouterLinkStub } from "../helpers/vue";
import CollectionCard from "@/components/collections/CollectionCard.vue";
import CollectionItemCard from "@/components/collections/CollectionItemCard.vue";

const OWNER = { name: "alice", type: "user" };
const SLUG = "alice/iccv-6ae8b2220654892215f0a71c";
const item = (overrides = {}) => ({
  _id: "i".repeat(24),
  type: "model",
  id: "alice/tagger",
  position: 0,
  private: false,
  likes: 7,
  downloads: 1234,
  lastModified: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

const global = {
  stubs: { RouterLink: RouterLinkStub, EntityAvatar: true, PrivateBadge: true },
};

describe("CollectionCard", () => {
  const collection = (overrides = {}) => ({
    slug: SLUG,
    title: "ICCV 2026",
    description: "Models and data",
    theme: "orange",
    private: false,
    upvotes: 3,
    lastUpdated: "2026-10-01T12:00:00.000Z",
    owner: OWNER,
    items: [
      item(),
      item({ _id: "2".repeat(24), type: "dataset", id: "alice/faces" }),
    ],
    ...overrides,
  });
  const card = (props) => mount(CollectionCard, { props, global });

  it("links its title to the collection and shows the description, the first items and the numbers", () => {
    const wrapper = card({ collection: collection() });
    expect(wrapper.findComponent(RouterLinkStub).props("to")).toBe(
      `/collections/${SLUG}`,
    );
    expect(wrapper.text()).toContain("ICCV 2026");
    expect(wrapper.text()).toContain("Models and data");
    expect(
      wrapper.findAll(".collection-preview li").map((li) => li.text()),
    ).toEqual(["alice/tagger", "alice/faces"]);
    expect(wrapper.text()).toContain("3");
    expect(wrapper.attributes("style")).toContain("--theme: #f97316");
    expect(wrapper.findComponent({ name: "PrivateBadge" }).exists()).toBe(
      false,
    );
  });

  it("names a collection item by its title, and says there is more after three items", () => {
    const wrapper = card({
      collection: collection({
        items: [
          item(),
          item({ _id: "a".repeat(24) }),
          item({ _id: "b".repeat(24) }),
          {
            _id: "c".repeat(24),
            type: "collection",
            title: "Nested",
            slug: "alice/n-0123456789abcdef01234567",
          },
        ],
      }),
    });
    const rows = wrapper
      .findAll(".collection-preview li")
      .map((li) => li.text());
    expect(rows).toEqual([
      "alice/tagger",
      "alice/tagger",
      "alice/tagger",
      "and more",
    ]);
    const nested = card({
      collection: collection({
        items: [
          {
            _id: "c".repeat(24),
            type: "collection",
            title: "Nested",
            slug: "x/y",
          },
        ],
      }),
    });
    expect(nested.find(".collection-preview li").text()).toBe("Nested");
  });

  it("says so when there is nothing in it, without description, and marks a private one", () => {
    const wrapper = card({
      collection: collection({
        items: [],
        description: undefined,
        private: true,
      }),
    });
    expect(wrapper.text()).toContain("No items yet");
    expect(wrapper.find("p").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "PrivateBadge" }).exists()).toBe(true);
  });

  it("shows the owner only when asked to", () => {
    expect(
      card({ collection: collection() })
        .findComponent({ name: "EntityAvatar" })
        .exists(),
    ).toBe(false);
    const withOwner = card({
      collection: collection({ owner: { name: "lab", type: "org" } }),
      showOwner: true,
    });
    expect(
      withOwner.findComponent({ name: "EntityAvatar" }).props("isOrg"),
    ).toBe(true);
    expect(withOwner.text()).toContain("lab");
  });
});

describe("CollectionItemCard", () => {
  const card = (props) => mount(CollectionItemCard, { props, global });

  it("shows a model with its numbers, its pipeline and a link to its page", () => {
    const wrapper = card({
      item: item({ pipeline_tag: "image-classification" }),
    });
    expect(wrapper.findComponent(RouterLinkStub).props("to")).toBe(
      "/models/alice/tagger",
    );
    const text = wrapper.text();
    expect(text).toContain("alice/tagger");
    expect(text).toContain("image-classification");
    expect(text).toContain("1,234 downloads");
    expect(text).toContain("7 likes");
  });

  it("shows a dataset's downloads, a Space with its sdk and without downloads, and a private marker", () => {
    expect(
      card({ item: item({ type: "dataset", id: "a/d" }) }).text(),
    ).toContain("1,234 downloads");
    const space = card({
      item: item({
        type: "space",
        id: "a/s",
        downloads: undefined,
        sdk: "gradio",
        private: true,
      }),
    });
    expect(space.text()).toContain("gradio");
    expect(space.text()).not.toContain("downloads");
    expect(space.findComponent(RouterLinkStub).props("to")).toBe("/spaces/a/s");
    expect(space.findComponent({ name: "PrivateBadge" }).exists()).toBe(true);
    const plain = card({
      item: item({ type: "space", id: "a/s", downloads: undefined }),
    });
    expect(plain.text()).not.toContain("gradio");
  });

  it("shows another collection as a reference card with its owner, size, upvotes and description", () => {
    const child = {
      _id: "c".repeat(24),
      type: "collection",
      slug: "lab/tools-0123456789abcdef01234567",
      title: "Tools",
      owner: { name: "lab", type: "org" },
      numberItems: 1,
      upvotes: 1,
      description: "Handy ones",
      lastUpdated: "2026-10-01T12:00:00.000Z",
    };
    const wrapper = card({ item: child });
    expect(wrapper.findComponent(RouterLinkStub).props("to")).toBe(
      "/collections/lab/tools-0123456789abcdef01234567",
    );
    expect(wrapper.text()).toContain("Tools");
    expect(wrapper.text()).toContain("lab");
    expect(wrapper.text()).toContain("1 item");
    expect(wrapper.text()).not.toContain("1 items");
    expect(wrapper.text()).toContain("1 upvote");
    expect(wrapper.text()).toContain("Handy ones");
    const many = card({
      item: {
        ...child,
        numberItems: 3,
        upvotes: 0,
        description: undefined,
        lastUpdated: undefined,
      },
    });
    expect(many.text()).toContain("3 items");
    expect(many.text()).toContain("0 upvotes");
    expect(many.text()).not.toContain("Updated");
  });

  it("shows a note as text with its addresses as safe links, and never as HTML", () => {
    const wrapper = card({
      item: item({
        note: {
          text: "see https://example.org <b>x</b>",
          html: "<script>alert(1)</script>",
        },
      }),
    });
    const note = wrapper.find(".item-note");
    expect(note.text()).toBe("see https://example.org <b>x</b>");
    const link = note.find("a");
    expect(link.attributes()).toMatchObject({
      href: "https://example.org",
      target: "_blank",
      rel: "noopener nofollow",
    });
    expect(note.find("script").exists()).toBe(false);
    expect(card({ item: item() }).find(".item-note").exists()).toBe(false);
  });

  it("offers nothing to change unless editable, and then a drag handle and four buttons", async () => {
    expect(card({ item: item() }).find(".item-actions").exists()).toBe(false);
    const wrapper = card({
      item: item(),
      editable: true,
      canMoveUp: true,
      canMoveDown: false,
      dragging: true,
    });
    expect(wrapper.find(".drag-handle").exists()).toBe(true);
    expect(wrapper.classes()).toContain("is-dragging");
    const [up, down, note, remove] = wrapper.findAll(".item-actions button");
    expect(up.attributes("disabled")).toBeUndefined();
    expect(down.attributes("disabled")).toBeDefined();
    await up.trigger("click");
    await down.trigger("click"); // disabled: nothing happens
    await note.trigger("click");
    await remove.trigger("click");
    expect(wrapper.emitted("move")).toEqual([[-1]]);
    expect(wrapper.emitted("edit-note")).toHaveLength(1);
    expect(wrapper.emitted("remove")).toHaveLength(1);
    const lower = card({
      item: item(),
      editable: true,
      canMoveUp: false,
      canMoveDown: true,
    });
    await lower.findAll(".item-actions button")[1].trigger("click");
    expect(lower.emitted("move")).toEqual([[1]]);
  });
});
