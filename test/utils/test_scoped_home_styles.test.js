import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import heroSource from "../../src/shared/components/HomepageHero.vue?raw";
import workspaceSource from "../../src/components/home/WorkspacePanel.vue?raw";
import sidebarSource from "../../src/components/home/workspace/WorkspaceSidebar.vue?raw";
import feedSource from "../../src/components/home/workspace/WorkspaceFeed.vue?raw";
import trendingSource from "../../src/components/home/workspace/WorkspaceTrending.vue?raw";
import markdownSource from "../../src/components/common/MarkdownViewer.vue?raw";
import previewSource from "../../src/components/home/RepositoryPreviewColumn.vue?raw";

// Resolve the same Vue compiler used by this app without the runtime Vue alias.
const require = createRequire(resolve(process.cwd(), "package.json"));
const { compileStyle, parse } = require("vue/compiler-sfc");
const scope = "data-v-home-style-regression";
let style;
let fixture;
let rootClass;

beforeEach(() => {
  rootClass = document.documentElement.className;
});

function compile(source) {
  const { descriptor, errors } = parse(source);
  expect(errors).toEqual([]);
  return descriptor.styles
    .map((block) => {
      const result = compileStyle({
        source: block.content,
        scoped: block.scoped,
        id: scope,
      });
      expect(result.errors).toEqual([]);
      return result.code;
    })
    .join("\n");
}

function renderStyled(source, markup) {
  style = document.createElement("style");
  style.textContent = (Array.isArray(source) ? source : [source])
    .map(compile)
    .join("\n");
  document.head.append(style);
  fixture = document.createElement("div");
  fixture.innerHTML = markup;
  document.body.append(fixture);
  return (selector) => getComputedStyle(fixture.querySelector(selector));
}

afterEach(() => {
  style?.remove();
  fixture?.remove();
  document.documentElement.className = rootClass;
});

describe("home component scoped dark styles", () => {
  it.each([
    ["shared homepage hero", heroSource],
    ["authenticated workspace", workspaceSource],
    ["workspace sidebar", sidebarSource],
    ["workspace feed", feedSource],
    ["workspace trending", trendingSource],
    ["markdown viewer", markdownSource],
    ["visitor discovery", previewSource],
  ])(
    "keeps every %s dark rule attached to a scoped descendant",
    (name, source) => {
      const code = compile(source);
      expect(code).not.toMatch(/(?:^|\})\s*\.dark\s*\{/);
      const rules = [...code.matchAll(/([^{}]+)\{/g)]
        .map((match) => match[1].trim())
        .filter((selector) => selector.startsWith(".dark"));
      for (const selector of rules) {
        expect(selector).toMatch(/^\.dark\s+\./);
        expect(selector).toContain(`[${scope}]`);
      }
    },
  );

  // jsdom does not resolve CSS var() values. Check selector containment here;
  // actual fallback/configured colors and responsive rings are checked in Chrome.
  it("does not apply the hero surface or illustration shadow to its preview wrapper", () => {
    const styles = renderStyled(
      heroSource,
      `<div class="dark preview"><article class="homepage-hero" ${scope}><div class="hero-art" ${scope}><div class="art-orbit" ${scope}></div></div></article></div><article class="homepage-hero outside-scope"></article>`,
    );
    expect(styles(".preview").boxShadow).not.toContain("36px");
    expect(styles(".preview").backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(styles(".outside-scope").backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps workspace theme aliases inside its scoped surface", () => {
    const styles = renderStyled(
      workspaceSource,
      `<div class="dark preview"><section class="workspace" ${scope}></section><section class="workspace outside-scope"></section></div>`,
    );
    expect(styles(".workspace").getPropertyValue("--ws-surface").trim()).toBe(
      "var(--site-card, #282e27)",
    );
    expect(styles(".workspace").getPropertyValue("--ws-bg").trim()).toBe(
      "var(--site-bg, #1c211d)",
    );
    expect(styles(".preview").backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(styles(".outside-scope").getPropertyValue("--ws-surface")).toBe("");
  });
  it.each([false, true])(
    "keeps discovery category icons distinct and muted in dark=%s",
    (dark) => {
      document.documentElement.classList.toggle("dark", dark);
      const styles = renderStyled(
        previewSource,
        `<div class="discovery-section" ${scope}><i class="discovery-model-icon" ${scope}></i><i class="discovery-dataset-icon" ${scope}></i><i class="discovery-space-icon" ${scope}></i></div>`,
      );
      expect(styles(".discovery-model-icon").color).toBe(
        dark ? "rgb(160, 184, 187)" : "rgb(84, 115, 122)",
      );
      expect(styles(".discovery-dataset-icon").color).toBe(
        dark ? "rgb(171, 190, 143)" : "rgb(102, 121, 75)",
      );
      expect(styles(".discovery-space-icon").color).toBe(
        dark ? "rgb(195, 167, 206)" : "rgb(133, 112, 140)",
      );
    },
  );

  it("styles dark markdown content without changing the document root's background, border or quote color", () => {
    document.documentElement.classList.add("dark");
    const properties = [
      "backgroundColor",
      "borderBottomColor",
      "borderLeftColor",
      "color",
    ];
    const snapshotRoot = () => {
      const computed = getComputedStyle(document.documentElement);
      return properties.map((property) => computed[property]);
    };
    const before = snapshotRoot();
    const styles = renderStyled(
      markdownSource,
      `<section class="markdown-body" ${scope}><h1>Heading</h1><pre>Code block</pre><code>Inline code</code><table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table><blockquote>Quote</blockquote><a href="/docs">Docs</a></section><section class="markdown-body outside-scope"><pre>Unrelated</pre></section>`,
    );
    expect(styles("h1").borderBottomColor).toBe("rgba(255, 255, 255, 0.1)");
    expect(styles("pre").backgroundColor).toBe("rgba(0, 0, 0, 0.3)");
    expect(styles("code").backgroundColor).toBe("rgba(255, 255, 255, 0.1)");
    expect(styles("th").backgroundColor).toBe("rgba(0, 0, 0, 0.3)");
    expect(styles("td").borderLeftColor).toBe("rgba(255, 255, 255, 0.1)");
    expect(styles("blockquote").color).toBe("rgb(139, 148, 158)");
    expect(styles("blockquote").borderLeftColor).toBe(
      "rgba(255, 255, 255, 0.2)",
    );
    expect(styles("a").color).toBe("rgb(88, 166, 255)");
    expect(styles(".outside-scope pre").backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(snapshotRoot()).toEqual(before);
  });
});
