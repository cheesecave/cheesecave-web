// The README styles a site can offer: what they are called, where each look comes from, and how its stylesheet is
// loaded. A style is a stylesheet scoped to `.mdx.s-<id>` (see base.css for the markup contract every style
// covers), loaded only when somebody uses it; a page can hold several at once, which is what the picker does.

export const MARKDOWN_STYLES = Object.freeze([
  {
    id: "github",
    name: "GitHub",
    source: "https://github.com/sindresorhus/github-markdown-css",
    summary: "Familiar and dense: ruled h1 and h2, left-bar callouts.",
  },
  {
    id: "hf",
    name: "Hugging Face",
    source: "https://huggingface.co/openai-community/gpt2",
    summary: "Calm and compact, as on a model card.",
  },
  {
    id: "gitlab",
    name: "GitLab",
    source: "https://gitlab.com/gitlab-org/gitlab",
    summary: "Small product-style text, bordered code with a language bar.",
  },
  {
    id: "vitepress",
    name: "VitePress",
    source: "https://vitepress.dev/guide/markdown",
    summary:
      "Clean documentation: generous spacing, soft code blocks, rounded callouts.",
  },
  {
    id: "docusaurus",
    name: "Docusaurus",
    source: "https://docusaurus.io/docs/markdown-features",
    summary: "Airy and bold, with strong tinted callouts.",
  },
  {
    id: "prose",
    name: "Tailwind prose",
    source: "https://tailwindcss.com/docs/typography-plugin",
    summary: "Neutral editorial look with dark code blocks.",
  },
  {
    id: "rtd",
    name: "Read the Docs",
    source: "https://docs.readthedocs.io/",
    summary: "The classic Sphinx look, callouts with a solid title bar.",
  },
  {
    id: "mdn",
    name: "MDN",
    source: "https://developer.mozilla.org/",
    summary: "High contrast, light-weight headings, a reference-manual feel.",
  },
  {
    id: "ghost",
    name: "Ghost article",
    source: "https://demo.ghost.io/welcome/",
    summary: "Serif long-form reading, dark code blocks.",
  },
  {
    id: "tufte",
    name: "Tufte",
    source: "https://edwardtufte.github.io/tufte-css/",
    summary: "Classic book typography, italic headings, ruled tables.",
  },
]);

export const DEFAULT_MARKDOWN_STYLE = "github";

const IDS = new Set(MARKDOWN_STYLES.map((style) => style.id));
export const isMarkdownStyle = (id) => IDS.has(id);

/** An id the registry knows, else the fallback: a stored or served value can be stale or from a newer release. */
export const normalizeMarkdownStyle = (
  id,
  fallback = DEFAULT_MARKDOWN_STYLE,
) => (isMarkdownStyle(id) ? id : fallback);

// Some styles show the language of a code block above it ("bar") or in the corner ("lang"): a class on the container
const MODIFIERS = { gitlab: "bar", mdn: "bar", vitepress: "lang" };
export const markdownStyleClasses = (id) =>
  ["mdx", `s-${id}`, MODIFIERS[id]].filter(Boolean);

// One lazy loader per stylesheet: the bundler splits each into its own chunk, so a reader pays for one style
const loaders = import.meta.glob("./themes/*.css");
const loading = new Map();

/** Load a style's stylesheet (once); resolves when it is applied. */
export function loadMarkdownStyle(id) {
  const style = normalizeMarkdownStyle(id);
  if (!loading.has(style)) {
    const load = loaders[`./themes/${style}.css`];
    loading.set(
      style,
      load().then(() => style),
    );
  }
  return loading.get(style);
}
