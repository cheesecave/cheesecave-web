import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../../src/shared/site-appearance.js";
import {
  contrastRatio,
  contrastText,
  createThemePalette,
} from "../../src/shared/site-theme.js";

describe("shared site theme palette", () => {
  it.each(["light", "dark"])(
    "uses soft ink and cream for the bundled %s palette",
    (mode) => {
      const palette = createThemePalette({
        primary: DEFAULT_THEME[`primary_${mode}`],
        background: DEFAULT_THEME[`background_${mode}`],
        card: DEFAULT_THEME[`card_${mode}`],
      });
      expect(palette.text).toBe(mode === "light" ? "#2c332b" : "#eef0e7");
      expect(palette.cardText).toBe(palette.text);
      expect(palette.buttonText).toBe(mode === "light" ? "#eef0e7" : "#2c332b");
    },
  );

  it.each([
    { primary: "#ffffff", background: "#000000", card: "#ffffff" },
    { primary: "#000000", background: "#ffffff", card: "#000000" },
    { primary: "#7f7f7f", background: "#7f7f7f", card: "#7f7f7f" },
    { primary: "#ffff00", background: "#2a1044", card: "#43172a" },
    { primary: "#ff00ff", background: "#ffff00", card: "#00ffff" },
    { primary: "#94621f", background: "#f7f4eb", card: "#fffdf7" },
    { primary: "#e6b85c", background: "#1c211d", card: "#282e27" },
  ])(
    "keeps text, links and button states readable for custom palette %j",
    (colors) => {
      const palette = createThemePalette(colors);
      for (const [foreground, background] of [
        [palette.text, colors.background],
        [palette.cardText, colors.card],
        [palette.buttonText, colors.primary],
        [palette.buttonText, palette.primaryHover],
        [palette.buttonText, palette.primaryActive],
        [palette.link, colors.card],
        [palette.pageLink, colors.background],
        [palette.muted, colors.card],
        [palette.pageMuted, colors.background],
        [palette.illustrationText, palette.illustrationBg],
      ])
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
          4.5,
        );
      for (const token of Object.values(palette))
        expect(token).toMatch(/^#[a-f\d]{6}$/);
    },
  );

  it("falls back to black or white when soft foregrounds cannot meet text contrast", () => {
    const palette = createThemePalette({
      primary: "#7f7f7f",
      background: "#7f7f7f",
      card: "#7f7f7f",
    });
    expect(palette.text).toBe(contrastText("#7f7f7f"));
    expect(palette.cardText).toBe(palette.text);
    expect(palette.buttonText).toBe(palette.text);
  });

  it("derives illustration surfaces from both the card and primary colors", () => {
    const first = createThemePalette({
      primary: "#94621f",
      background: "#f7f4eb",
      card: "#fffdf7",
    });
    const primaryChanged = createThemePalette({
      primary: "#315cba",
      background: "#f7f4eb",
      card: "#fffdf7",
    });
    const cardChanged = createThemePalette({
      primary: "#94621f",
      background: "#f7f4eb",
      card: "#282e27",
    });
    for (const key of [
      "illustrationBg",
      "illustrationRing",
      "illustrationBorder",
    ]) {
      expect(primaryChanged[key]).not.toBe(first[key]);
      expect(cardChanged[key]).not.toBe(first[key]);
    }
  });
});
