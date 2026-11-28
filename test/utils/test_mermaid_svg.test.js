import { describe, expect, it } from "vitest";

import { mermaidErrorBox, sanitizeMermaidSvg } from "@/utils/mermaid-svg";

// Mermaid's output for a node with a click link. In "loose" mode the link target is kept as written.
const svgWithLink = (href, attr = "href") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
  `<a ${attr}="${href}"><text x="5" y="20">Node</text></a></svg>`;

const hrefsOf = (svg) => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return [...doc.querySelectorAll("a")].map(
    (a) =>
      a.getAttribute("href") ??
      a.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
  );
};

describe("sanitizeMermaidSvg: links in a diagram", () => {
  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    [" javascript:alert(1)"],
    ["java&#x09;script:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
  ])("drops a link whose target is %s, in href", (href) => {
    const out = sanitizeMermaidSvg(svgWithLink(href));
    expect(out).not.toMatch(/javascript:|data:text|vbscript:/i);
    expect(hrefsOf(out)).not.toContain(href);
  });

  it("drops a script-scheme link written in xlink:href too", () => {
    const out = sanitizeMermaidSvg(
      svgWithLink("javascript:alert(1)", "xlink:href"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  it.each([
    ["https://example.com/docs"],
    ["http://example.com/"],
    ["mailto:team@example.com"],
    ["#section-two"],
    ["docs/usage.md"],
  ])("keeps a safe link to %s", (href) => {
    const out = sanitizeMermaidSvg(svgWithLink(href));
    expect(hrefsOf(out)).toContain(href);
  });

  it("keeps the diagram itself: the text and the svg structure stay", () => {
    const out = sanitizeMermaidSvg(svgWithLink("javascript:alert(1)"));
    expect(out).toContain("<svg");
    expect(out).toContain(">Node<");
  });

  it("removes script elements and inline handlers", () => {
    const out = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>window.x=1</script>` +
        `<rect onload="window.x=2" width="10" height="10"/><text>ok</text></svg>`,
    );
    expect(out).not.toMatch(/<script|onload|window\.x/i);
    expect(out).toContain("<rect");
    expect(out).toContain(">ok<");
  });

  it("returns an empty string for nothing", () => {
    expect(sanitizeMermaidSvg("")).toBe("");
    expect(sanitizeMermaidSvg(undefined)).toBe("");
  });
});

describe("mermaidErrorBox: the error text is text, never markup", () => {
  it("shows the message as text and creates no element from it", () => {
    const box = mermaidErrorBox(
      `bad <img src=x onerror="window.pwned=1"> line`,
    );
    expect(box.textContent).toContain("bad <img src=x onerror=");
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("[onerror]")).toBeNull();
  });

  it("keeps the fixed heading of the error box", () => {
    const box = mermaidErrorBox("x");
    expect(box.className).toBe("mermaid-error");
    expect(box.textContent).toContain("Mermaid Rendering Error");
  });
});
