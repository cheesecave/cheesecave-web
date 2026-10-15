// What the site theme does to colours, read from the real src/style.css: which elements the brand link colour
// reaches (a model name keeps the model colour; a tab and the author link follow the brand) and that the colours it
// sets keep WCAG AA contrast (4.5:1) on the surface they sit on.

import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@/shared/site-appearance";

let rules;
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/style.css", "utf8");
  document.head.append(style);
  rules = [...document.styleSheets[0].cssRules].filter(
    (rule) => rule.selectorText,
  );
});
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
});
document.documentElement.setAttribute("data-site-theme", "light");

function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}
const matching = (el) => rules.filter((rule) => el.matches(rule.selectorText));
const declared = (el, property) =>
  matching(el)
    .map((rule) => rule.style.getPropertyValue(property))
    .filter(Boolean)
    .at(-1) ?? null;
const BRAND = /^var\(--site-(context|page)-link/;
// Every link is the brand colour by default; a blue utility class overrides that, so what matters is whether a rule
// that names a blue class turns the element back to the brand colour
const brandColoured = (el) =>
  matching(el).some(
    (rule) =>
      /text-blue/.test(rule.selectorText) && BRAND.test(rule.style.color),
  );

describe("the brand link colour", () => {
  const BLUE = 'class="text-blue-600 dark:text-blue-400 hover:underline"';

  it("reaches a link written blue, so a link looks like a link", () => {
    expect(brandColoured(mount(`<a ${BLUE}>x</a>`))).toBe(true);
  });

  it("leaves a model name its type colour (blue like the heading and icon above it)", () => {
    expect(
      brandColoured(
        mount(`<a ${BLUE.replace('class="', 'class="keep-type-color ')}>x</a>`),
      ),
    ).toBe(false);
  });

  it("reaches the author link, a blue span inside a link", () => {
    mount(`<a href="#"><span ${BLUE}>demo</span></a>`);
    expect(brandColoured(document.querySelector("span"))).toBe(true);
  });

  it("reaches the active tab (text and underline), so a page has one accent", () => {
    mount(
      `<div class="repo-tabs"><button class="border-b-2 border-blue-500 text-blue-600 dark:text-blue-400">Files</button></div>`,
    );
    const tab = document.querySelector("button");
    expect(brandColoured(tab)).toBe(true);
    expect(declared(tab, "border-color")).toMatch(BRAND);
  });

  it("leaves a blue rule outside the tabs alone (the model section heading's underline)", () => {
    const heading = mount(
      `<div class="border-b-2 border-blue-500">Models</div>`,
    );
    expect(declared(heading, "border-color")).toBeNull();
  });
});

// WCAG 2.x relative luminance and contrast ratio
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Element Plus's light-9 tint of a status colour: 10 % colour over white
const tint = (hex) =>
  "#" +
  rgb(hex)
    .map((c) =>
      Math.round(255 * 0.9 + c * 0.1)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const EP = {
  warning: "#e6a23c",
  success: "#67c23a",
  danger: "#f56c6c",
  info: "#909399",
};

describe("contrast", () => {
  // (the info tag takes `--el-color-info`: see below)
  it.each(Object.entries(EP).filter(([type]) => type !== "info"))(
    "a light %s tag reads at 4.5:1 or more on its tint",
    (type, base) => {
      const tag = mount(
        `<span class="el-tag el-tag--${type} el-tag--light">x</span>`,
      );
      const text = declared(tag, "--el-tag-text-color");
      expect(text).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(text, tint(base))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves a dark-effect tag its own white label", () => {
    const tag = mount(
      '<span class="el-tag el-tag--warning el-tag--dark">x</span>',
    );
    expect(declared(tag, "--el-tag-text-color")).toBeNull();
  });

  it("gives the info colour (input prepend and counter, info tags) 4.5:1 on the card and on the info tint", () => {
    const root = document.documentElement;
    const info = () => declared(root, "--el-color-info");
    expect(contrast(info(), DEFAULT_THEME.card_light)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(info(), tint(EP.info))).toBeGreaterThanOrEqual(4.5);
    root.className = "dark";
    expect(contrast(info(), DEFAULT_THEME.card_dark)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("gives the selected type button the primary button's label colour, not Element Plus's white", () => {
    const radio = mount(
      '<label class="el-radio-button"><span class="el-radio-button__inner">Model</span></label>',
    );
    expect(declared(radio, "--el-radio-button-checked-text-color")).toBe(
      "var(--site-primary-text)",
    );
  });
});
