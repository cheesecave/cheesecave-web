import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_FOOTER,
  DEFAULT_THEME,
  FOOTER_ATTRIBUTION,
  fetchAppearance,
  isSafeAppearanceUrl,
  normalizeAppearance,
  normalizeFooter,
  normalizeTheme,
  parseCachedAppearance,
  readCachedAppearance,
  saveCachedAppearance,
} from "../../src/shared/site-appearance.js";

afterEach(() => vi.useRealTimers());

describe("site appearance configuration", () => {
  it("supplies independent defaults without exposing mutable default arrays", () => {
    const appearance = normalizeAppearance({});
    expect(appearance).toEqual(DEFAULT_APPEARANCE);
    appearance.footer.groups[0].links[0].label = "My documentation";
    expect(DEFAULT_FOOTER.groups[0].links[0].label).toBe("Documentation");
    expect(normalizeTheme({ primary_light: "#AA00BB" })).toEqual({
      ...DEFAULT_THEME,
      primary_light: "#aa00bb",
    });
  });

  it("preserves hidden link groups and build information", () => {
    expect(normalizeFooter({ groups: [], show_build_info: false })).toEqual({
      ...DEFAULT_FOOTER,
      groups: [],
      show_build_info: false,
    });
  });

  it.each(Object.keys(FOOTER_ATTRIBUTION))(
    "discards legacy attribution overrides from cache and API: %s",
    (key) => {
      const legacy = {
        ...DEFAULT_APPEARANCE,
        footer: { ...DEFAULT_FOOTER, [key]: "override" },
      };
      expect(normalizeAppearance(legacy)).toEqual(DEFAULT_APPEARANCE);
      expect(
        parseCachedAppearance(
          JSON.stringify({ version: 1, appearance: legacy }),
        ),
      ).toEqual(DEFAULT_APPEARANCE);
      expect(Object.isFrozen(FOOTER_ATTRIBUTION)).toBe(true);
    },
  );

  it.each([
    "",
    "/",
    "/docs?topic=setup#install",
    "https://example.com/docs",
    "http://localhost:5173/docs",
  ])("allows safe footer target %s", (url) => {
    expect(isSafeAppearanceUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "//evil.example.com",
    "/\\evil.example.com",
    "https:example.com",
    "https://",
    "https://user:password@example.com",
    "https://user@example.com",
    "https://example.com\n",
    "/docs\t",
    " /docs",
    "https://example.com/with space",
    "/\u0085docs",
    "mailto:hello@example.com",
    "/" + "a".repeat(2048),
    null,
    false,
  ])("rejects unsafe footer target %s", (url) => {
    expect(isSafeAppearanceUrl(url)).toBe(false);
    expect(
      normalizeFooter({
        groups: [{ title: "Links", links: [{ label: "Docs", url }] }],
      }),
    ).toBeNull();
  });

  it.each([
    null,
    [],
    false,
    { show_build_info: "false" },
    { groups: [{ title: "x".repeat(101), links: [] }] },
    {
      groups: [
        { title: "Links", links: [{ label: "x".repeat(101), url: "/docs" }] },
      ],
    },
    { groups: Array(4).fill({ title: "Links", links: [] }) },
    { groups: [{ title: "", links: [] }] },
    { groups: [{ title: "Links", links: null }] },
    {
      groups: [
        {
          title: "Links",
          links: Array(9).fill({ label: "Docs", url: "/docs" }),
        },
      ],
    },
    { groups: [{ title: "Links", links: [{ label: "", url: "/docs" }] }] },
    { groups: [{ title: "Links", links: [{ label: "Docs", url: "" }] }] },
    {
      groups: [
        { title: "Links", links: [{ label: "Docs", url: "//evil.example" }] },
      ],
    },
  ])("rejects malformed footer configuration %j", (footer) => {
    expect(normalizeFooter(footer)).toBeNull();
  });

  it.each([
    null,
    [],
    "theme",
    { default_mode: "forced" },
    { default_mode: null },
    { primary_light: "red" },
    { primary_dark: "#fff" },
    { card_dark: "#123456;background:url(evil)" },
    { background_light: null },
    { card_light: 123456 },
  ])("rejects unsafe theme configuration %j", (theme) => {
    expect(normalizeTheme(theme)).toBeNull();
  });

  it("keeps explicit null invalid and discards unknown configuration fields", () => {
    expect(normalizeAppearance({ footer: null })).toBeNull();
    expect(normalizeAppearance({ theme: null })).toBeNull();
    expect(normalizeTheme({ css: "malicious", default_mode: "dark" })).toEqual({
      ...DEFAULT_THEME,
      default_mode: "dark",
    });
  });

  it("validates browser cache and falls back when storage is unavailable", () => {
    const custom = {
      ...DEFAULT_APPEARANCE,
      theme: { ...DEFAULT_THEME, default_mode: "dark" },
    };
    expect(saveCachedAppearance(custom)).toBe(true);
    expect(readCachedAppearance()).toEqual(custom);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY))).toEqual({
      version: 1,
      appearance: custom,
    });
    expect(parseCachedAppearance("broken json")).toBeNull();
    expect(
      parseCachedAppearance(JSON.stringify({ version: 2, appearance: custom })),
    ).toBeNull();
    expect(saveCachedAppearance({ theme: { primary_light: "unsafe" } })).toBe(
      false,
    );
    expect(readCachedAppearance()).toEqual(custom);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(saveCachedAppearance(custom)).toBe(false);
  });

  it("fetches public appearance without stale HTTP caches", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => DEFAULT_APPEARANCE,
    });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(fetch).toHaveBeenCalledWith(
      "/api/site-appearance",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    { ok: false, headers: new Headers() },
    {
      ok: true,
      headers: new Headers({ "X-Site-Appearance-Fallback": "true" }),
    },
    {
      ok: true,
      headers: new Headers(),
      json: async () => ({ theme: { primary_light: "invalid" } }),
    },
  ])("rejects unavailable or malformed API results", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchAppearance()).rejects.toThrow();
  });

  it("aborts slow API requests so offline rendering can use the cache", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchAppearance()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(3000);
    await result;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
