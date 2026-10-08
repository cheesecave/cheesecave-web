import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

describe("default brand icons", () => {
  it("carry the CheeseCave name and no upstream wordmark", () => {
    for (const path of [
      "public/favicon.svg",
      "public/images/logo-square.svg",
      "public/images/logo-banner.svg",
      "public/images/logo-banner-dark.svg",
    ]) {
      expect(read(path)).not.toContain("Kohaku");
    }
    expect(read("public/images/logo-banner.svg")).toContain("Cave");
  });

  it("keeps the served icons identical to the copies used by the docs", () => {
    for (const name of ["logo-square.svg", "logo-banner.svg", "logo-banner-dark.svg"]) {
      expect(read(`public/images/${name}`)).toBe(read(`images/${name}`));
    }
    expect(read("public/favicon.svg")).toBe(read("public/images/logo-square.svg"));
  });
});
