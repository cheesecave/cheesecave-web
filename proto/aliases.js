// PROTOTYPE ONLY. The renderer's new plugins (footnotes, heading anchors, callouts, math) are not dependencies of the
// project yet, and installing them would change the node_modules this worktree shares with the main checkout. Until
// they are added properly (pnpm add), point their names at a scratch install.
const LAB = "/tmp/mdlab/node_modules";
export const protoAliases = {
  "markdown-it-footnote": `${LAB}/markdown-it-footnote/index.mjs`,
  "markdown-it-anchor": `${LAB}/markdown-it-anchor/dist/markdownItAnchor.mjs`,
  "markdown-it-github-alerts": `${LAB}/markdown-it-github-alerts/dist/index.mjs`,
  "@mdit/plugin-katex": `${LAB}/@mdit/plugin-katex/dist/index.js`,
  "katex/dist/katex.min.css": `${LAB}/katex/dist/katex.min.css`,
  katex: `${LAB}/katex/dist/katex.mjs`,
  "@mdit/helper": `${LAB}/@mdit/helper/dist/index.js`,
};
