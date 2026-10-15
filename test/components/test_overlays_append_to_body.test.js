// Element Plus renders a dialog or a drawer where it is written unless it has
// `append-to-body`. Inside a `position: sticky` or `transform` ancestor (the
// header, the cards) the overlay's z-index only counts within that stacking
// context, so the icons and avatars of the page behind paint over it: the
// follower list showed seven of them above its own title bar. Teleporting it to
// <body> puts it above everything, whatever its ancestors do.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function vueFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) vueFiles(path, out);
    else if (name.endsWith(".vue")) out.push(path);
  }
  return out;
}

// The opening tag, up to the first `>` outside a quoted attribute value
function openingTags(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, "");
  const tags = [];
  for (const start of text.matchAll(/<el-(?:dialog|drawer)(?=[\s>])/g)) {
    let quote = "";
    let end = start.index;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) quote = char === quote ? "" : quote;
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    tags.push(text.slice(start.index, end + 1));
  }
  return tags;
}

describe("dialogs and drawers", () => {
  const found = vueFiles(join(ROOT, "src")).flatMap((path) =>
    openingTags(readFileSync(path, "utf8")).map((tag) => ({
      file: relative(ROOT, path),
      tag,
    })),
  );

  it("finds them all (the scan itself works)", () => {
    expect(found.length).toBeGreaterThanOrEqual(12);
  });

  it("ignores a tag inside a comment and reads past `>` in an attribute", () => {
    expect(openingTags("<!-- <el-dialog> --><p/>")).toEqual([]);
    expect(
      openingTags(`<el-drawer @close="() => x()" append-to-body>`),
    ).toEqual([`<el-drawer @close="() => x()" append-to-body>`]);
  });

  it.each(found.map((entry) => [entry.file, entry.tag]))(
    "%s teleports to <body>",
    (_file, tag) => {
      expect(tag).toMatch(/\sappend-to-body[\s>=]/);
    },
  );
});
