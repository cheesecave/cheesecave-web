import { describe, expect, it } from "vitest";
import { controlledPreviewText } from "@/utils/controlled-preview-text";
describe("controlled row data as ordinary file text", () => {
  it("quotes CSV separators, quotes and cell newlines without interpreting HTML", () => {
    const data = controlledPreviewText(
      {
        kind: "rows",
        columns: ["name", "note"],
        rows: [
          ["<img src=x>", 'a,b "q"'],
          ["line1\nline2", null],
        ],
        truncated: true,
      },
      "sample.csv",
    );
    expect(data).toEqual({
      kind: "text",
      text: 'name,note\n<img src=x>,"a,b ""q"""\n"line1\nline2",\n',
      truncated: true,
    });
  });
  it("quotes TSV tabs and escapes nonprinting control text", () => {
    expect(
      controlledPreviewText(
        {
          kind: "rows",
          columns: ["a", "b"],
          rows: [["one\ttwo", "zero\u0000end"]],
        },
        "sample.tsv",
      ).text,
    ).toBe('a\tb\n"one\ttwo"\tzero\\u0000end\n');
  });
  it("serializes only provided JSONL columns and preserves unusual keys as data", () => {
    const data = controlledPreviewText(
      {
        kind: "rows",
        columns: ["__proto__", "note"],
        rows: [
          { __proto__: null, note: "<svg>\n", ignored: "secret" },
          ["safe", "nul\u0000"],
        ],
      },
      "sample.jsonl",
    );
    expect(
      data.text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { ["__proto__"]: "", note: "<svg>\n" },
      { ["__proto__"]: "safe", note: "nul\u0000" },
    ]);
    expect(data.text).not.toContain("secret");
    expect({}.note).toBeUndefined();
  });
  it("retains backend limits and marks omitted extra rows or columns", () => {
    const data = controlledPreviewText(
      {
        kind: "rows",
        columns: Array.from({ length: 21 }, (_, i) => String(i)),
        rows: Array.from({ length: 21 }, () => Array(21).fill("x")),
      },
      "sample.csv",
    );
    expect(data.text.trimEnd().split("\n")).toHaveLength(21);
    expect(data.text.split("\n")[0].split(",")).toHaveLength(20);
    expect(data.truncated).toBe(true);
  });
  it("leaves other controlled preview kinds unchanged", () => {
    const data = { kind: "pdf", page_count: 3 };
    expect(controlledPreviewText(data, "manual.pdf")).toBe(data);
  });
});
