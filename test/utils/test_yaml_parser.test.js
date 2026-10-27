import { describe, expect, it, vi } from "vitest";
import cardFixtures from "../fixtures/repository_card_frontmatter.json";

import {
  extractYAMLFrontmatter,
  getOtherMetadata,
  getSpecializedFields,
  normalizeMetadata,
  parseYAMLFrontmatter,
} from "@/utils/yaml-parser";

describe("raw YAML frontmatter extraction", () => {
  it("preserves original YAML order, comments, indentation, and spelling", () => {
    const source = "# Repository card\ntags:\n  - Featured\nlicense: 'mit'\n";
    const content = "\n# Demo\n\n---\nMore prose.\n";
    expect(extractYAMLFrontmatter(`---\n${source}---\n${content}`)).toEqual({
      source,
      content,
    });
  });

  it.each([
    ["\uFEFF---\nlicense: mit\n---\n# Demo", "license: mit\n", "# Demo"],
    ["---\r\nlicense: mit\r\n---\r\n# Demo", "license: mit\r\n", "# Demo"],
    ["---\nlicense: mit\n...\n# Demo", "license: mit\n", "# Demo"],
    ["---\nlicense: mit\n---", "license: mit\n", ""],
    ["---\nlicense: mit\n...", "license: mit\n", ""],
    ["---\n---\n# Demo", "", "# Demo"],
  ])(
    "extracts supported boundaries without normalizing source: %j",
    (markdown, source, content) => {
      expect(extractYAMLFrontmatter(markdown)).toEqual({ source, content });
    },
  );

  it.each([
    "",
    "# Demo\n---\nlicense: mit\n---\n",
    "---\nlicense: mit\n# Demo",
    "---\nlicense: mit\n----\n# Demo",
  ])(
    "does not extract a missing or incomplete opening block: %j",
    (markdown) => {
      expect(extractYAMLFrontmatter(markdown)).toBeNull();
    },
  );

  it("extracts invalid YAML for display while parsed metadata preserves the original document", () => {
    const source = "license: [broken\n";
    const content = "# Demo\n";
    const markdown = `---\n${source}---\n${content}`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(extractYAMLFrontmatter(markdown)).toEqual({ source, content });
      expect(parseYAMLFrontmatter(markdown)).toEqual({
        metadata: {},
        content: markdown,
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});

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
