const rgb = (hex) =>
  hex.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16));

export function mixColor(color, target, weight) {
  const destination = rgb(target);
  return `#${rgb(color)
    .map((channel, index) =>
      Math.round(channel + (destination[index] - channel) * weight)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(hex) {
  const channels = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function contrastText(background) {
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}

export function readableColor(color, background) {
  const target = contrastText(background);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixColor(color, target, step / 20);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

function softText(background) {
  const ink = "#2c332b";
  const cream = "#eef0e7";
  const preferred =
    contrastRatio(background, ink) >= contrastRatio(background, cream)
      ? ink
      : cream;
  return contrastRatio(background, preferred) >= 4.5
    ? preferred
    : contrastText(background);
}

function readableSoftColor(color, background) {
  const target = softText(background);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixColor(color, target, step / 20);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

// The README paints table headers, zebra rows and code on the card tinted with its own text colour (3%, 6% and 11%
// steps). Its text has to clear 4.5:1 on the plain card and on every tint at once. For ordinary palettes that is
// easy; in the middle of the luminance range (card luminance about 0.14 to 0.23) black and white are both barely
// readable on the plain card and tinting it makes one of them unreadable, so the README tints less there, down to
// not at all.
const TINT_STEPS = [0.03, 0.06, 0.11];
const TINT_SCALES = [1, 0.75, 0.5, 0.35, 0.2, 0.1, 0.05, 0];
const surfacesAt = (card, cardText, scale) => [
  card,
  ...TINT_STEPS.map((step) => mixColor(card, cardText, step * scale)),
];
const clearsAll = (ink, surfaces) =>
  surfaces.every((surface) => contrastRatio(ink, surface) >= 4.5);

/** How strongly the README may tint the card: 1 for the full steps, less where no ink stays readable on them. */
export function markdownTintScale(card, cardText) {
  // the last scale is 0, where the surfaces are the card itself and black or white always reads on it (4.58:1 at worst)
  return TINT_SCALES.find((scale) =>
    ["#000000", "#ffffff"].some((ink) =>
      clearsAll(ink, surfacesAt(card, cardText, scale)),
    ),
  );
}

// Mix `color` toward `ink` until it clears every surface; the last step is `ink` itself, which does
function readableOnAll(color, surfaces, ink) {
  return Array.from({ length: 21 }, (_, step) =>
    mixColor(color, ink, step / 20),
  ).find((candidate) => clearsAll(candidate, surfaces));
}

function markdownColors(primary, card, cardText) {
  const surfaces = surfacesAt(
    card,
    cardText,
    markdownTintScale(card, cardText),
  );
  const markdownText = [cardText, "#000000", "#ffffff"].find((ink) =>
    clearsAll(ink, surfaces),
  );
  return {
    markdownText,
    markdownLink: readableOnAll(primary, surfaces, markdownText),
    markdownMuted: readableOnAll(
      mixColor(markdownText, card, 0.3),
      surfaces,
      markdownText,
    ),
  };
}

/** Derive presentation colors from validated #rrggbb site settings. */
export function createThemePalette({ primary, background, card }) {
  const text = softText(background);
  const cardText = softText(card);
  const buttonText = softText(primary);
  const hoverTarget = luminance(buttonText) > 0.5 ? "#2c332b" : "#eef0e7";
  const illustrationBg = mixColor(card, primary, 0.1);
  return {
    text,
    cardText,
    buttonText,
    link: readableSoftColor(primary, card),
    pageLink: readableSoftColor(primary, background),
    muted: readableSoftColor(mixColor(cardText, card, 0.3), card),
    pageMuted: readableSoftColor(mixColor(text, background, 0.3), background),
    ...markdownColors(primary, card, cardText),
    border: mixColor(cardText, card, 0.82),
    hoverSurface: mixColor(card, cardText, 0.06),
    primaryHover: mixColor(primary, hoverTarget, 0.12),
    primaryActive: mixColor(primary, hoverTarget, 0.22),
    illustrationBg,
    illustrationRing: mixColor(illustrationBg, primary, 0.08),
    illustrationBorder: mixColor(illustrationBg, primary, 0.22),
    illustrationText: readableSoftColor(primary, illustrationBg),
  };
}

// A link without an underline is told from the text around it by colour alone. WCAG's technique wants 3:1 between
// the two, which this site's soft text colour would fail for nearly every brand colour; underline only where the link
// cannot be told from the text at all (a black or white brand colour).
const LINK_DISTINCT_MIN = 1.5;
export function markdownLinkDecoration(palette) {
  return contrastRatio(palette.markdownLink, palette.markdownText) <
    LINK_DISTINCT_MIN
    ? "underline"
    : "none";
}
