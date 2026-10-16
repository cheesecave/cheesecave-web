// A repository page has its own <h1>, the repository id. The README rendered below it has its own `# Card`: two
// <h1> on one page. The page shifts the README's headings down one level (`headingOffset`), so the README's `#`
// becomes an <h2>; the default leaves a standalone document as it is.

import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@/utils/markdown";

const SOURCE = "# One\n\n## Two\n\ntext\n\nSetext\n=======\n\n###### Six\n";
const levels = (html) => [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => +m[1]);

describe("renderMarkdown heading levels", () => {
  it("keeps them as written by default", () => {
    expect(levels(renderMarkdown(SOURCE))).toEqual([1, 2, 1, 6]);
  });

  it("moves each down by the offset, to at most h6", () => {
    expect(levels(renderMarkdown(SOURCE, { headingOffset: 1 }))).toEqual([
      2, 3, 2, 6,
    ]);
    expect(levels(renderMarkdown(SOURCE, { headingOffset: 2 }))).toEqual([
      3, 4, 3, 6,
    ]);
  });

  it("closes each heading with the tag it opened with, and keeps the heading's text and id", () => {
    const html = renderMarkdown("# Card & more\n", { headingOffset: 1 });
    expect(html).toMatch(/<h2[^>]*>(?:<a[^>]*>.*?<\/a>\s*)?Card &amp; more<\/h2>/);
    expect(html).not.toContain("</h1>");
  });
});
