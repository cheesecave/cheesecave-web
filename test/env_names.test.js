import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Settings are CHEESE_CAVE_<NAME>; the backend still reads KOHAKU_HUB_<NAME> as a fallback, so a line
// may mention the old prefix only to say so. Anything else naming a setting with it is a stale example.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ABOUT_THE_OLD_PREFIX =
  /older|\bold\b|fallback|legacy|compatib|still (works|accepted|read)|KOHAKU_HUB_<NAME>|KOHAKU_HUB_\*|旧|回退|既有|仍/i;

function files(dir, accept) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, accept);
    return accept(path) ? [path] : [];
  });
}

const checked = [
  ...files(join(ROOT, "src"), (p) => /\.(vue|js|ts)$/.test(p)),
  ...files(join(ROOT, "docs"), (p) => p.endsWith(".md")),
  join(ROOT, "README.md"),
  join(ROOT, "README.zh-CN.md"),
  join(ROOT, "AGENTS.md"),
];

describe("environment variable names", () => {
  it.each(checked.map((p) => [relative(ROOT, p), p]))(
    "%s names settings CHEESE_CAVE_* (the old prefix only to explain the fallback)",
    (_name, path) => {
      const stale = readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => [i + 1, line])
        .filter(([, line]) => line.includes("KOHAKU_HUB_") && !ABOUT_THE_OLD_PREFIX.test(line))
        .map(([n, line]) => `${n}: ${line.trim().slice(0, 100)}`);
      expect(stale).toEqual([]);
    },
  );
});
