// No source under src/ may carry the Kohaku Software License.
//
// The dataset viewer was the only component under that separate, non-commercial
// license and it is removed. This keeps a copy from slipping back in: a LICENSE
// file that names it, or a source file that says it is licensed under it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../src");
const MARKER = "kohaku software license";
// LICENSE, LICENSE.md, LICENSE.txt: not a component such as LicenseCard.vue
const LICENSE_FILE = /^LICENSE(\.[a-z]+)?$/i;
const TEXT_EXTENSIONS = new Set([".js", ".vue", ".ts", ".md", ".json", ".css", ".txt", ".html"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const files = [...walk(SRC)];

describe("license guard", () => {
  it("has sources to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no source or license file names the Kohaku Software License", () => {
    const offenders = files
      .filter((path) => {
        const name = path.split("/").pop();
        const text = LICENSE_FILE.test(name) || TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf(".")));
        return text && readFileSync(path, "utf8").toLowerCase().includes(MARKER);
      })
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  it("only vendored third-party code carries its own LICENSE file under src", () => {
    const licenses = files
      .filter((path) => LICENSE_FILE.test(path.split("/").pop()))
      .map((path) => relative(SRC, path));
    expect(licenses.filter((path) => !path.startsWith("vendor/"))).toEqual([]);
  });
});
