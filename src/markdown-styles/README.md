# README styles

How Markdown looks is a *style*: a small stylesheet the site can offer. The site picks a default (admin), each reader
can pick their own (Settings > Appearance), and `MarkdownViewer` wears whichever is in force.

## Pieces

| | |
|---|---|
| `registry.js` | the list of styles (id, name, source, summary), `normalizeMarkdownStyle`, and `loadMarkdownStyle(id)` (lazy, once) |
| `base.css` | the markup contract every style covers (anchors, code block and its copy button, callouts, footnotes, math, task lists, tables, kbd, details), the dark tokens, and what is not typography (containment of embedded HTML, Mermaid) |
| `themes/<id>.css` | one style: its tokens on `.mdx.s-<id>`, its own touches, its dark tokens on `.dark .mdx.s-<id>` |
| `fonts.css` + `public/fonts/` | the web fonts the styles use, self-hosted; a font is only fetched when a style that uses it is shown |
| `../stores/markdownStyle.js` | the style in force: reader's choice, else the site's default, else `github` |
| `../components/settings/MarkdownStylePicker.vue` | the picker, with a live preview in each style |

## The rules a style follows (enforced by `test/markdown-styles`)

1. Every selector starts with `.mdx.s-<id>` or `.dark .mdx.s-<id>`. A style never touches the page.
2. No `@import`, no `@font-face`: fonts are declared once in `fonts.css`.
3. The file name is the id, and the id is in `registry.js`.
4. A style says how it looks in the dark (or takes the neutral dark tokens of `base.css`, as `github` does).

## Tokens

A style mostly sets CSS variables (`--font`, `--size`, `--fg`, `--link`, `--h1`.., `--pre-bg`, `--bq-*`, `--th-bg`,
`--td-b`, the callout colours `--note --tip --important --warning --caution`, ...) and adds a few rules for what is
its own (RTD's solid callout title bar, Tufte's ruled tables). The defaults are in `base.css`.

Contrast is part of the job: the audit in the prototype checked every style, light and dark, against WCAG AA.
Callout titles take `--title`, a darkened (light) or lightened (dark) mix of the callout colour.

## Adding a style

1. `themes/<id>.css` with its tokens and its dark tokens.
2. An entry in `registry.js` (`MODIFIERS` there if it wants the language above code blocks).
3. Fonts, if any: add the files to `public/fonts/` and their `@font-face` to `fonts.css`.
4. `pnpm test`: the contract test fails for anything that breaks the rules above.

The id also goes wherever ids are listed on the server (see the backend's `ThemeConfig.markdown_style`, a pattern,
not a list, so a new style needs no server change).
