import { describe, expect, it } from "vitest";

import { csvField, formatDuration, formatNumber, formatStep, logTicks, nearestIndex, niceTicks, reduceToColumns, smooth } from "@/utils/metrics-math";

describe("smooth", () => {
  it("is the identity at weight 0", () => {
    const v = [1, 2, 3];
    expect(smooth(v, 0)).toBe(v);
  });
  it("does not drag a constant series towards zero (the start bias is removed)", () => {
    for (const x of smooth([5, 5, 5, 5], 0.9)) expect(x).toBeCloseTo(5, 10);
  });
  it("follows the exponential moving average", () => {
    const [a, b] = smooth([0, 10], 0.5);
    expect(a).toBe(0);
    expect(b).toBeCloseTo((0.5 * 0.5 * 0 + 0.5 * 10) / (1 - 0.25), 10);
  });
  it("keeps gaps and does not let them poison the average", () => {
    const out = smooth([1, NaN, 1], 0.5);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(out[2]).toBeCloseTo(1, 10);
  });
});

describe("ticks and formats", () => {
  it("picks 1-2-5 ticks inside the range", () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0.1, 0.35, 4)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
  it("picks powers of ten for a log axis", () => {
    expect(logTicks(0.5, 2000)).toEqual([1, 10, 100, 1000]);
    expect(logTicks(0, 5)).toEqual([]);
  });
  it("formats numbers, steps and durations", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(0.123456)).toBe("0.1235");
    expect(formatNumber(12345)).toBe("12,345");
    expect(formatNumber(0.0001234)).toBe("1.23e-4");
    expect(formatNumber(Infinity)).toBe("Infinity");
    expect(formatStep(500)).toBe("500");
    expect(formatStep(25000)).toBe("25k");
    expect(formatStep(2500000)).toBe("2.5M");
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(7200)).toBe("2.0h");
    expect(formatDuration(3 * 86400)).toBe("3.0d");
  });
});

describe("reduceToColumns", () => {
  it("leaves a series that already fits alone", () => {
    expect(reduceToColumns([0, 1, 2], [0, 1, 2], 10, 0, 2)).toBeNull();
  });
  it("keeps the spike of a long series", () => {
    const n = 10000;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = x.map((i) => (i === 4321 ? 1000 : 1));
    const kept = reduceToColumns(x, y, 100, 0, n - 1);
    expect(kept.length).toBeLessThanOrEqual(400);
    expect(kept).toContain(4321);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(n - 1);
    expect([...kept].sort((a, b) => a - b)).toEqual(kept); // still in order
  });
});

describe("nearestIndex", () => {
  it("finds the closest x, on either side, and handles the ends", () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 4)).toBe(0);
    expect(nearestIndex(xs, 6)).toBe(1);
    expect(nearestIndex(xs, 99)).toBe(3);
    expect(nearestIndex([], 1)).toBe(-1);
    expect(nearestIndex(Float64Array.of(1, 2, 3), 2.4)).toBe(1);
  });
});

describe("csvField", () => {
  it("quotes the CSV way: embedded quotes are doubled", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a,b\nc")).toBe('"a,b\nc"');
    expect(csvField("runs/plain")).toBe('"runs/plain"');
  });
  it("defuses a value a spreadsheet would run as a formula", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvField(evil).startsWith(`"'`)).toBe(true);
    }
  });
  it("accepts a number", () => {
    expect(csvField(12)).toBe('"12"');
  });
});
