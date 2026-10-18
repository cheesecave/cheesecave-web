import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../../src/shared/site-appearance.js";
import {
  contrastRatio,
  contrastText,
  createThemePalette,
  markdownLinkDecoration,
  markdownTintScale,
  mixColor,
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

// README surfaces (table header, zebra rows, code) are the card tinted with its own text colour. Text drawn on them
// has to clear 4.5:1 there too, not only on the plain card: the first colour-following README put links at 3.28:1 on code.
describe("README text on the surfaces derived from the card", () => {
  // the surfaces the README paints: the plain card and two tints of it, at the strength the palette allows
  const surfaces = (card, cardText) => {
    const scale = markdownTintScale(card, cardText);
    return [
      card,
      mixColor(card, cardText, 0.03 * scale),
      mixColor(card, cardText, 0.06 * scale),
      mixColor(card, cardText, 0.11 * scale),
    ];
  };
  const PALETTES = [
    { primary: "#ffffff", background: "#000000", card: "#ffffff" },
    { primary: "#000000", background: "#ffffff", card: "#000000" },
    { primary: "#7f7f7f", background: "#7f7f7f", card: "#7f7f7f" },
    { primary: "#ffff00", background: "#2a1044", card: "#43172a" },
    { primary: "#ff00ff", background: "#ffff00", card: "#00ffff" },
    { primary: "#d6006e", background: "#19ffd5", card: "#fff200" },
    { primary: "#94621f", background: "#f7f4eb", card: "#fffdf7" },
    { primary: "#e6b85c", background: "#1c211d", card: "#282e27" },
    { primary: "#3b82f6", background: "#111827", card: "#1f2937" },
    { primary: "#111111", background: "#ffffff", card: "#ffffff" },
  ];
  // a fixed pseudo-random sequence, so a failure can be reproduced
  const random = (seed) => () =>
    (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const hex = (next) =>
    `#${Math.floor(next() * 0x1000000)
      .toString(16)
      .padStart(6, "0")}`;
  const sweep = Array.from({ length: 300 }, (_, i) => {
    const next = random(i + 1);
    return { primary: hex(next), background: hex(next), card: hex(next) };
  });

  it.each([...PALETTES, ...sweep])(
    "keeps README links, muted text and body text readable on every derived surface for %j",
    (colors) => {
      const palette = createThemePalette(colors);
      for (const surface of surfaces(colors.card, palette.cardText))
        for (const foreground of [
          palette.markdownText,
          palette.markdownLink,
          palette.markdownMuted,
        ])
          expect(
            contrastRatio(foreground, surface),
            `${foreground} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("underlines links only when the link colour cannot be told from the text", () => {
    const decoration = (colors) =>
      markdownLinkDecoration(createThemePalette(colors));
    // black or white brand colours: the link looks like the text around it
    expect(
      decoration({
        primary: "#111111",
        background: "#ffffff",
        card: "#ffffff",
      }),
    ).toBe("underline");
    expect(
      decoration({
        primary: "#ffffff",
        background: "#000000",
        card: "#0b0b0b",
      }),
    ).toBe("underline");
    // a coloured brand stays a plain coloured link
    expect(decoration(PALETTES[6])).toBe("none");
    expect(
      decoration({
        primary: "#2563eb",
        background: "#f9fafb",
        card: "#ffffff",
      }),
    ).toBe("none");
  });

  it("keeps the full tint for ordinary palettes and weakens it only for mid-tone cards", () => {
    for (const colors of [PALETTES[0], PALETTES[1], ...PALETTES.slice(5)])
      expect(
        markdownTintScale(colors.card, createThemePalette(colors).cardText),
        colors.card,
      ).toBe(1);
    // a mid-grey card is where no ink reaches 4.5:1 once the card is tinted toward its text colour
    const mid = createThemePalette(PALETTES[2]);
    expect(markdownTintScale(PALETTES[2].card, mid.cardText)).toBeLessThan(1);
    expect(
      markdownTintScale(PALETTES[2].card, mid.cardText),
    ).toBeGreaterThanOrEqual(0);
  });

  it("goes flat, not unreadable, on the card luminance where no tint is readable at all", () => {
    // luminance about 0.18 is where black and white are equally (about 4.6:1) readable; almost any tint breaks 4.5:1
    const colors = {
      primary: "#7f7f7f",
      background: "#7f7f7f",
      card: "#777777",
    };
    const palette = createThemePalette(colors);
    expect(
      markdownTintScale(colors.card, palette.cardText),
    ).toBeLessThanOrEqual(0.1);
    expect(palette.markdownText).toBe("#000000");
  });
});
