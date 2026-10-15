// A control with only a placeholder has no accessible name: a screen reader says "edit text" or "button". Every
// Element Plus form control in the templates must be named: an `aria-label`, or the only control of an
// `<el-form-item label="...">` (which Element Plus ties to it). A form item that holds several controls (the four
// social-link inputs) names none of them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CONTROL =
  /el-(?:input|select|input-number|autocomplete|date-picker|switch)/;

function vueFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) vueFiles(path, out);
    else if (name.endsWith(".vue")) out.push(path);
  }
  return out;
}

// Opening tags in order, as { name, text, line, close } (a closing </el-form-item> is { close: true })
function elements(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, (c) =>
    c.replace(/[^\n]/g, " "),
  );
  const found = [];
  const pattern = new RegExp(
    `<(?<close>/?)(?<name>el-form-item|${CONTROL.source})(?=[\\s>/])`,
    "g",
  );
  for (const match of text.matchAll(pattern)) {
    if (match.groups.close) {
      found.push({ name: match.groups.name, close: true });
      continue;
    }
    let quote = "";
    let end = match.index;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) quote = char === quote ? "" : quote;
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    found.push({
      name: match.groups.name,
      text: text.slice(match.index, end + 1),
      line: text.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

export function unnamedControls(source) {
  const items = [];
  const open = [];
  const controls = [];
  for (const el of elements(source)) {
    if (el.name === "el-form-item") {
      if (el.close) open.pop();
      else {
        const item = {
          labelled: /\s:?label=/.test(el.text),
          count: 0,
        };
        items.push(item);
        open.push(item);
      }
    } else if (!el.close) {
      const item = open.at(-1);
      if (item) item.count++;
      controls.push({ el, item });
    }
  }
  return controls
    .filter(
      ({ el, item }) =>
        !/\s:?aria-label=/.test(el.text) &&
        !(item?.labelled && item.count === 1),
    )
    .map(
      ({ el }) =>
        `line ${el.line}: ${el.text.replace(/\s+/g, " ").slice(0, 90)}`,
    );
}

describe("the scan itself", () => {
  it("accepts an aria-label, or the only control of a labelled form item", () => {
    expect(unnamedControls('<el-input aria-label="Search" />')).toEqual([]);
    expect(
      unnamedControls('<el-input :aria-label="`Role of ${a}`" />'),
    ).toEqual([]);
    expect(
      unnamedControls(
        '<el-form-item label="Name"><el-input v-model="a" /></el-form-item>',
      ),
    ).toEqual([]);
  });

  it("flags a bare control, one in an unlabelled item, and one of several in a labelled item", () => {
    expect(unnamedControls('<el-input placeholder="x" />')).toHaveLength(1);
    expect(
      unnamedControls('<el-form-item><el-select v-model="a" /></el-form-item>'),
    ).toHaveLength(1);
    expect(
      unnamedControls(
        '<el-form-item label="Links"><el-input a /><el-input b aria-label="b" /><el-input c /></el-form-item>',
      ),
    ).toHaveLength(2);
  });

  it("reads past `>` in an attribute and ignores comments", () => {
    expect(
      unnamedControls('<el-input @input="() => f()" aria-label="x" />'),
    ).toEqual([]);
    expect(unnamedControls("<!-- <el-input /> -->")).toEqual([]);
  });
});

describe("every form control in the templates has an accessible name", () => {
  const files = vueFiles(join(ROOT, "src")).map((path) => ({
    file: relative(ROOT, path),
    source: readFileSync(path, "utf8"),
  }));

  it.each(files.map(({ file, source }) => [file, source]))(
    "%s",
    (_file, source) => {
      expect(unnamedControls(source)).toEqual([]);
    },
  );
});
