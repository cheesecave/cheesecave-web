import { describe, expect, it } from "vitest";
import {
  COLLECTION_THEMES,
  DESCRIPTION_MAX,
  ITEM_ICONS,
  NOTE_MAX,
  TITLE_MAX,
  canWriteFor,
  collectionPath,
  itemPath,
  linkify,
  themeColor,
  writableOwners,
} from "@/utils/collections";

describe("collection constants", () => {
  it("has the six colours and the limits Hugging Face has", () => {
    expect(Object.keys(COLLECTION_THEMES)).toEqual([
      "orange",
      "blue",
      "green",
      "purple",
      "pink",
      "indigo",
    ]);
    expect([TITLE_MAX, DESCRIPTION_MAX, NOTE_MAX]).toEqual([60, 150, 500]);
    expect(Object.keys(ITEM_ICONS)).toEqual([
      "model",
      "dataset",
      "space",
      "collection",
    ]);
  });

  it("gives a colour for a theme and green for an unknown or missing one", () => {
    expect(themeColor("pink")).toBe(COLLECTION_THEMES.pink);
    expect(themeColor("nope")).toBe(COLLECTION_THEMES.green);
    expect(themeColor(undefined)).toBe(COLLECTION_THEMES.green);
  });
});

describe("addresses", () => {
  it("builds the page of a collection from its slug, one segment each", () => {
    expect(collectionPath("alice/iccv-2026-6ae8b2220654892215f0a71c")).toBe(
      "/collections/alice/iccv-2026-6ae8b2220654892215f0a71c",
    );
    expect(collectionPath("al ice/a b")).toBe("/collections/al%20ice/a%20b");
  });

  it("leads a repository item to its repository and a collection item to its collection", () => {
    expect(itemPath({ type: "model", id: "alice/tagger" })).toBe(
      "/models/alice/tagger",
    );
    expect(itemPath({ type: "space", id: "alice/demo" })).toBe(
      "/spaces/alice/demo",
    );
    expect(
      itemPath({
        type: "collection",
        slug: "alice/x-0123456789abcdef01234567",
      }),
    ).toBe("/collections/alice/x-0123456789abcdef01234567");
  });
});

describe("linkify", () => {
  it("turns web addresses into links and leaves everything else as text", () => {
    expect(linkify("see https://example.org/a?b=1 and http://x.y now")).toEqual(
      [
        { text: "see " },
        {
          text: "https://example.org/a?b=1",
          href: "https://example.org/a?b=1",
        },
        { text: " and " },
        { text: "http://x.y", href: "http://x.y" },
        { text: " now" },
      ],
    );
  });

  it("handles text with no address, an address alone and an address at either end", () => {
    expect(linkify("plain <b>text</b>")).toEqual([
      { text: "plain <b>text</b>" },
    ]);
    expect(linkify("https://a.b")).toEqual([
      { text: "https://a.b", href: "https://a.b" },
    ]);
    expect(linkify("https://a.b end")).toEqual([
      { text: "https://a.b", href: "https://a.b" },
      { text: " end" },
    ]);
    expect(linkify("")).toEqual([]);
  });

  it("does not make a link of anything but http and https", () => {
    expect(linkify("javascript:alert(1)")).toEqual([
      { text: "javascript:alert(1)" },
    ]);
  });
});

describe("who may put collections where", () => {
  const signedIn = (organizations) => ({
    isAuthenticated: true,
    username: "alice",
    organizations,
  });

  it("is nobody when signed out", () => {
    expect(writableOwners({ isAuthenticated: false })).toEqual([]);
    expect(canWriteFor({ isAuthenticated: false }, "alice")).toBe(false);
  });

  it("is the user and the organizations where they are more than a visitor", () => {
    const auth = signedIn([
      { name: "lab", roleInOrg: "member" },
      { name: "club", roleInOrg: "visitor" },
      { name: "board", roleInOrg: "admin" },
    ]);
    expect(writableOwners(auth)).toEqual(["alice", "lab", "board"]);
    expect(canWriteFor(auth, "lab")).toBe(true);
    expect(canWriteFor(auth, "club")).toBe(false);
    expect(canWriteFor(auth, "alice")).toBe(true);
    expect(canWriteFor(auth, "someone")).toBe(false);
  });

  it("copes with a user whose organizations are not loaded", () => {
    expect(
      writableOwners({ isAuthenticated: true, username: "alice" }),
    ).toEqual(["alice"]);
  });
});
