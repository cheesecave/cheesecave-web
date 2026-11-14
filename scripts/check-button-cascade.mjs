/**
 * Every Element Plus button in a production build keeps the background its
 * own type gives it, checked in Chrome against the built stylesheets, linked
 * in the order index.html links them.
 *
 * The build links Element Plus's chunk first (vite.config.js manualChunks)
 * and the app's stylesheet after it, so any app rule as specific as
 * `.el-button` wins by coming later. The dev server injects styles in import
 * order and does not show it.
 *
 * usage: node scripts/check-button-cascade.mjs dist
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Each type the pages use, plain, disabled, and a message box's confirm
// button, which carries `el-button--primary` next to its confirmButtonClass
const SAMPLES = [
  "el-button",
  "el-button el-button--primary",
  "el-button el-button--success",
  "el-button el-button--warning",
  "el-button el-button--danger",
  "el-button el-button--info",
  "el-button is-plain",
  "el-button el-button--danger is-plain",
  "el-button el-button--danger is-disabled",
  "el-button el-button--primary el-button--danger",
  "el-button el-button--primary el-button--warning",
];

// The bundled light theme, as applySiteTheme sets it on <html>
const harness = (hrefs) => `<!doctype html>
<html data-site-theme="light" style="--site-primary:#94621f;--site-primary-text:#eef0e7;--el-color-primary:#94621f">
<head>${hrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head>
<body>
${SAMPLES.map((cls) => `<button type="button" class="${cls}">Button</button>`).join("\n")}
<pre id="result"></pre>
<script>
const broken = [];
for (const button of document.querySelectorAll("button")) {
  const own = button.matches(".is-disabled") ? "--el-button-disabled-bg-color" : "--el-button-bg-color";
  const probe = button.appendChild(document.createElement("span"));
  probe.style.backgroundColor = "var(" + own + ")";
  const expected = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const actual = getComputedStyle(button).backgroundColor;
  // No background of its own means Element Plus's stylesheet never applied
  if (actual !== expected || expected === "rgba(0, 0, 0, 0)")
    broken.push({ cls: button.className, actual, expected });
}
document.getElementById("result").textContent = JSON.stringify(broken);
</script>
</body>
</html>`;

export const stylesheets = (indexHtml) =>
  [...indexHtml.matchAll(/<link rel="stylesheet"[^>]* href="\/?([^"]+)"/g)].map(
    (link) => link[1],
  );

export function brokenButtons(dom) {
  const result = /<pre id="result">(.+?)<\/pre>/s.exec(dom);
  if (!result) throw new Error("Chrome did not run the harness");
  return JSON.parse(result[1]);
}

function browserCandidates(env, platform) {
  if (env.CHROME_BIN) return [env.CHROME_BIN];
  if (platform === "win32") {
    const programs = [
      env.ProgramFiles || "C:\\Program Files",
      env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    ];
    const local = env.LOCALAPPDATA ? [env.LOCALAPPDATA] : [];
    return [
      ...[...programs, ...local].map((root) =>
        win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      ),
      ...[...programs, ...local].map((root) =>
        win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ),
      "chrome.exe",
      "chromium.exe",
      "msedge.exe",
    ];
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "google-chrome",
      "chromium",
      "microsoft-edge",
    ];
  }
  return [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
  ];
}

export function runBrowser(
  url,
  { env = process.env, platform = process.platform, run = execFileSync } = {},
) {
  // An isolated profile prevents an already-open browser from taking over the
  // headless request and keeps this check independent of the user's cookies.
  const profileRoot = resolve(tmpdir());
  const profile = mkdtempSync(join(profileRoot, "button-cascade-browser-"));
  let missing;
  try {
    for (const executable of browserCandidates(env, platform)) {
      try {
        return run(
          executable,
          [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            `--user-data-dir=${profile}`,
            "--dump-dom",
            url,
          ],
          {
            encoding: "utf8",
            stdio: "pipe",
            windowsHide: true,
            timeout: 30000,
          },
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        missing = error;
      }
    }
    throw new Error(
      "No Chrome, Chromium or Edge executable found. Set CHROME_BIN to its executable path.",
      { cause: missing },
    );
  } finally {
    if (dirname(resolve(profile)) !== profileRoot)
      throw new Error("Browser profile escaped its temporary directory.");
    rmSync(profile, { recursive: true, force: true });
  }
}

export function checkButtonCascade(dist, run = runBrowser) {
  const page = join(dist, "button-cascade.html");
  const hrefs = stylesheets(readFileSync(join(dist, "index.html"), "utf8"));
  writeFileSync(page, harness(hrefs));
  try {
    return brokenButtons(run(pathToFileURL(page).href));
  } finally {
    rmSync(page);
  }
}

export function main(dist, run) {
  const broken = checkButtonCascade(dist, run);
  for (const { cls, actual, expected } of broken)
    console.error(`${cls}: background ${actual}, its own is ${expected}`);
  if (broken.length) return 1;
  console.log(
    `Every Element Plus button keeps its background (${SAMPLES.length} kinds)`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv[2]);
