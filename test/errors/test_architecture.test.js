// The error system only works if pages go through it. These patterns are how
// failures used to be flattened into the wrong words ("Repository Not Found"
// for everything, the raw `detail` of a response in a toast), so none may come
// back outside src/errors (which owns decoding the wire shapes).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const OWNERS = ["errors", "shared"];

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(vue|js)$/.test(name)) out.push(path);
  }
  return out;
}

const files = sources(SRC)
  .map((path) => relative(SRC, path))
  .filter((path) => !OWNERS.some((dir) => path.startsWith(`${dir}/`)));

const BANNED = [
  [
    /response\??\.data\??\.detail/,
    "reads a response's `detail` by hand: use decodeError / notifyError",
  ],
  [
    /<h2[^>]*>\s*Repository Not Found/,
    "hard-codes 'Repository Not Found' for any failure: use <ErrorState>",
  ],
  [/utils\/(http-errors|api-error)/, "imports a retired error helper"],
  [/:classification=/, "passes the retired `classification` to <ErrorState>"],
];

describe("error handling architecture", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(BANNED)("no page matches %s", (pattern, why) => {
    const offenders = files.filter((file) =>
      pattern.test(readFileSync(join(SRC, file), "utf8")),
    );
    expect(offenders, why).toEqual([]);
  });
});
