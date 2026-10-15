import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  iconClasses,
  main,
  missingIcons,
} from "../../scripts/check-icon-css.mjs";

// UnoCSS does not scan plain `.js` by default, so `i-carbon-logout` named only
// in header-navigation.js produced no CSS: the user menu's Profile and Logout
// rendered an empty box in production. These check the built stylesheets
// against every icon class the source spells out.

const SCRIPT = resolve(
  fileURLToPath(import.meta.url),
  "../../../scripts/check-icon-css.mjs",
);
const roots = [];
function project(sources, css) {
  const root = mkdtempSync(join(tmpdir(), "icon-css-"));
  roots.push(root);
  for (const [path, text] of Object.entries(sources)) {
    mkdirSync(join(root, "src", path, ".."), { recursive: true });
    writeFileSync(join(root, "src", path), text);
  }
  mkdirSync(join(root, "dist/assets"), { recursive: true });
  writeFileSync(join(root, "dist/assets/index.css"), css);
  writeFileSync(join(root, "dist/assets/readme.txt"), ".i-carbon-ignored{}");
  return { src: join(root, "src"), dist: join(root, "dist") };
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
  vi.restoreAllMocks();
});

const SOURCES = {
  "a.vue": `<i class="i-carbon-user text-lg" /><i class="i-ep-loading"/>`,
  "utils/b.js": `export const x = { icon: "i-carbon-logout" };`,
  "utils/c.js": "export const y = 1; // no icon here",
  "d.css": ".i-carbon-not-scanned{}",
};

describe("check-icon-css", () => {
  it("finds the icon classes in .vue and .js, and only there", () => {
    const { src } = project(SOURCES, "");
    expect([...iconClasses(src)].sort()).toEqual([
      "i-carbon-logout",
      "i-carbon-user",
      "i-ep-loading",
    ]);
  });

  it("reports an icon named only in a .js file when the build has no rule for it", () => {
    const { src, dist } = project(
      SOURCES,
      ".i-carbon-user{mask:x}.i-ep-loading{mask:y}",
    );
    expect(missingIcons(src, dist)).toEqual(["i-carbon-logout"]);
  });

  it("passes when every class has a rule, in any stylesheet", () => {
    const { src, dist } = project(
      SOURCES,
      ".i-carbon-user{a:b}.i-carbon-logout{a:b}.i-ep-loading{a:b}",
    );
    expect(missingIcons(src, dist)).toEqual([]);
  });

  it("finds a class in a rule it shares with another icon", () => {
    const { src, dist } = project(
      { "a.js": `"i-carbon-asleep"` },
      ".i-carbon-moon,.i-carbon-asleep{a:b}.i-carbon-sun,.i-carbon-day{a:b}",
    );
    expect(missingIcons(src, dist)).toEqual([]);
  });

  it("does not take a longer class for the one it is looking for", () => {
    const { src, dist } = project(
      { "a.js": `"i-carbon-user"` },
      ".i-carbon-user-avatar{a:b}",
    );
    expect(missingIcons(src, dist)).toEqual(["i-carbon-user"]);
  });

  it("exits 1 and names each missing class, 0 and says how many otherwise", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bad = project(SOURCES, "");
    expect(main(bad.dist, bad.src)).toBe(1);
    expect(error).toHaveBeenCalledTimes(3);
    expect(error.mock.calls.map(([line]) => line.split(":")[0]).sort()).toEqual(
      ["i-carbon-logout", "i-carbon-user", "i-ep-loading"],
    );
    const good = project(
      SOURCES,
      ".i-carbon-user{a:b}.i-carbon-logout{a:b}.i-ep-loading{a:b}",
    );
    expect(main(good.dist, good.src)).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("(3)"));
  });

  it("scans src/ by default", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(project({}, "").dist)).toBe(1); // the repository's own icons, no CSS
  });

  it("runs as `node scripts/check-icon-css.mjs dist` from the project root, as CI does", () => {
    const run = (css) => {
      const { src, dist } = project({ "a.js": `"i-carbon-user"` }, css);
      return spawnSync(process.execPath, [SCRIPT, "dist"], {
        cwd: join(src, ".."),
        encoding: "utf8",
      });
    };
    const bad = run("");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("i-carbon-user: no rule in dist");
    const good = run(".i-carbon-user{a:b}");
    expect(good.status).toBe(0);
    expect(good.stdout).toContain("has a rule (1)");
  });
});
