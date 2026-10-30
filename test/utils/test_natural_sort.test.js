// Natural order for names inside an archive: digits compare as numbers, case
// does not decide the order, canonical and decomposed spellings of a name are
// the same name, and ties break the same way for everybody.

import { describe, expect, it } from "vitest";

import { compareNames, sortByName } from "@/utils/natural-sort";

const sorted = (names) => [...names].sort(compareNames);

describe("compareNames", () => {
  it("compares runs of digits as numbers", () => {
    expect(
      sorted(["img_10.png", "img_2.png", "img_1.png", "img_100.png"]),
    ).toEqual(["img_1.png", "img_2.png", "img_10.png", "img_100.png"]);
    expect(sorted(["v1.10.0", "v1.2.0", "v1.9.0"])).toEqual([
      "v1.2.0",
      "v1.9.0",
      "v1.10.0",
    ]);
    expect(
      sorted(["shard-10-of-12", "shard-1-of-12", "shard-2-of-12"]),
    ).toEqual(["shard-1-of-12", "shard-2-of-12", "shard-10-of-12"]);
  });

  it("puts ids of different lengths in numeric order", () => {
    // The members of a real archive, named by id
    expect(
      sorted([
        "10000000.jpeg",
        "1000.jpg",
        "100000.jpg",
        "9950000.png",
        "1000000.png",
        "12575000.jpg",
      ]),
    ).toEqual([
      "1000.jpg",
      "100000.jpg",
      "1000000.png",
      "9950000.png",
      "10000000.jpeg",
      "12575000.jpg",
    ]);
  });

  it("compares digit runs longer than a double can hold", () => {
    expect(
      compareNames("x99999999999999999999", "x100000000000000000000"),
    ).toBeLessThan(0);
    expect(
      compareNames("x100000000000000000000", "x99999999999999999999"),
    ).toBeGreaterThan(0);
  });

  it("does not let case decide the order", () => {
    expect(sorted(["b.txt", "A.txt", "c.txt", "B2.txt", "a2.txt"])).toEqual([
      "A.txt",
      "a2.txt",
      "b.txt",
      "B2.txt",
      "c.txt",
    ]);
  });

  it("breaks a tie the same way every time", () => {
    // Same letters, different case: capitals first, whatever the input order
    expect(sorted(["a.txt", "A.txt"])).toEqual(["A.txt", "a.txt"]);
    expect(sorted(["A.txt", "a.txt"])).toEqual(["A.txt", "a.txt"]);
    // Same number, different zeros
    expect(sorted(["1.png", "01.png", "001.png"])).toEqual(
      sorted(["001.png", "1.png", "01.png"]),
    );
    expect(compareNames("01.png", "1.png")).not.toBe(0);
  });

  it("treats a composed and a decomposed spelling as one name", () => {
    const composed = "caf\u00e9.txt";
    const decomposed = "cafe\u0301.txt";
    expect(compareNames(composed, decomposed)).toBe(0);
    expect(compareNames(decomposed, composed)).toBe(0);
    // Both sit where the composed spelling does: accents are not folded away,
    // so it follows `cafz` by code point, like the listings of GitHub and Hugging Face
    expect(sorted(["cafz.txt", decomposed, "cafa.txt"])).toEqual([
      "cafa.txt",
      "cafz.txt",
      decomposed,
    ]);
    expect(sorted(["cafz.txt", composed, "cafa.txt"])).toEqual([
      "cafa.txt",
      "cafz.txt",
      composed,
    ]);
  });

  it("gives a tie-break that is the same from either side", () => {
    expect(compareNames("A.txt", "a.txt")).toBeLessThan(0);
    expect(compareNames("a.txt", "A.txt")).toBeGreaterThan(0);
  });

  it("returns 0 only for the same name", () => {
    expect(compareNames("same.txt", "same.txt")).toBe(0);
    expect(compareNames("a", "b")).toBeLessThan(0);
    expect(compareNames("b", "a")).toBeGreaterThan(0);
  });

  it("keeps hidden and underscore names in front of letters", () => {
    expect(sorted(["zebra.txt", "_private", ".hidden", "a.txt"])).toEqual([
      ".hidden",
      "_private",
      "a.txt",
      "zebra.txt",
    ]);
  });

  it("orders names in other scripts by number too", () => {
    expect(sorted(["测试10.txt", "测试2.txt", "测试1.txt"])).toEqual([
      "测试1.txt",
      "测试2.txt",
      "测试10.txt",
    ]);
  });
});

describe("sortByName", () => {
  it("sorts a copy of an array of strings", () => {
    const input = ["b10", "b2", "a1"];
    const result = sortByName(input);
    expect(result).toEqual(["a1", "b2", "b10"]);
    expect(input).toEqual(["b10", "b2", "a1"]);
    expect(result).not.toBe(input);
  });

  it("sorts items by the name a getter returns", () => {
    const items = [
      { name: "page10", id: 1 },
      { name: "page2", id: 2 },
      { name: "Page1", id: 3 },
    ];
    expect(sortByName(items, (item) => item.name).map((i) => i.id)).toEqual([
      3, 2, 1,
    ]);
  });

  it("gives the same order as sorting with the comparator", () => {
    const names = [];
    for (let i = 0; i < 400; i++) {
      names.push(
        `dir${(i * 37) % 23}/img_${(i * 7919) % 1009}.${i % 3 ? "png" : "JPG"}`,
      );
    }
    expect(sortByName(names)).toEqual([...names].sort(compareNames));
  });

  it("keeps items with the same name in their input order", () => {
    const items = [
      { name: "x", n: 1 },
      { name: "x", n: 2 },
      { name: "x", n: 3 },
    ];
    expect(sortByName(items, (i) => i.name).map((i) => i.n)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for an empty one", () => {
    expect(sortByName([])).toEqual([]);
  });
});
