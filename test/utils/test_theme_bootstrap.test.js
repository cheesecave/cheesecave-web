import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import {
  CACHE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_THEME,
  saveCachedAppearance,
} from "../../src/shared/site-appearance.js";
import { createThemePalette } from "../../src/shared/site-theme.js";

const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const applyFirstPaint = () => new Function(script)();
describe("public app theme first paint", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-site-theme");
  });
  it("applies a cached site's dark palette before the app is loaded", () => {
    saveCachedAppearance({
      theme: {
        default_mode: "dark",
        background_dark: "#123456",
        card_dark: "#223344",
      },
    });
    applyFirstPaint();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--site-bg")).toBe(
      "#123456",
    );
    expect(document.documentElement.style.getPropertyValue("--site-card")).toBe(
      "#223344",
    );
    expect(localStorage.getItem("theme")).toBeNull();
  });
  it("honors explicit light mode over a cached dark default", () => {
    saveCachedAppearance({ theme: { default_mode: "dark" } });
    localStorage.setItem("theme", "light");
    applyFirstPaint();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
  it("follows the system preference for an unconfigured visitor", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    applyFirstPaint();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("rejects unsafe CSS in a corrupt cache", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: 1,
        appearance: {
          ...DEFAULT_APPEARANCE,
          theme: {
            ...DEFAULT_APPEARANCE.theme,
            background_light: "url(https://example.com/x)",
          },
        },
      }),
    );
    applyFirstPaint();
    expect(document.documentElement.style.getPropertyValue("--site-bg")).toBe(
      DEFAULT_THEME.background_light,
    );
  });
  it("handles blocked local storage during first paint", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(applyFirstPaint).not.toThrow();
    expect(document.documentElement.dataset.siteTheme).toBe("light");
  });
  it.each(["light", "dark"])(
    "matches the bundled %s palette before the application starts",
    (mode) => {
      localStorage.setItem("theme", mode);
      applyFirstPaint();
      const styles = document.documentElement.style;
      expect(styles.getPropertyValue("--site-primary")).toBe(
        DEFAULT_THEME[`primary_${mode}`],
      );
      expect(styles.getPropertyValue("--site-bg")).toBe(
        DEFAULT_THEME[`background_${mode}`],
      );
      expect(styles.getPropertyValue("--site-card")).toBe(
        DEFAULT_THEME[`card_${mode}`],
      );
      const palette = createThemePalette({
        primary: DEFAULT_THEME[`primary_${mode}`],
        background: DEFAULT_THEME[`background_${mode}`],
        card: DEFAULT_THEME[`card_${mode}`],
      });
      expect(styles.getPropertyValue("--site-text")).toBe(palette.text);
    },
  );
});
