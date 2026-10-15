// A page keeps one <h1>. Where a README or a Markdown file is rendered under the page's own title, its headings
// are shifted down a level (MarkdownViewer's `heading-offset`); a new place that renders Markdown under a title has
// to say so, or the page gets a second <h1>.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe.each([
  ["the repository page's README", "src/components/repo/RepoViewer.vue"],
  [
    "a Markdown file on the blob page",
    "src/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue",
  ],
])("%s", (_name, file) => {
  it("is rendered a heading level down", () => {
    const source = readFileSync(file, "utf8");
    const viewers = source.match(/<MarkdownViewer\b[^>]*>/gs) ?? [];
    expect(viewers.length).toBeGreaterThan(0);
    for (const tag of viewers) expect(tag).toMatch(/:heading-offset="1"/);
  });
});
