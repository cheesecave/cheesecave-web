import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  brokenButtons,
  checkButtonCascade,
  main,
  stylesheets,
} from "../../scripts/check-button-cascade.mjs";

// Element Plus buttons lost their background in production only: the build
// links Element Plus's chunk first (vite.config.js manualChunks) and the
// app's stylesheet after it, so the Tailwind reset's
// `[type=button]{background-color:transparent}`, as specific as
// `.el-button`, won by coming later. Danger and warning buttons were white
// text on nothing. The dev server injects styles in import order and looked
// right. These run the real stylesheets in Chrome, in the order the build
// links them.

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SCRIPT = join(ROOT, "scripts/check-button-cascade.mjs");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const RESET = "node_modules/@unocss/reset/tailwind.css";

// src/styles/reset.css as the build inlines it (`@import … layer(reset)`)
const appResetCss = () =>
  read("src/styles/reset.css").replace(
    JSON.stringify("@unocss/reset/tailwind.css"),
    JSON.stringify(pathToFileURL(join(ROOT, RESET)).href),
  );

const dists = [];
function dist(appCss) {
  const dir = mkdtempSync(join(tmpdir(), "button-cascade-"));
  dists.push(dir);
  mkdirSync(join(dir, "assets"));
  writeFileSync(
    join(dir, "assets/element-plus.css"),
    read("node_modules/element-plus/dist/index.css"),
  );
  writeFileSync(join(dir, "assets/index.css"), appCss);
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/element-plus.js">
    <link rel="stylesheet" crossorigin href="/assets/element-plus.css">
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  </head>
  <body><div id="app"></div></body>
</html>`,
  );
  return dir;
}

afterEach(() => {
  for (const dir of dists.splice(0)) rmSync(dir, { recursive: true });
  vi.restoreAllMocks();
});

describe("button backgrounds in the production cascade", () => {
  it("an unlayered reset linked after Element Plus blanks the buttons", () => {
    const broken = checkButtonCascade(dist(read(RESET))).map((b) => b.cls);
    expect(broken).toEqual(
      expect.arrayContaining([
        "el-button",
        "el-button el-button--warning",
        "el-button el-button--danger",
        "el-button el-button--primary el-button--danger",
      ]),
    );
  }, 30000);

  it("the app's reset and theme keep every button's own background", () => {
    // The site theme recolors primary buttons; a message box's danger
    // confirm button is primary too and has to stay red
    const css = appResetCss() + read("src/style.css");
    expect(checkButtonCascade(dist(css))).toEqual([]);
  }, 30000);

  it("fails when the stylesheets give the buttons no background at all", () => {
    // A harness whose links resolve to nothing must not pass
    const dir = dist("");
    writeFileSync(join(dir, "assets/element-plus.css"), "");
    expect(checkButtonCascade(dir)).not.toEqual([]);
  }, 30000);

  it("runs from the command line against a build directory", async () => {
    const dir = dist(appResetCss() + read("src/style.css"));
    const argv = process.argv;
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [argv[0], SCRIPT, dir];
    try {
      vi.resetModules();
      await import("../../scripts/check-button-cascade.mjs");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = argv;
      process.exitCode = undefined;
    }
  }, 30000);
});

describe("check-button-cascade", () => {
  it("links the build's stylesheets in the order index.html does", () => {
    const html = readFileSync(join(dist(""), "index.html"), "utf8");
    expect(stylesheets(html)).toEqual([
      "assets/element-plus.css",
      "assets/index.css",
    ]);
  });

  it("refuses a page Chrome did not run the harness in", () => {
    expect(() => brokenButtons("<html><body></body></html>")).toThrow(
      "Chrome did not run the harness",
    );
    expect(() => brokenButtons('<pre id="result"></pre>')).toThrow(
      "Chrome did not run the harness",
    );
  });

  it("reports each broken button and exits 1", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = [
      {
        cls: "el-button el-button--danger",
        actual: "rgba(0, 0, 0, 0)",
        expected: "rgb(245, 108, 108)",
      },
    ];
    const run = () => `<pre id="result">${JSON.stringify(broken)}</pre>`;
    expect(main(dist(""), run)).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "el-button el-button--danger: background rgba(0, 0, 0, 0), its own is rgb(245, 108, 108)",
    );
  });

  it("exits 0 when every button keeps its background", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(dist(""), () => '<pre id="result">[]</pre>')).toBe(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^Every Element Plus button keeps its background/),
    );
  });

  it("leaves no harness page behind", () => {
    const dir = dist("");
    expect(() =>
      checkButtonCascade(dir, () => {
        throw new Error("chrome crashed");
      }),
    ).toThrow("chrome crashed");
    expect(() => read(join(dir, "button-cascade.html"))).toThrow();
  });
});
