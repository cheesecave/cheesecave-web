// An icon class that is not in the installed icon set generates no CSS at all:
// the element renders 0x0 and the icon is silently missing (a spinner that does
// not show, a lock that is not there). A string passed as an Element Plus `icon`
// prop is worse: it is looked up as a component, found nowhere, and rendered as
// an unknown HTML element, which is also invisible. Neither gives any warning,
// so check them here.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SETS = ["carbon", "ep"]; // the collections uno.config.js loads

function iconNames(set) {
  const json = JSON.parse(
    readFileSync(
      join(ROOT, "node_modules/@iconify-json", set, "icons.json"),
      "utf8",
    ),
  );
  return new Set([
    ...Object.keys(json.icons),
    ...Object.keys(json.aliases || {}),
  ]);
}

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (
      /\.(vue|js)$/.test(name) &&
      !/auto-imports|components\.d/.test(name)
    )
      out.push(path);
  }
  return out;
}

const files = sources(SRC).map((path) => ({
  file: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

describe("icons used by the UI", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("only use icon classes that exist in an installed icon set", () => {
    const sets = Object.fromEntries(SETS.map((set) => [set, iconNames(set)]));
    const missing = [];
    for (const { file, text } of files) {
      text.split("\n").forEach((line, index) => {
        for (const m of line.matchAll(
          /(?<![\w-])i-([a-z0-9]+)-([a-z0-9][a-z0-9-]*)/g,
        )) {
          const [token, set, name] = m;
          if (!sets[set])
            missing.push(
              `${file}:${index + 1} ${token} (no '${set}' icon set is installed)`,
            );
          else if (!sets[set].has(name))
            missing.push(
              `${file}:${index + 1} ${token} (no such icon in '${set}')`,
            );
        }
      });
    }
    expect(missing).toEqual([]);
  });

  it("are not built from pieces at run time, where UnoCSS cannot see them", () => {
    const built = [];
    for (const { file, text } of files) {
      text.split("\n").forEach((line, index) => {
        if (/`[^`]*\bi-(carbon|ep)-\$\{|["']i-(carbon|ep)-["']\s*\+/.test(line))
          built.push(`${file}:${index + 1} ${line.trim().slice(0, 100)}`);
      });
    }
    expect(built).toEqual([]);
  });

  it("are not passed to an Element Plus `icon` prop as a string", () => {
    // :icon="'View'" is looked up as a component named View, which is not
    // registered, so it renders an empty <view> element
    const strings = [];
    for (const { file, text } of files) {
      text.split("\n").forEach((line, index) => {
        if (
          /:(prefix-|suffix-)?icon="'[^']+'"/.test(line) ||
          /\s(prefix-|suffix-)?icon="[A-Z][A-Za-z]*"/.test(line)
        )
          strings.push(`${file}:${index + 1} ${line.trim()}`);
      });
    }
    expect(strings).toEqual([]);
  });
});
