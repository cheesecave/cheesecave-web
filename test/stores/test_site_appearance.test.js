import { createPinia, disposePinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSiteAppearanceStore } from "@/stores/siteAppearance";
import { useThemeStore } from "@/stores/theme";
import {
  CACHE_KEY,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  readCachedAppearance,
  saveCachedAppearance,
} from "../../src/shared/site-appearance.js";

const custom = normalizeAppearance({
  footer: {
    groups: [
      { title: "Explore", links: [{ label: "Our docs", url: "/docs" }] },
    ],
  },
  theme: {
    default_mode: "dark",
    primary_dark: "#cc8844",
    background_dark: "#181818",
    card_dark: "#282828",
  },
});
const response = (value, overrides = {}) => ({
  ok: true,
  headers: new Headers(),
  json: async () => value,
  ...overrides,
});
let pinia;
describe("site appearance resilience", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });
  afterEach(() => {
    disposePinia(pinia);
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-site-theme");
  });

  it("starts synchronously from defaults while an unavailable API stays nonblocking", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const store = useSiteAppearanceStore();
    store.initialize();
    expect(store.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    await flushPromises();
    expect(store.appearance).toEqual(DEFAULT_APPEARANCE);
  });
  it("restores footer and theme cache immediately during an outage", async () => {
    saveCachedAppearance(custom);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const store = useSiteAppearanceStore();
    store.initialize();
    expect(store.footer.groups[0].title).toBe("Explore");
    expect(useThemeStore().isDark).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--site-bg")).toBe(
      "#181818",
    );
    await flushPromises();
    expect(readCachedAppearance()).toEqual(custom);
  });
  it("updates public configuration, cache and theme without replacing a user's preference", async () => {
    localStorage.setItem("theme", "light");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(custom)));
    const store = useSiteAppearanceStore();
    expect(await store.refresh()).toBe(true);
    expect(store.appearance).toEqual(custom);
    expect(readCachedAppearance()).toEqual(custom);
    expect(useThemeStore().isDark).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(fetch).toHaveBeenCalledWith(
      "/api/site-appearance",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each(["API", "cache"])(
    "strips protected credit fields from legacy %s configuration while retaining valid appearance settings",
    async (source) => {
      const legacy = {
        footer: {
          ...custom.footer,
          project_label: "Fake author",
          project_url: "javascript:alert(1)",
          copyright_text: "© Fake author",
          license_label: "No license",
        },
        theme: custom.theme,
      };
      if (source === "cache")
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: 1, appearance: legacy }),
        );
      const store = useSiteAppearanceStore();
      if (source === "API") {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(legacy)));
        expect(await store.refresh()).toBe(true);
      }
      expect(store.appearance).toEqual(custom);
      expect(Object.keys(store.footer)).toEqual(["groups", "show_build_info"]);
      expect(readCachedAppearance()).toEqual(custom);
    },
  );
  it.each([
    response(DEFAULT_APPEARANCE, {
      headers: new Headers({ "X-Site-Appearance-Fallback": "true" }),
    }),
    response({ theme: { primary_light: "red" } }),
    response({}, { ok: false }),
  ])(
    "retains known configuration for failed or invalid API responses",
    async (result) => {
      saveCachedAppearance(custom);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result));
      const store = useSiteAppearanceStore();
      expect(await store.refresh()).toBe(false);
      expect(store.appearance).toEqual(custom);
      expect(readCachedAppearance()).toEqual(custom);
    },
  );
  it("accepts valid changes from another tab and rejects a pending stale response", async () => {
    let resolve;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    const store = useSiteAppearanceStore();
    const dispose = store.initialize();
    const cache = JSON.stringify({ version: 1, appearance: custom });
    window.dispatchEvent(
      new StorageEvent("storage", { key: CACHE_KEY, newValue: cache }),
    );
    expect(store.appearance).toEqual(custom);
    expect(useThemeStore().isDark).toBe(true);
    resolve(response(DEFAULT_APPEARANCE));
    await flushPromises();
    expect(store.appearance).toEqual(custom);
    dispose();
    window.dispatchEvent(
      new StorageEvent("storage", { key: CACHE_KEY, newValue: null }),
    );
    expect(store.appearance).toEqual(custom);
  });
  it("ignores malformed storage and resets to defaults when cache is removed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const store = useSiteAppearanceStore();
    store.initialize();
    store.apply(custom);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: CACHE_KEY,
        newValue: '{"version":1,"appearance":{"theme":{"card_dark":"url(x)"}}}',
      }),
    );
    expect(store.appearance).toEqual(custom);
    window.dispatchEvent(
      new StorageEvent("storage", { key: CACHE_KEY, newValue: null }),
    );
    expect(store.appearance).toEqual(DEFAULT_APPEARANCE);
    await flushPromises();
  });
  it("rejects invalid applies and keeps rendering when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = useSiteAppearanceStore();
    expect(store.apply(custom)).toBe(true);
    expect(
      store.apply({
        footer: {
          groups: [
            {
              title: "Bad",
              links: [{ label: "Bad", url: "javascript:alert(1)" }],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(store.appearance).toEqual(custom);
  });
  it("initializes once and cleans up system listeners on disposal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
    const store = useSiteAppearanceStore();
    const cleanup = store.initialize();
    expect(store.initialize()).toBe(cleanup);
    expect(fetch).toHaveBeenCalledTimes(1);
    store.$dispose();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    await flushPromises();
  });
});
