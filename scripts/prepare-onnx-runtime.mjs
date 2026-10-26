import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageEntry = fileURLToPath(import.meta.resolve("onnxruntime-web"));
const packageRoot = dirname(dirname(packageEntry));
const packageInfo = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);
if (packageInfo.version !== "1.30.0") {
  throw new Error(
    "Review the ONNX runtime asset list and notices before changing version 1.30.0.",
  );
}

// The inference worker uses these two ESM entry points with external WASM.
// In ORT 1.30.0 WebGPU selects the asyncify backend; WASM selects the standard backend.
const assetNames = [
  "ort.wasm.min.mjs",
  "ort.webgpu.min.mjs",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];
const target = join(root, "public/onnx/vendor");
await mkdir(target, { recursive: true });
const files = [];
for (const name of assetNames) {
  const source = join(packageRoot, "dist", name);
  const bytes = await readFile(source);
  await copyFile(source, join(target, name));
  files.push({
    name,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  join(target, "runtime-assets.json"),
  JSON.stringify({ version: packageInfo.version, files }, null, 2) + "\n",
);

const licenses = join(root, "public/onnx/licenses");
await mkdir(licenses, { recursive: true });
for (const [source, name] of [
  ["vendor-src/form-create/LICENSE", "FormCreate-MIT.txt"],
  ["vendor-src/form-create-designer/LICENSE", "FcDesigner-MIT.txt"],
  ["vendor-src/onnxruntime/LICENSE", "ONNX-Runtime-MIT.txt"],
  [
    "vendor-src/onnxruntime/ThirdPartyNotices.txt",
    "ONNX-Runtime-ThirdPartyNotices.txt",
  ],
  ["vendor-src/THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]) {
  await copyFile(join(root, source), join(licenses, name));
}
console.log(
  `Prepared ${files.length} self-hosted ONNX Runtime ${packageInfo.version} assets (${files.reduce((sum, file) => sum + file.bytes, 0)} bytes)`,
);
