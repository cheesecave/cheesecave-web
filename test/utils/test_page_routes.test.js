// File-based routing turns every file under src/pages into a route. Two files that resolve to the same path (the
// parameter's name is not part of the path: `[org]/settings.vue` and `[orgname]/settings.vue` are both
// `/organizations/:x/settings`) leave one of them dead: the router picks one, and a change to the other does
// nothing and nobody notices.

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = join(process.cwd(), "src/pages");

function pageFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) pageFiles(path, out);
    else if (name.endsWith(".vue")) out.push(relative(PAGES, path));
  }
  return out;
}

/** The route path of a page file with every parameter's name left out: `[a]` is `:`, `[...a]` is `*`. */
export function routeShape(file) {
  const parts = file
    .replace(/\.vue$/, "")
    .split("/")
    .filter((part) => part !== "index")
    .map((part) =>
      part.replace(/\[\.\.\.[^\]]+\]/g, "*").replace(/\[[^\]]+\]/g, ":"),
    );
  return `/${parts.join("/")}`;
}

describe("routeShape", () => {
  it.each([
    ["index.vue", "/"],
    ["login.vue", "/login"],
    ["organizations/[org]/settings.vue", "/organizations/:/settings"],
    ["organizations/[orgname]/settings.vue", "/organizations/:/settings"],
    ["[username]/index.vue", "/:"],
    ["[type]s/[namespace]/[name]/index.vue", "/:s/:/:"],
    ["docs/[...slug].vue", "/docs/*"],
  ])("%s is %s", (file, shape) => {
    expect(routeShape(file)).toBe(shape);
  });
});

describe("src/pages", () => {
  it("has no two page files for one route", () => {
    const byShape = new Map();
    for (const file of pageFiles(PAGES)) {
      const shape = routeShape(file);
      byShape.set(shape, [...(byShape.get(shape) ?? []), file]);
    }
    const duplicates = [...byShape].filter(([, files]) => files.length > 1);
    expect(duplicates).toEqual([]);
  });
});
