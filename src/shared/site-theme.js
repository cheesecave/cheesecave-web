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
