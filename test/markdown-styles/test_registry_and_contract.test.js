// A style is a stylesheet that must be safe to ship next to nine others and to the rest of the app: it may only
// style `.mdx.s-<id>` (and its dark variant), never the page; and the registry and the files must agree.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_MARKDOWN_STYLE,
  isMarkdownStyle,
  loadMarkdownStyle,
  MARKDOWN_STYLES,
  markdownStyleClasses,
  normalizeMarkdownStyle,
} from "@/markdown-styles/registry";

const DIR = join(process.cwd(), "src/markdown-styles");
const files = readdirSync(join(DIR, "themes")).map((name) =>
  name.replace(/\.css$/, ""),
);

describe("the registry", () => {
  it("lists each style once, with what a picker needs", () => {
    const ids = MARKDOWN_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
    for (const style of MARKDOWN_STYLES) {
      expect(style.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(style.name).toBeTruthy();
      expect(style.summary).toBeTruthy();
      expect(style.source).toMatch(/^https:\/\//);
    }
    expect(isMarkdownStyle(DEFAULT_MARKDOWN_STYLE)).toBe(true);
  });

  it("is the same set as the stylesheets on disk", () => {
    expect(files.sort()).toEqual(
      MARKDOWN_STYLES.map((style) => style.id).sort(),
    );
  });

  it("turns anything it does not know into the fallback", () => {
    expect(normalizeMarkdownStyle("vitepress")).toBe("vitepress");
    expect(normalizeMarkdownStyle("nope")).toBe(DEFAULT_MARKDOWN_STYLE);
    expect(normalizeMarkdownStyle(undefined, null)).toBeNull();
    expect(normalizeMarkdownStyle("../x")).toBe(DEFAULT_MARKDOWN_STYLE);
  });

  it("names the classes of a style, with the modifier the style wants", () => {
    expect(markdownStyleClasses("github")).toEqual(["mdx", "s-github"]);
    expect(markdownStyleClasses("gitlab")).toEqual(["mdx", "s-gitlab", "bar"]);
    expect(markdownStyleClasses("vitepress")).toEqual([
      "mdx",
      "s-vitepress",
      "lang",
    ]);
  });

  it("loads each stylesheet once, and a stale id loads the fallback", async () => {
    const first = loadMarkdownStyle("hf");
    expect(loadMarkdownStyle("hf")).toBe(first);
    expect(await first).toBe("hf");
    expect(await loadMarkdownStyle("not-a-style")).toBe(DEFAULT_MARKDOWN_STYLE);
  });
});

describe.each(files)("the %s stylesheet", (id) => {
  let rules;
  beforeAll(() => {
    const style = document.createElement("style");
    style.textContent = readFileSync(join(DIR, "themes", `${id}.css`), "utf8");
    document.head.append(style);
    rules = [...style.sheet.cssRules];
  });

  it("styles nothing but its own container, light or dark", () => {
    const own = new RegExp(`^(\\.dark )?\\.mdx\\.s-${id}(?![\\w-])`);
    const selectors = rules.flatMap((rule) =>
      rule.selectorText
        ? rule.selectorText.split(",").map((s) => s.trim())
        : [],
    );
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.filter((selector) => !own.test(selector))).toEqual([]);
  });

  it("brings no at-rules of its own: fonts are declared once, in fonts.css", () => {
    expect(rules.filter((rule) => !rule.selectorText)).toEqual([]);
  });

  it("says how it looks in the dark, unless it takes the neutral dark tokens", () => {
    const text = readFileSync(join(DIR, "themes", `${id}.css`), "utf8");
    expect(text.includes(`.dark .mdx.s-${id}`) || id === "github").toBe(true);
  });
});

describe("the shared stylesheet", () => {
  const base = readFileSync(join(DIR, "base.css"), "utf8");

  it("covers every piece of markup the renderer produces", () => {
    for (const selector of [
      ".heading-anchor",
      ".code-block",
      ".code-bar",
      ".code-lang",
      ".copy-code",
      ".markdown-alert",
      ".markdown-alert-title",
      ".footnotes",
      ".footnote-ref",
      ".katex-display",
      ".task-list-checkbox",
      "kbd",
      "details",
      "table",
      "blockquote",
    ]) {
      expect(base, selector).toContain(selector);
    }
  });

  it("declares each font file it points at, and the file exists", () => {
    const fonts = readFileSync(join(DIR, "fonts.css"), "utf8");
    const urls = [...fonts.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(urls.length).toBeGreaterThan(8);
    const present = new Set(readdirSync(join(process.cwd(), "public/fonts")));
    expect(urls.filter((name) => !present.has(name))).toEqual([]);
  });
});

// Mistakes the real page showed and the rules above could not see (found on the real stack, not in a lab)
describe("what a style must not do to the content around it", () => {
  const css = (id) => readFileSync(join(DIR, "themes", `${id}.css`), "utf8");

  it("never paints a background of its own over the card it sits in", () => {
    // Tufte once set `background: #fffff8` on `.mdx`, a cream rectangle on every other card colour
    for (const style of MARKDOWN_STYLES) {
      expect(css(style.id), style.id).not.toMatch(
        /(^|\})\s*\.mdx\.s-[a-z0-9-]+\s*\{[^}]*\bbackground:\s*#/,
      );
    }
  });

  it("does not wrap inline code in literal backticks", () => {
    for (const style of MARKDOWN_STYLES)
      expect(css(style.id), style.id).not.toMatch(
        /code::(before|after)\s*\{[^}]*content:\s*"`"/,
      );
  });

  it("rules a callout on one side only, so two callouts never stack into a double line", () => {
    const tufte = css("tufte");
    expect(tufte).toMatch(/\.markdown-alert\{[^}]*border-top:/);
    expect(tufte).not.toMatch(/\.markdown-alert\{[^}]*border-bottom:/);
  });

  it("keeps long code lines from running under the copy button", () => {
    const base = readFileSync(join(DIR, "base.css"), "utf8");
    expect(base).toMatch(
      /\.mdx:not\(\.bar\) \.code-block pre\{padding-right:3em\}/,
    );
    expect(base).toMatch(
      /\.mdx\.lang \.code-block pre\{padding-right:6\.5em\}/,
    );
  });
});
