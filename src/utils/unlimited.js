// How "no limit" is written: the symbol, with its word where the symbol would stand alone and unexplained.
// A quota that is `null` (or an invitation with `max_usage` -1) has no limit set; the symbol is the right side of
// "10 MB / ∞", and the word goes with it on a control and in a sentence (see the Unlimited component).
export const INFINITY = "∞";
export const NO_LIMIT = "No limit";
// A control: an option of a list.
export const UNLIMITED_LABEL = `${INFINITY} ${NO_LIMIT}`;
// Inside brackets that are already there: "Inherit from alice (∞ no limit)".
export const UNLIMITED_BRACKET = `${INFINITY} ${NO_LIMIT.toLowerCase()}`;
export const NAMESPACE_UNLIMITED = `Namespace has no quota limit (${INFINITY})`;
