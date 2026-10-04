import { describe, expect, it, vi } from "vitest";
import cardFixtures from "../fixtures/repository_card_frontmatter.json";

import {
  getOtherMetadata,
  getSpecializedFields,
  normalizeMetadata,
  parseYAMLFrontmatter,
} from "@/utils/yaml-parser";

describe("yaml parser utilities", () => {
  it.each(cardFixtures)(
    "matches shared indexing contract: $name",
    ({ source, metadata }) => {
      expect(parseYAMLFrontmatter(source).metadata).toEqual(metadata);
    },
  );
  it.each([
    "\uFEFF---\nlicense: mit\n---\n# Demo\n",
    "---\r\nlicense: mit\r\n---\r\n# Demo\n",
    "---\nlicense: mit\n...\n# Demo\n",
    "---\nlicense: mit\n---",
    "---\nlicense: mit\n...",
  ])("recognizes supported frontmatter boundaries: %j", (source) => {
    const result = parseYAMLFrontmatter(source);
    expect(result.metadata).toEqual({ license: "mit" });
    expect(result.content).toBe(source.includes("# Demo") ? "# Demo\n" : "");
  });

  it("does not interpret a delimiter after ordinary prose as frontmatter", () => {
    const source = "# Demo\n---\nlicense: mit\n---\n";
    expect(parseYAMLFrontmatter(source)).toEqual({
      metadata: {},
      content: source,
    });
  });

  it("treats scalar and sequence YAML as empty metadata", () => {
    expect(parseYAMLFrontmatter("---\nhello\n---\n# Demo").metadata).toEqual(
      {},
    );
    expect(parseYAMLFrontmatter("---\n- hello\n---\n# Demo").metadata).toEqual(
      {},
    );
  });
  it("parses valid frontmatter and leaves plain markdown unchanged", () => {
    const parsed = parseYAMLFrontmatter(
      "---\nlicense: mit\nlanguage: en\n---\n# Demo\n",
    );

    expect(parsed.metadata).toEqual({ license: "mit", language: "en" });
    expect(parsed.content).toBe("# Demo\n");

    expect(parseYAMLFrontmatter("no frontmatter")).toEqual({
      metadata: {},
      content: "no frontmatter",
    });
  });

  it("falls back safely on yaml parse failure", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const parsed = parseYAMLFrontmatter("---\nlicense: [broken\n---\n# Demo\n");

    expect(parsed).toEqual({
      metadata: {},
      content: "---\nlicense: [broken\n---\n# Demo\n",
    });

    errorSpy.mockRestore();
  });

  it("normalizes array-like metadata and extracts other metadata", () => {
    const normalized = normalizeMetadata({
      language: "en",
      tags: "featured",
      metrics: ["f1"],
      custom_field: "value",
    });

    expect(normalized.language).toEqual(["en"]);
    expect(normalized.tags).toEqual(["featured"]);
    expect(normalized.metrics).toEqual(["f1"]);

    const specialized = getSpecializedFields();
    expect(specialized.has("license")).toBe(true);
    expect(specialized.has("tags")).toBe(true);

    expect(
      getOtherMetadata({
        license: "mit",
        custom_field: "value",
        eval_results: [],
      }),
    ).toEqual({ custom_field: "value" });
  });

  it("handles empty markdown and missing metadata values", () => {
    expect(parseYAMLFrontmatter("")).toEqual({
      metadata: {},
      content: "",
    });

    expect(parseYAMLFrontmatter("---\n---\n# Demo\n")).toEqual({
      metadata: {},
      content: "# Demo\n",
    });

    expect(normalizeMetadata(null)).toEqual({});
    expect(getOtherMetadata({})).toEqual({});
  });
});
