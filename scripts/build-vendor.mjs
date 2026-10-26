import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

// These aliases deliberately resolve every FormCreate import to checked-in source.
// Only Vue and Element Plus are shared with the host application.
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "vendor-src/form-create");
const designer = path.join(
  root,
  "vendor-src/form-create-designer/packages/element-ui",
);
const renderer = path.join(source, "packages/element-ui");
// Keep the source-only dependency policy enforced when moving this into the Hub.
for (const directory of [root, designer, renderer]) {
  const pkg = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf8"),
  );
  for (const [name, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (name.startsWith("@form-create/") && !version.startsWith("workspace:")) {
      throw new Error(
        `${pkg.name}: ${name} must be a local workspace dependency`,
      );
    }
  }
}
const aliases = [
  {
    find: "@form-create/core",
    replacement: path.join(source, "packages/core"),
  },
  {
    find: "@form-create/utils",
    replacement: path.join(source, "packages/utils"),
  },
  ...["checkbox", "frame", "group", "radio", "select", "tree", "upload"].map(
    (name) => ({
      find: `@form-create/component-elm-${name}`,
      replacement: path.join(source, "components/element-ui", name),
    }),
  ),
  {
    find: "@form-create/component-subform",
    replacement: path.join(source, "components/common/subform"),
  },
];
const report = {
  builtAt: new Date().toISOString(),
  upstream: JSON.parse(
    await fs.readFile(path.join(root, "vendor-src/upstream.json"), "utf8"),
  ),
  builds: [],
};
async function compile({
  name,
  directory,
  entry,
  filename,
  external = [],
  emptyOutDir = true,
  version,
}) {
  const modules = [];
  const buildResult = await build({
    configFile: false,
    root: directory,
    publicDir: false,
    resolve: { alias: aliases, dedupe: ["vue", "element-plus"] },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.VERSION": JSON.stringify(version),
      "process.env.UI": JSON.stringify("element-ui"),
    },
    plugins: [vue(), vueJsx()],
    build: {
      emptyOutDir,
      outDir: path.join(directory, "dist"),
      target: "es2022",
      minify: true,
      sourcemap: false,
      lib: {
        entry: path.join(directory, entry),
        formats: ["es"],
        fileName: () => filename,
        cssFileName: filename.replace(/\.js$/, ""),
      },
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: [
          "vue",
          "element-plus",
          "@element-plus/icons-vue",
          ...external,
        ],
        output: {
          banner: `/*! ${name} ${version}; CheeseCave Element Plus source fork. Copyright xaboy. MIT; see source LICENSE files. */`,
        },
      },
    },
  });
  // Emit normal library assets first, then prepend only the emitted CSS text.
  // This keeps the local packages self-contained without a CSS injection plugin.
  const emitted = (
    Array.isArray(buildResult) ? buildResult : [buildResult]
  ).flatMap((result) => result.output || []);
  modules.push(
    ...new Set(
      emitted
        .filter((item) => item.type === "chunk")
        .flatMap((item) => item.moduleIds || []),
    ),
  );
  const css = emitted
    .filter(
      (asset) => asset.type === "asset" && asset.fileName.endsWith(".css"),
    )
    .map((asset) => String(asset.source))
    .join("\n");
  const outputPath = path.join(directory, "dist", filename);
  const javascript = await fs.readFile(outputPath, "utf8");
  if (!/\bexport\s*\{/.test(javascript))
    throw new Error(`${name}: generated package has no ESM exports`);
  if (css) {
    const inject = `if(typeof document!=="undefined"){const s=document.createElement("style");s.dataset.cheesecaveVendor=${JSON.stringify(name)};s.textContent=${JSON.stringify(css)};document.head.appendChild(s);}\n`;
    await fs.writeFile(outputPath, inject + javascript);
  }
  const portableModules = modules.map((id) =>
    id.replaceAll("\\", "/").replace(root.replaceAll("\\", "/"), ""),
  );
  if (
    portableModules.some((id) =>
      /node_modules\/(?:\.pnpm\/)?@form-create/.test(id),
    )
  ) {
    throw new Error(
      `${name}: unexpectedly bundled a registry FormCreate dependency`,
    );
  }
  report.builds.push({
    name,
    entry,
    output: path
      .relative(root, path.join(directory, "dist", filename))
      .replaceAll("\\", "/"),
    modules: portableModules,
  });
}
await compile({
  name: "@form-create/element-ui",
  directory: renderer,
  entry: "src/index.js",
  filename: "form-create.esm.js",
  version: "3.3.5-cheesecave",
});
await compile({
  name: "@form-create/designer",
  directory: designer,
  entry: "src/index.js",
  filename: "index.es.js",
  version: "3.5.0-cheesecave",
  external: ["@form-create/element-ui"],
});
await compile({
  name: "@form-create/designer/components",
  directory: designer,
  entry: "src/form/index.js",
  filename: "components.es.js",
  version: "3.5.0-cheesecave",
  external: ["@form-create/element-ui"],
  emptyOutDir: false,
});
await fs.writeFile(
  path.join(root, "vendor-src/build-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
