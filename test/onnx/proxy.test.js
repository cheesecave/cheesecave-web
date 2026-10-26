import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect } from "vitest";

it("proxies typed Space LFS requests while leaving App and editor URLs in the SPA", () => {
  const source = readFileSync(resolve("nginx.conf"), "utf8");
  const location = [...source.matchAll(/location ~ (.+) \{([^}]+)\}/g)].find(
    (match) => match[2].includes("proxy_pass"),
  );
  const pattern = new RegExp(location[1]);
  expect(pattern.test("/spaces/alice/demo.git/info/lfs/objects/batch")).toBe(
    true,
  );
  expect(pattern.test("/datasets/alice/data.git/info/lfs/objects/batch")).toBe(
    true,
  );
  expect(pattern.test("/alice/model.git/info/lfs/objects/batch")).toBe(true);
  expect(pattern.test("/spaces/alice/demo/resolve/main/model.onnx")).toBe(true);
  expect(pattern.test("/spaces/alice/demo/onnx-editor/main")).toBe(false);
  expect(pattern.test("/spaces/alice/demo")).toBe(false);
});
