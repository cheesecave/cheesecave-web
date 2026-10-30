// src/utils/natural-sort.js
//
// Natural order for the names inside an archive (a zip or an indexed tar):
// `img_2` comes before `img_10`, and a member named by id such as `9950000.png`
// comes before `10000000.png`.
//
// The comparison itself is `string-natural-compare` (a widely used package with
// no dependencies): digits compare as numbers however long the run is, and with
// `caseInsensitive` case does not decide the order (`a`, `B`, `c`). It is also
// the fastest of the packages tried (about 3 s for a million names); the common
// `natural-orderby` takes 74 s for the same list.
//
// Two small rules are added on top, so that a listing is the same for everybody:
//   - names are compared in their canonical (NFC) spelling: macOS writes the
//     names in a zip with combining accents, and `cafe` + U+0301 is the same
//     name as `café`;
//   - when two names differ only by case the tie is broken by code unit, so the
//     order does not depend on the order the archive stores them in.
// Accents are not folded away: `café` follows `cafz` by code point, as it does
// in the listings of GitHub and Hugging Face.

import naturalCompare from "string-natural-compare";

const OPTIONS = { caseInsensitive: true };

const canonical = (name) => name.normalize("NFC");

// `a` and `b` are already canonical
function compareCanonical(a, b) {
  return naturalCompare(a, b, OPTIONS) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Compare two names in natural order; 0 only when they are the same name. */
export function compareNames(a, b) {
  return compareCanonical(canonical(a), canonical(b));
}

/**
 * A sorted copy of `items`, ordered by the name `nameOf` returns. Each name is
 * put in canonical form once, not at every comparison, and items with the same
 * name keep the order they came in.
 */
export function sortByName(items, nameOf = (item) => item) {
  const decorated = items.map((item, index) => ({
    item,
    index,
    key: canonical(nameOf(item)),
  }));
  decorated.sort((a, b) => compareCanonical(a.key, b.key) || a.index - b.index);
  return decorated.map((entry) => entry.item);
}
