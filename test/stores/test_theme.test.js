import { createPinia, disposePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/theme";
import { DEFAULT_THEME } from "../../src/shared/site-appearance.js";
import {
  contrastRatio,
  contrastText,
  createThemePalette,
} from "../../src/shared/site-theme.js";

let pinia;
let listener;
let media;
describe("theme store", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    listener = undefined;
    media = {
      matches: false,
      addEventListener: vi.fn((event, callback) => {
        listener = callback;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
  });
  afterEach(() => {
    disposePinia(pinia);
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-site-theme");
  });

  it("initializes the persisted mode before applying site defaults", () => {
    localStorage.setItem("theme", "light");
    const store = useThemeStore();
    store.setSiteTheme({ default_mode: "dark" });
    store.init();
    expect(store.isDark).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });
  it("initializes persisted dark mode and toggles while remembering manual choices", () => {
    localStorage.setItem("theme", "dark");
    const store = useThemeStore();
    store.init();
    expect(store.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    store.toggle();
    expect(localStorage.getItem("theme")).toBe("light");
    store.setTheme(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });
  it("follows site defaults without converting them into a manual preference", () => {
    const store = useThemeStore();
    store.init();
    store.setSiteTheme({ default_mode: "dark" });
    expect(store.isDark).toBe(true);
    expect(localStorage.getItem("theme")).toBeNull();
    store.setSiteTheme({ default_mode: "light" });
    expect(store.isDark).toBe(false);
  });
  it("follows system changes until the user explicitly chooses a mode", () => {
    media.matches = true;
    const store = useThemeStore();
    store.init();
    expect(store.isDark).toBe(true);
    listener({ matches: false });
    expect(store.isDark).toBe(false);
    store.setTheme(true);
    listener({ matches: false });
    expect(store.isDark).toBe(true);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    store.init();
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
  });
  it("ignores system changes for fixed site defaults and honors preference removal", () => {
    const store = useThemeStore();
    store.setSiteTheme({ default_mode: "dark" });
    store.init();
    listener({ matches: false });
    expect(store.isDark).toBe(true);
    store.setTheme(false);
    localStorage.removeItem("theme");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", newValue: null }),
    );
    expect(store.isDark).toBe(true);
  });
  it("applies the matching primary, page and card palette with accessible button text", () => {
    const store = useThemeStore();
    store.setSiteTheme({
      ...DEFAULT_THEME,
      primary_light: "#ffffff",
      background_light: "#000000",
      card_light: "#ffffff",
      primary_dark: "#000000",
    });
    const styles = document.documentElement.style;
    expect(styles.getPropertyValue("--site-primary")).toBe("#ffffff");
    expect(styles.getPropertyValue("--site-bg")).toBe("#000000");
    expect(styles.getPropertyValue("--site-card")).toBe("#ffffff");
    expect(
      contrastRatio(
        styles.getPropertyValue("--site-primary"),
        styles.getPropertyValue("--site-primary-text"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(
        styles.getPropertyValue("--site-link"),
        styles.getPropertyValue("--site-card"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    store.setTheme(true);
    expect(styles.getPropertyValue("--site-primary")).toBe("#000000");
    expect(styles.getPropertyValue("--site-primary-text")).toBe("#eef0e7");
  });
  it.each(["light", "dark"])(
    "applies the bundled warm %s palette to UI, controls and illustrations",
    (mode) => {
      const store = useThemeStore();
      store.setTheme(mode === "dark");
      const palette = createThemePalette({
        primary: DEFAULT_THEME[`primary_${mode}`],
        background: DEFAULT_THEME[`background_${mode}`],
        card: DEFAULT_THEME[`card_${mode}`],
      });
      const styles = document.documentElement.style;
      expect(styles.getPropertyValue("--site-text")).toBe(palette.text);
      expect(styles.getPropertyValue("--site-card-text")).toBe(
        palette.cardText,
      );
      expect(styles.getPropertyValue("--site-primary-text")).toBe(
        palette.buttonText,
      );
      expect(styles.getPropertyValue("--el-color-primary")).toBe(
        DEFAULT_THEME[`primary_${mode}`],
      );
      expect(styles.getPropertyValue("--el-bg-color")).toBe(
        DEFAULT_THEME[`card_${mode}`],
      );
      expect(styles.getPropertyValue("--site-illustration-bg")).toBe(
        palette.illustrationBg,
      );
      expect(styles.getPropertyValue("--site-illustration-ring")).toBe(
        palette.illustrationRing,
      );
      expect(styles.getPropertyValue("--site-illustration-border")).toBe(
        palette.illustrationBorder,
      );
    },
  );
  it.each(["#ffffff", "#ffff00", "#7f7f7f", "#000000", "#2563eb"])(
    "chooses readable foreground for %s",
    (color) => {
      expect(contrastRatio(color, contrastText(color))).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );
  it("keeps working when storage is unavailable and removes listeners on disposal", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = useThemeStore();
    store.init();
    expect(() => store.toggle()).not.toThrow();
    expect(store.isDark).toBe(true);
    store.$dispose();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
