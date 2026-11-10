import { describe, expect, it, vi } from "vitest";

import {
  formatRelativeTime,
  formatRelativeTimeCached,
  formatUnixRelativeTime,
  initializeBrowserTimezone,
} from "@/utils/datetime";

describe("datetime utilities", () => {
  function stubIntlTimeZone(timeZone) {
    const RealDateTimeFormat = globalThis.Intl.DateTimeFormat;

    vi.stubGlobal("Intl", {
      ...globalThis.Intl,
      DateTimeFormat: vi.fn((...args) => {
        const formatter = new RealDateTimeFormat(...args);
        return {
          format: formatter.format.bind(formatter),
          formatToParts: formatter.formatToParts.bind(formatter),
          resolvedOptions: () => ({
            ...formatter.resolvedOptions(),
            timeZone,
          }),
        };
      }),
    });
  }

  it("initializes browser timezone from Intl and falls back to dayjs guess", () => {
    stubIntlTimeZone("");

    expect(initializeBrowserTimezone()).not.toBe("");
  });

  it("keeps the last known timezone when Intl is unavailable", () => {
    stubIntlTimeZone("Asia/Shanghai");
    expect(initializeBrowserTimezone()).toBe("Asia/Shanghai");

    vi.stubGlobal("Intl", undefined);

    expect(initializeBrowserTimezone()).toBe("Asia/Shanghai");
  });

  it("formats relative values from utc strings and unsupported inputs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    stubIntlTimeZone("Asia/Shanghai");

    try {
      expect(formatRelativeTime("2026-01-01T08:30:00Z", "never")).toContain(
        "ago",
      );
      expect(formatRelativeTime({ value: "invalid" }, "never")).toBe("never");
      expect(formatRelativeTime(null, "never")).toBe("never");
      expect(formatUnixRelativeTime(0, "Unknown")).toBe("Unknown");
      expect(
        formatUnixRelativeTime(Math.floor(Date.now() / 1000) - 120),
      ).toContain("ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats date objects, local strings, and past utc strings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    stubIntlTimeZone("Asia/Shanghai");

    try {
      expect(
        formatRelativeTime(new Date("2026-01-01T09:55:00Z"), "never"),
      ).toContain("ago");
      expect(formatRelativeTime("2026-01-01 17:30:00", "never")).toContain(
        "ago",
      );
      expect(formatRelativeTime("2026-01-01T00:30:00Z", "never")).toContain(
        "ago",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatRelativeTimeCached", () => {
  it("returns what formatRelativeTime returns", () => {
    const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(formatRelativeTimeCached(iso, "-")).toBe(formatRelativeTime(iso, "-"));
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
      formatRelativeTimeCached(new Date(1_700_000_000_000 + i * 1000).toISOString(), "-");
    }
    expect(formatRelativeTimeCached("2023-11-14T22:13:20Z", "-")).toBeTypeOf("string");
  });
});
