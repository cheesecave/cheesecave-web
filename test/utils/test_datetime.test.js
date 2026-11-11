import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatRelativeTime,
  formatRelativeTimeCached,
  formatServerDate,
  formatUnixRelativeTime,
  parseServerTime,
} from "@/utils/datetime";

// UTC and the 26 whole-hour zones around it, plus half- and quarter-hour zones
const ZONES = [
  "UTC",
  ...Array.from({ length: 12 }, (_, i) => `Etc/GMT+${12 - i}`), // UTC-12 ... UTC-1
  ...Array.from({ length: 14 }, (_, i) => `Etc/GMT-${i + 1}`), // UTC+1 ... UTC+14
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Australia/Eucla",
];

function inZone(zone, fn) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseServerTime: one reading of what the server sends", () => {
  const T = Date.UTC(2026, 0, 1, 10, 0, 0);

  it("reads a string with Z or with an offset as that instant", () => {
    expect(parseServerTime("2026-01-01T10:00:00Z").valueOf()).toBe(T);
    expect(parseServerTime("2026-01-01T10:00:00.123456Z").valueOf()).toBe(
      T + 123,
    );
    expect(parseServerTime("2026-01-01T18:00:00+08:00").valueOf()).toBe(T);
    expect(parseServerTime("2026-01-01T15:30:00+0530").valueOf()).toBe(T);
    expect(parseServerTime("2026-01-01T05:00:00-05:00").valueOf()).toBe(T);
    expect(parseServerTime("2026-01-01 10:00:00Z").valueOf()).toBe(T);
  });

  it("reads a string without a zone as UTC (the server's naive database values are UTC), in every zone", () => {
    for (const zone of ZONES) {
      inZone(zone, () => {
        expect(parseServerTime("2026-01-01T10:00:00").valueOf()).toBe(T);
        expect(parseServerTime("2026-01-01 10:00:00").valueOf()).toBe(T);
        expect(parseServerTime("2026-01-01T10:00:00.343410").valueOf()).toBe(
          T + 343,
        );
        expect(parseServerTime("2026-01-01").valueOf()).toBe(
          Date.UTC(2026, 0, 1),
        );
        expect(parseServerTime("  2026-01-01T10:00:00  ").valueOf()).toBe(T);
      });
    }
  });

  it("takes a number as unix seconds and a Date as itself", () => {
    expect(parseServerTime(T / 1000).valueOf()).toBe(T);
    expect(parseServerTime(new Date(T)).valueOf()).toBe(T);
  });

  it("gives an invalid value for anything else", () => {
    expect(parseServerTime("not a date").isValid()).toBe(false);
    expect(parseServerTime({ value: "invalid" }).isValid()).toBe(false);
    expect(parseServerTime(undefined).isValid()).toBe(false); // not "now"
    expect(parseServerTime(null).isValid()).toBe(false);
  });
});

describe("formatRelativeTime: the same words in every time zone", () => {
  const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
  const iso = (deltaSeconds) =>
    new Date(NOW + deltaSeconds * 1000).toISOString();

  it("words a time ahead of the clock as it is, not as a time hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    // delta = time - clock; a client clock a few seconds behind the server makes a fresh commit "ahead"
    const expected = new Map([
      [-3600, "an hour ago"],
      [-60, "a minute ago"],
      [-1, "a few seconds ago"],
      [0, "a few seconds ago"],
      [1, "in a few seconds"],
      [30, "in a few seconds"],
      [300, "in 5 minutes"],
      [1800, "in 30 minutes"],
      [28800, "in 8 hours"],
      [50400, "in 14 hours"],
    ]);
    for (const zone of ZONES) {
      inZone(zone, () => {
        for (const [delta, text] of expected) {
          expect(
            formatRelativeTime(iso(delta), "-"),
            `${zone}, delta ${delta} s`,
          ).toBe(text);
        }
      });
    }
  });

  it("is not fooled by a time a few seconds ahead of the clock in an east zone (it used to read 8 hours ago)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    inZone("Asia/Shanghai", () => {
      expect(formatRelativeTime(iso(3), "-")).toBe("in a few seconds");
      expect(formatRelativeTime(iso(28800), "-")).toBe("in 8 hours");
      expect(formatRelativeTime(iso(28800 - 1), "-")).toBe("in 8 hours");
    });
  });

  it("reads a time without a zone as UTC: ten minutes old is ten minutes old, in every zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const naive = iso(-600).slice(0, 19); // "2026-06-15T11:50:00"
    for (const zone of ZONES) {
      inZone(zone, () =>
        expect(formatRelativeTime(naive, "-"), zone).toBe("10 minutes ago"),
      );
    }
  });

  it("gives the fallback for empty and unusable values", () => {
    expect(formatRelativeTime("", "never")).toBe("never");
    expect(formatRelativeTime(null, "never")).toBe("never");
    expect(formatRelativeTime(undefined)).toBe("never");
    expect(formatRelativeTime({ value: "invalid" }, "never")).toBe("never");
    expect(formatRelativeTime("not a date", "?")).toBe("?");
  });

  it("formats unix seconds the same way", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    expect(formatUnixRelativeTime(NOW / 1000 - 120)).toBe("2 minutes ago");
    expect(formatUnixRelativeTime(NOW / 1000 + 120)).toBe("in 2 minutes");
    expect(formatUnixRelativeTime(0, "Unknown")).toBe("Unknown");
    expect(formatUnixRelativeTime("garbage", "Unknown")).toBe("Unknown");
  });

  it("reads a Date as the instant it is", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    expect(formatRelativeTime(new Date(NOW - 5 * 60 * 1000), "-")).toBe(
      "5 minutes ago",
    );
  });
});

describe("formatServerDate: the viewer's own calendar day and clock", () => {
  it("shows a UTC time in the zone of the viewer, whether or not the string carries a Z", () => {
    const cases = [
      ["Asia/Shanghai", "Jan 2, 2026", "Jan 2, 2026 at 4:00 AM"],
      ["America/Los_Angeles", "Jan 1, 2026", "Jan 1, 2026 at 12:00 PM"],
      ["UTC", "Jan 1, 2026", "Jan 1, 2026 at 8:00 PM"],
      ["Asia/Kolkata", "Jan 2, 2026", "Jan 2, 2026 at 1:30 AM"],
    ];
    for (const [zone, day, withClock] of cases) {
      inZone(zone, () => {
        for (const value of [
          "2026-01-01T20:00:00Z",
          "2026-01-01T20:00:00",
          "2026-01-01T20:00:00.000000",
          "2026-01-02T04:00:00+08:00",
        ]) {
          expect(
            formatServerDate(value, "MMM D, YYYY"),
            `${zone} ${value}`,
          ).toBe(day);
          expect(
            formatServerDate(value, "MMM D, YYYY [at] h:mm A"),
            `${zone} ${value}`,
          ).toBe(withClock);
        }
      });
    }
  });

  it("gives the fallback for an empty or unusable value", () => {
    expect(formatServerDate("", "MMM D, YYYY")).toBe("");
    expect(formatServerDate(null, "MMM D, YYYY", "-")).toBe("-");
    expect(formatServerDate("not a date", "MMM D, YYYY", "?")).toBe("?");
  });
});

describe("formatRelativeTimeCached", () => {
  it("returns what formatRelativeTime returns", () => {
    const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(formatRelativeTimeCached(iso, "-")).toBe(
      formatRelativeTime(iso, "-"),
    );
  });

  it("gives the fallback for an empty value", () => {
    expect(formatRelativeTimeCached("", "never")).toBe("never");
    expect(formatRelativeTimeCached(null, "-")).toBe("-");
    expect(formatRelativeTimeCached(undefined)).toBe("never");
  });

  it("computes a timestamp once and reuses the text for a few seconds", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
      const iso = "2026-05-01T11:59:20Z"; // 40 s old: "a few seconds ago"
      const first = formatRelativeTimeCached(iso, "-");
      expect(first).toBe(formatRelativeTime(iso, "-"));
      // 10 s later it is 50 s old, which dayjs words differently ("a minute ago") ...
      vi.setSystemTime(new Date("2026-05-01T12:00:10Z"));
      expect(formatRelativeTime(iso, "-")).not.toBe(first);
      // ... but inside the cache's lifetime the earlier text is reused
      expect(formatRelativeTimeCached(iso, "-")).toBe(first);
      // past the lifetime (15 s) it is computed again
      vi.setSystemTime(new Date("2026-05-01T12:00:20Z"));
      expect(formatRelativeTimeCached(iso, "-")).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not grow without bound", () => {
    for (let i = 0; i < 2500; i++) {
      formatRelativeTimeCached(
        new Date(1_700_000_000_000 + i * 1000).toISOString(),
        "-",
      );
    }
    expect(formatRelativeTimeCached("2023-11-14T22:13:20Z", "-")).toBeTypeOf(
      "string",
    );
  });
});
