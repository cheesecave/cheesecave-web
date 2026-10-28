// PROTOTYPE (not for merging as is): how "no limit" is written. One build shows every option; the option is
// chosen from the address bar (`?inf=word|a|b|c`) or the pill at the bottom left, and remembered for the tab.
//   word  today: the word "Unlimited" (default)
//   a     the symbol alone, with the word as a tooltip and for screen readers
//   b     the symbol and the word, everywhere
//   c     the symbol alone for a value, symbol and word on a control, "no limit (∞)" in a sentence
export const VARIANTS = ["word", "a", "b", "c"];
const KEY = "cc-proto-inf";

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

export const INFINITY = "∞";

const TEXT = {
  // a value: "1.45 KB / …", "Usage: 0 / …"
  value: {
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

/** The text for `kind` in the chosen option (a plain string, for labels and interpolation). */
export function unlimitedText(kind = "value") {
  return TEXT[kind][unlimitedVariant()];
}

/** Does this option show the symbol alone for `kind`, so that the word belongs in a tooltip? */
export function symbolAlone(kind = "value") {
  return unlimitedText(kind) === INFINITY;
}
