import {
  createThemePalette,
  mixColor,
  readableColor,
} from "../shared/site-theme.js";
export { contrastRatio, contrastText, mixColor } from "../shared/site-theme.js";

export function applySiteTheme(theme, isDark) {
  const suffix = isDark ? "dark" : "light";
  const primary = theme[`primary_${suffix}`];
  const background = theme[`background_${suffix}`];
  const card = theme[`card_${suffix}`];
  const palette = createThemePalette({ primary, background, card });
  const { text, cardText, buttonText } = palette;
  const tokens = {
    "site-bg": background,
    "site-card": card,
    "site-text": text,
    "site-card-text": cardText,
    "site-muted": palette.muted,
    "site-page-muted": palette.pageMuted,
    "site-border": palette.border,
    "site-hover": palette.hoverSurface,
    "site-primary": primary,
    "site-primary-text": buttonText,
    "site-primary-hover": palette.primaryHover,
    "site-primary-active": palette.primaryActive,
    "site-link": palette.link,
    "site-page-link": palette.pageLink,
    "site-illustration-bg": palette.illustrationBg,
    "site-illustration-ring": palette.illustrationRing,
    "site-illustration-border": palette.illustrationBorder,
    "site-illustration-text": palette.illustrationText,
    "el-color-primary": primary,
    "el-color-primary-dark-2": palette.primaryActive,
    "el-bg-color": card,
    "el-bg-color-page": background,
    "el-bg-color-overlay": card,
    "el-fill-color-blank": card,
    "el-fill-color": mixColor(card, cardText, 0.08),
    "el-fill-color-light": mixColor(card, cardText, 0.04),
    "el-fill-color-lighter": mixColor(card, cardText, 0.02),
    "el-fill-color-extra-light": mixColor(card, cardText, 0.01),
    "el-fill-color-dark": mixColor(card, cardText, 0.12),
    "el-fill-color-darker": mixColor(card, cardText, 0.16),
    "el-text-color-primary": cardText,
    "el-text-color-regular": readableColor(
      mixColor(cardText, card, 0.15),
      card,
    ),
    "el-text-color-secondary": palette.muted,
    "el-text-color-placeholder": mixColor(cardText, card, 0.42),
    "el-text-color-disabled": mixColor(cardText, card, 0.6),
  };
  for (const step of [3, 5, 7, 8, 9])
    tokens[`el-color-primary-light-${step}`] = mixColor(
      primary,
      card,
      step / 10,
    );
  for (const [name, weight] of Object.entries({
    "": 0.78,
    "-light": 0.82,
    "-lighter": 0.86,
    "-extra-light": 0.9,
    "-dark": 0.7,
    "-darker": 0.62,
  }))
    tokens[`el-border-color${name}`] = mixColor(cardText, card, weight);
  const html = document.documentElement;
  html.classList.toggle("dark", isDark);
  html.dataset.siteTheme = suffix;
  html.style.colorScheme = suffix;
  html.style.backgroundColor = background;
  html.style.color = text;
  for (const [name, value] of Object.entries(tokens))
    html.style.setProperty(`--${name}`, value);
}
