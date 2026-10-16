# Prototype scaffolding: not for merging

- `aliases.js` points the renderer's new plugins (footnotes, anchors, callouts, math) at a scratch install, because
  they are not project dependencies yet and the worktree shares `node_modules` with the main checkout. Replace with
  `pnpm add markdown-it-footnote markdown-it-anchor markdown-it-github-alerts @mdit/plugin-katex katex`.
- `dev-preferences.js` stands in for the backend's per-user preferences endpoint while there is none (dev server only).
