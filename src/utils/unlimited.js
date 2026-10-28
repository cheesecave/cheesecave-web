// PROTOTYPE (not for merging as is): how "no limit" is written. One build shows every option; the option is
// chosen from the address bar (`?inf=word|a|b|c|c1|c2|c3`) or the pill at the bottom left, and remembered for the tab.
// Round 1: word (today), a (symbol alone), b (symbol and word), c (symbol for a value, symbol and word on a control).
// Round 2, from C, after looking at how other products write it:
//   c1  C tightened: the symbol alone only as the right side of "x / ∞"; a field that shows only the value says
//       "∞ Unlimited"; a sentence says "unlimited (∞)"; the input help says the word works too
//   c2  c1 with the words of Discord and Cloudflare: "No limit" instead of "Unlimited" (nothing is promised, no cap is set)
//   c3  c1 and an unlimited meter that is not an empty bar (an empty bar reads as "0 % used")
export const VARIANTS = ["word", "a", "b", "c", "c1", "c2", "c3"];
export const LABELS = {
  word: "today",
  a: "A ∞",
  b: "B ∞ + word",
  c: "C (round 1)",
  c1: "C-1",
  c2: "C-2",
  c3: "C-3",
};
const KEY = "cc-proto-inf";
export const INFINITY = "∞";

export function unlimitedVariant() {
  try {
    const asked = new URLSearchParams(window.location.search).get("inf");
    if (VARIANTS.includes(asked)) sessionStorage.setItem(KEY, asked);
    const kept = sessionStorage.getItem(KEY);
    if (VARIANTS.includes(kept)) return kept;
  } catch {
    // no storage: the default
  }
  return "word";
}

const REFINED = { c1: "Unlimited", c2: "No limit", c3: "Unlimited" };
export const isRefined = (variant = unlimitedVariant()) => variant in REFINED;

/** The word behind the symbol: the tooltip and the accessible name. */
export function unlimitedWord() {
  return REFINED[unlimitedVariant()] || "Unlimited";
}

const TEXT = {
  // the right side of "1.45 KB / …", "Usage: 0 / …"
  value: {
    word: "Unlimited",
    a: INFINITY,
    b: `${INFINITY} Unlimited`,
    c: INFINITY,
  },
  // a field that shows only the value ("Private Quota  …")
  standalone: {
    word: "Unlimited",
    a: INFINITY,
    b: `${INFINITY} Unlimited`,
    c: INFINITY,
  },
  // the label of a control: an option of a list, a button
  control: {
    word: "Unlimited",
    a: INFINITY,
    b: `${INFINITY} Unlimited`,
    c: `${INFINITY} Unlimited`,
  },
  // inside a sentence, in brackets
  prose: {
    word: "unlimited",
    a: INFINITY,
    b: `${INFINITY} unlimited`,
    c: `no limit (${INFINITY})`,
  },
  // a whole sentence
  namespaceQuota: {
    word: "Namespace has unlimited quota",
    a: `Namespace quota: ${INFINITY}`,
    b: `Namespace quota: ${INFINITY} unlimited`,
    c: `Namespace has no quota limit (${INFINITY})`,
  },
};

function refined(kind, variant) {
  const word = REFINED[variant];
  if (kind === "value") return INFINITY;
  if (kind === "standalone" || kind === "control") return `${INFINITY} ${word}`;
  // inside brackets already: no brackets of its own
  if (kind === "prose") return `${INFINITY} ${word.toLowerCase()}`;
  return variant === "c2"
    ? `Namespace has no quota limit (${INFINITY})`
    : `Namespace has unlimited quota (${INFINITY})`;
}

/** The text for `kind` in the chosen option (a plain string, for labels and interpolation). */
export function unlimitedText(kind = "value") {
  const variant = unlimitedVariant();
  return isRefined(variant) ? refined(kind, variant) : TEXT[kind][variant];
}

/** Does this option show the symbol alone for `kind`, so that the word belongs in a tooltip? */
export function symbolAlone(kind = "value") {
  return unlimitedText(kind) === INFINITY;
}

/** Does this option draw an unlimited meter that is not an empty bar? */
export const distinctMeter = () => unlimitedVariant() === "c3";
