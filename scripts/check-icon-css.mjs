/**
 * Every icon class the source spells out has a rule in the built stylesheets.
 *
 * UnoCSS only generates the classes it finds in the files it scans, and by
 * default it does not scan plain `.js`. An icon named only in a `.js` file
 * (a menu table, an error-page copy table) renders as nothing: no rule, no
 * warning, an empty box. `content.filesystem` in uno.config.js reads them;
 * this checks the result in the build.
 *
 * usage: node scripts/check-icon-css.mjs dist
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ICON = /\bi-(?:carbon|ep)-[a-z0-9-]*[a-z0-9]/g;

function files(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, pattern, out);
    else if (pattern.test(entry.name)) out.push(path);
  }
  return out;
}

export const iconClasses = (src) =>
  new Set(
    files(src, /\.(vue|js)$/).flatMap(
      (file) => readFileSync(file, "utf8").match(ICON) ?? [],
    ),
  );

export function missingIcons(src, dist) {
  const css = files(dist, /\.css$/)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  // Icons with the same drawing share a rule: `.i-carbon-asleep,.i-carbon-moon{`
  return [...iconClasses(src)].filter(
    (name) => !new RegExp(`\\.${name}(?=[{,])`).test(css),
  );
}

export function main(dist, src = "src") {
  const missing = missingIcons(src, dist);
  for (const name of missing) console.error(`${name}: no rule in ${dist}`);
  if (missing.length) return 1;
  console.log(
    `Every icon class in ${src} has a rule (${iconClasses(src).size})`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv[2]);
