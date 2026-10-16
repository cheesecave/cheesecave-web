// What the renderer now produces beyond plain Markdown, and that it survives the sanitizer: footnotes, callouts,
// math, heading anchors, and a wrapper for fenced code that carries its language (the copy button is added by
// MarkdownViewer, since the sanitizer refuses <button>).

import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@/utils/markdown";

describe("footnotes", () => {
  it("links a reference to its note, and the note back", () => {
    const html = renderMarkdown("A claim[^1].\n\n[^1]: The source.\n");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain("The source.");
    expect(html).toContain("footnote-backref");
  });
});

describe("callouts", () => {
  it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "%s becomes a titled block",
    (kind) => {
      const html = renderMarkdown(`> [!${kind}]\n> Body text.\n`);
      expect(html).toContain(`markdown-alert-${kind.toLowerCase()}`);
      expect(html).toContain("markdown-alert-title");
      expect(html).toMatch(/<svg[^>]*>/); // its icon survives the sanitizer
      expect(html).toContain("Body text.");
    },
  );

  it("leaves an ordinary quote alone", () => {
    const html = renderMarkdown("> Just a quote.\n");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("markdown-alert");
  });
});

describe("math", () => {
  it("renders inline and display math with KaTeX", () => {
    expect(renderMarkdown("Inline $E = mc^2$ here.")).toContain(
      'class="katex"',
    );
    expect(renderMarkdown("$$\n\\int_0^1 x\\,dx\n$$")).toContain(
      "katex-display",
    );
  });

  it("shows a formula it cannot read instead of failing the whole document", () => {
    const html = renderMarkdown("Broken $\\frac{1$ and fine text after.");
    expect(html).toContain("fine text after.");
  });

  it("does not take a price for a formula", () => {
    const html = renderMarkdown("It costs 5 dollars, or $5 today.");
    expect(html).not.toContain("katex");
  });
});

describe("heading anchors", () => {
  it("gives each heading an id and a labelled link to it", () => {
    const html = renderMarkdown("## Usage\n\n## Usage\n");
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["user-content-usage", "user-content-usage-1"]);
    expect(html).toContain('class="heading-anchor"');
    expect(html).toContain('aria-label="Link to this section"');
  });
});

describe("fenced code", () => {
  it("is wrapped, labelled with its language, and highlighted", () => {
    const html = renderMarkdown('```python\nprint("hi")\n```\n');
    expect(html).toContain('<div class="code-block" data-lang="python">');
    expect(html).toContain('<span class="code-lang">python</span>');
    expect(html).toContain("hljs-");
    expect(html).toContain("language-python");
  });

  it("says text for a block with no language, and escapes what it shows", () => {
    const html = renderMarkdown("```\n<b>not bold</b>\n```\n");
    expect(html).toContain('data-lang="text"');
    expect(html).toContain("&lt;b&gt;not bold&lt;/b&gt;");
    expect(html).not.toContain("<b>not bold");
  });

  it("leaves a Mermaid block for the viewer to draw", () => {
    const html = renderMarkdown("```mermaid\ngraph TD; A-->B\n```\n");
    expect(html).toContain("language-mermaid");
    expect(html).not.toContain("code-block");
  });

  it("does not let a language name break out of its attribute", () => {
    const html = renderMarkdown(
      '```"><img src=x onerror=alert(1)>\ncode\n```\n',
    );
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });
});

describe("the sanitizer", () => {
  it("still refuses a button, a script and inline handlers from the document itself", () => {
    const html = renderMarkdown(
      '<button onclick="steal()">go</button><script>steal()</script><a href="#" onclick="steal()">x</a>\n',
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("keeps the id of a heading named like a property of document, thanks to the prefix", () => {
    for (const name of ["Title", "Images", "Forms", "Location", "Name"]) {
      const html = renderMarkdown(`## ${name}\n`);
      expect(html).toContain(`id="user-content-${name.toLowerCase()}"`);
    }
  });

  it("keeps what the new markup needs: svg icons, aria labels, data attributes, ids", () => {
    const html = renderMarkdown("## Title\n\n```js\n1\n```\n");
    expect(html).toContain("<svg");
    expect(html).toContain("aria-label=");
    expect(html).toContain("data-lang=");
    expect(html).toContain('id="user-content-title"');
  });
});

describe("an empty fenced block", () => {
  it("still gets its wrapper, labelled text", () => {
    const html = renderMarkdown("```\n```\n");
    expect(html).toContain('class="code-block" data-lang="text"');
  });
});
