import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// A control that goes to a page of its own must be a real link (<a href>, via RouterLink), so
// right-click, middle-click and Ctrl/Cmd-click open it in a new tab. This finds the opposite: a
// click handler on a plain element (div, tr, li, ...) that navigates. See CLAUDE.md, "Code
// conventions", for when a button is right instead.
const SRC = join(import.meta.dirname, "../../src");
const PLAIN = "div|tr|td|li|span|p|section|article|img|h[1-6]";
const TAG = new RegExp(`<(${PLAIN})\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "g");
const NAVIGATES = /router\.(push|replace)|\bgoTo\w*\(|\bnavigate\w*\(/;

// Rows that stay clickable on purpose, each with the reason. Keep this short: a new entry
// needs a reason, and the better fix is usually a link.
const ALLOWED = {
  "pages/[username]/storage.vue": "table row opens the repository's storage",
  "pages/organizations/[orgname]/storage.vue":
    "table row opens the repository's storage",
};

function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return path.endsWith(".vue") ? [path] : [];
  });
}

function inTemplate(source) {
  const template = source.split("<script")[0];
  return [...template.matchAll(TAG)].flatMap(([element, tag, attrs]) => {
    const click = attrs.match(/@click(?:\.\w+)*=("([^"]*)"|'([^']*)')/);
    return click && NAVIGATES.test(click[2] ?? click[3])
      ? [`<${tag}> ${element.replace(/\s+/g, " ").slice(0, 100)}`]
      : [];
  });
}

function offenders() {
  return vueFiles(SRC).flatMap((file) =>
    inTemplate(readFileSync(file, "utf8")).map(
      (found) => `${relative(SRC, file)}: ${found}`,
    ),
  );
}

describe("navigation controls", () => {
  it("has no click-to-navigate handler on a plain element, outside the allow-list", () => {
    const found = offenders().filter(
      (line) => !Object.keys(ALLOWED).some((file) => line.startsWith(file)),
    );
    expect(found).toEqual([]);
  });

  it("keeps the allow-list honest: every entry still has an offender", () => {
    const found = offenders();
    for (const file of Object.keys(ALLOWED))
      expect(found.some((line) => line.startsWith(file))).toBe(true);
  });

  it("does flag a plain element that navigates on click, and not links, buttons or other handlers", () => {
    const flagged = (html) => inTemplate(`<template>${html}</template>`);
    expect(flagged('<div @click="router.push(`/x`)">x</div>')).toHaveLength(1);
    expect(
      flagged('<tr\n  :key="a"\n  @click.stop="goToRepo(repo)">'),
    ).toHaveLength(1);
    expect(flagged('<li @click="navigateTo(item)">')).toHaveLength(1);
    expect(flagged('<button @click="router.push(`/x`)">')).toEqual([]);
    expect(flagged('<div @click="open = !open">')).toEqual([]);
    expect(flagged('<RouterLink to="/x"><div>x</div></RouterLink>')).toEqual(
      [],
    );
  });
});
