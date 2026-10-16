// Which README style is in force: the reader's choice, else the site's default, else GitHub's; kept on the server
// with the account, and in the browser for the first paint.

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/utils/api", () => ({ preferencesAPI: api }));
// The site's appearance, as the store sees it: `theme` changes when the admin changes it
vi.mock("@/stores/siteAppearance", async () => {
  const { reactive } = await import("vue");
  const site = reactive({ theme: {} });
  return { useSiteAppearanceStore: () => site, site };
});
import { site } from "@/stores/siteAppearance";

import { useAuthStore } from "@/stores/auth";
import { useMarkdownStyleStore } from "@/stores/markdownStyle";

const flush = () => new Promise((resolve) => setTimeout(resolve));
function setup({ username = null, siteDefault, userInfo = null } = {}) {
  setActivePinia(createPinia());
  site.theme = siteDefault ? { markdown_style: siteDefault } : {};
  const auth = useAuthStore();
  auth.userInfo = userInfo;
  auth.user = username ? { username } : null;
  return { auth, store: useMarkdownStyleStore() };
}

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset().mockResolvedValue({ data: { markdown_style: null } });
  api.update.mockReset().mockResolvedValue({ data: {} });
});

describe("the style in force", () => {
  it("is GitHub's when neither the site nor the reader says", () => {
    expect(setup().store.resolved).toBe("github");
  });

  it("is the site's default for a reader who has not chosen, signed in or not", async () => {
    const { store } = setup({ siteDefault: "vitepress", username: "alice" });
    await flush();
    expect(store.resolved).toBe("vitepress");
    expect(store.source).toBe("site");
    expect(setup({ siteDefault: "vitepress" }).store.resolved).toBe(
      "vitepress",
    );
  });

  it("is the reader's own choice once they have made one, whatever the site says", async () => {
    api.get.mockResolvedValue({ data: { markdown_style: "tufte" } });
    const { store } = setup({ siteDefault: "vitepress", username: "alice" });
    await flush();
    expect(store.resolved).toBe("tufte");
    expect(store.source).toBe("user");
    expect(api.get).toHaveBeenCalledWith("alice");
  });

  it("falls back for an id this build does not have, from the server or the site", async () => {
    api.get.mockResolvedValue({ data: { markdown_style: "from-the-future" } });
    const { store } = setup({ siteDefault: "also-unknown", username: "alice" });
    await flush();
    expect(store.userChoice).toBeNull();
    expect(store.resolved).toBe("github");
  });

  it("follows a change of the site's default for a reader who follows it", async () => {
    const { store } = setup({ siteDefault: "mdn", username: "alice" });
    await flush();
    site.theme = { markdown_style: "rtd" };
    expect(store.resolved).toBe("rtd");
  });
});

describe("the sign-in answer", () => {
  it("carries the choice, so the first paint is right and nothing more is asked", async () => {
    const { store } = setup({
      username: "alice",
      siteDefault: "vitepress",
      userInfo: { preferences: { markdown_style: "docusaurus" } },
    });
    await flush();
    expect(store.resolved).toBe("docusaurus");
    expect(api.get).not.toHaveBeenCalled();
    expect(localStorage.getItem("cheesecave:markdown-style:alice")).toBe(
      "docusaurus",
    );
  });

  it("can say the reader follows the site (null), which is an answer too", async () => {
    const { store } = setup({
      username: "alice",
      userInfo: { preferences: { markdown_style: null } },
    });
    await flush();
    expect(store.userChoice).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("choosing", () => {
  it("shows the choice at once and saves it to the account, and to the browser", async () => {
    const { store } = setup({ username: "alice" });
    await flush();

    const saving = store.choose("hf");
    expect(store.resolved).toBe("hf");
    await saving;

    expect(api.update).toHaveBeenCalledWith("alice", { markdown_style: "hf" });
    expect(localStorage.getItem("cheesecave:markdown-style:alice")).toBe("hf");
  });

  it("goes back to following the site with null, and clears what was saved", async () => {
    const { store } = setup({ username: "alice", siteDefault: "mdn" });
    await store.choose("hf");

    await store.choose(null);

    expect(store.resolved).toBe("mdn");
    expect(api.update).toHaveBeenLastCalledWith("alice", {
      markdown_style: null,
    });
    expect(localStorage.getItem("cheesecave:markdown-style:alice")).toBeNull();
  });

  it("puts the old choice back, and says so, when the server refuses", async () => {
    api.get.mockResolvedValue({ data: { markdown_style: "gitlab" } });
    const { store } = setup({ username: "alice" });
    await flush();
    api.update.mockRejectedValue(new Error("503"));

    await expect(store.choose("tufte")).rejects.toThrow("503");

    expect(store.userChoice).toBe("gitlab");
    expect(localStorage.getItem("cheesecave:markdown-style:alice")).toBe(
      "gitlab",
    );
  });

  it("refuses a style that does not exist, without asking the server", async () => {
    const { store } = setup({ username: "alice" });
    await expect(store.choose("nope")).rejects.toThrow("Unknown style");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("applies for a signed-out reader on this page only, and saves nothing", async () => {
    const { store } = setup();
    await store.choose("prose");
    expect(store.resolved).toBe("prose");
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe("the browser's copy", () => {
  it("paints the remembered choice before the server answers, then takes the server's word", async () => {
    localStorage.setItem("cheesecave:markdown-style:alice", "ghost");
    let answer;
    api.get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { store } = setup({ username: "alice" });
    expect(store.resolved).toBe("ghost");

    answer({ data: { markdown_style: "rtd" } });
    await flush();

    expect(store.resolved).toBe("rtd");
    expect(localStorage.getItem("cheesecave:markdown-style:alice")).toBe("rtd");
  });

  it("keeps the remembered choice when the server cannot be reached", async () => {
    localStorage.setItem("cheesecave:markdown-style:alice", "ghost");
    api.get.mockRejectedValue(new Error("offline"));
    const { store } = setup({ username: "alice" });
    await flush();
    expect(store.resolved).toBe("ghost");
  });

  it("ignores a remembered id that is not a style, and what another account chose", async () => {
    localStorage.setItem("cheesecave:markdown-style:alice", "bogus");
    localStorage.setItem("cheesecave:markdown-style:bob", "tufte");
    const { store } = setup({ username: "alice" });
    expect(store.userChoice).toBeNull();
  });

  it("is dropped when the reader signs out, and read again for the next one", async () => {
    // the server holds each account's choice
    api.get.mockImplementation(async (name) => ({
      data: { markdown_style: name === "bob" ? "tufte" : null },
    }));
    const { auth, store } = setup({ username: "alice" });
    await store.choose("hf");

    auth.user = null;
    await flush();
    expect(store.userChoice).toBeNull();

    auth.user = { username: "bob" };
    await flush();
    expect(store.resolved).toBe("tufte");
  });

  it("works with storage turned off", async () => {
    const { store } = setup({ username: "alice" });
    await flush();
    const denied = () => {
      throw new Error("denied");
    };
    const spies = ["getItem", "setItem", "removeItem"].map((name) =>
      vi.spyOn(Storage.prototype, name).mockImplementation(denied),
    );
    await store.choose("hf");
    expect(store.resolved).toBe("hf");
    await store.choose(null);
    expect(store.userChoice).toBeNull();
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe("a reader who signs out while the answer is on its way", () => {
  it("does not get the previous account's choice", async () => {
    let answer;
    api.get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { auth, store } = setup({ username: "alice" });
    auth.user = null;
    await flush();

    answer({ data: { markdown_style: "tufte" } });
    await flush();

    expect(store.userChoice).toBeNull();
  });
});
