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
4. **The colours are the site's, not the style's.** A style has no grey, no text colour and no link colour of its own:
   it uses the roles `base.css` derives from what the admin set in Site > Theme (see below). The contract test fails for a
   grey or white-or-black literal in a style (`#fff` and `#000` are allowed: mixing targets, text on a coloured bar), and
   for a `.dark` rule that sets text, greys or links. What a style may still set in the dark is the callout hues, the red of
   RTD's inline code and the code block colours of the two styles whose code block is inverted.

## Tokens

A style mostly sets CSS variables for its shapes (`--font`, `--size`, `--h1`.., `--pre-pad`, `--bq-pad`, `--td-pad`, ...)
and adds a few rules for what is its own (RTD's solid callout title bar, Tufte's ruled tables). The defaults are in
`base.css`. For colour it uses roles, never values:

| role | what it is |
|---|---|
| `--fg`, `--hfg` | the README's text (`--site-md-text`) |
| `--muted` | muted text (`--site-md-muted`) |
| `--link` | the primary colour as a link (`--site-md-link`); `--link-deco` is `underline` only where the brand colour cannot be told from the text |
| `--sc`, `--st` | the card the README sits on and its text colour |
| `--n1`, `--n2`, `--n3` | the card tinted 3%, 6% and 11% with `--st`: zebra rows, table header, code block, inline code |
| `--line` | borders and rules (`--site-border`) |
| `--note --tip --important --warning --caution` | the callout hues: semantic, not the brand colour |

`applySiteTheme()` writes the `--site-*` variables on `<html>` for the light or the dark palette in force, so a style needs
no dark rules for these. `--site-md-text`, `--site-md-link` and `--site-md-muted` come from `createThemePalette()` and are
derived so that they clear 4.5:1 on the card and on all its tints, for any palette the admin can enter (a test sweeps 300
random ones). In the middle of the luminance range, where black and white are both barely readable on the card, the tints
are weakened (`--site-md-tint`, 1 down to 0) instead. Every `var(--site-*)` in `base.css` has a fallback, so a page without
site colours looks as before, and where `color-mix()` is not supported the tints are translucent greys.

Callout titles take `--title`, a darkened (light) or lightened (dark) mix of the callout colour.

## Adding a style

1. `themes/<id>.css` with its shape tokens, its colour roles and, if its hues change in the dark, those.
2. An entry in `registry.js` (`MODIFIERS` there if it wants the language above code blocks).
3. Fonts, if any: add the files to `public/fonts/` and their `@font-face` to `fonts.css`.
4. `pnpm test`: the contract test fails for anything that breaks the rules above.

The id also goes wherever ids are listed on the server (see the backend's `ThemeConfig.markdown_style`, a pattern,
not a list, so a new style needs no server change).
