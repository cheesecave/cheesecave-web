import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

let browserTimeZone = "UTC";

export function initializeBrowserTimezone() {
  if (typeof Intl !== "undefined") {
    browserTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      dayjs.tz.guess() ||
      "UTC";
  }

  return browserTimeZone;
}

function parseBrowserTime(value) {
  const timeZone = initializeBrowserTimezone();

  if (typeof value === "number") {
    return dayjs.unix(value).tz(timeZone);
  }

  if (value instanceof Date) {
    return dayjs(value).tz(timeZone);
  }

  if (typeof value === "string") {
    if (value.endsWith("Z")) {
      const utcParsed = dayjs(value).tz(timeZone);
      const localParsed = dayjs.tz(value.slice(0, -1), timeZone);

      if (
        utcParsed.isValid() &&
        localParsed.isValid() &&
        utcParsed.isAfter(dayjs()) &&
        !localParsed.isAfter(dayjs())
      ) {
        return localParsed;
      }

      if (utcParsed.isValid()) {
        return utcParsed;
      }
    }

    return dayjs.tz(value, timeZone);
  }

  return dayjs(value).tz(timeZone);
}

export function formatRelativeTime(value, fallback = "never") {
  if (!value) return fallback;

  const parsed = parseBrowserTime(value);
  return parsed.isValid() ? parsed.fromNow() : fallback;
}

// A list of a thousand rows renders the same few timestamps again and again
// (every row of one commit shares one), and the timezone-aware parse is the
// expensive part. The words only change by the minute, so reuse them briefly.
const RELATIVE_TIME_TTL_MS = 15_000;
const RELATIVE_TIME_MAX_ENTRIES = 2000;
const relativeTimeCache = new Map();

export function formatRelativeTimeCached(value, fallback = "never") {
  if (!value) return fallback;
  const key = `${value}\u0000${fallback}`;
  const now = Date.now();
  const hit = relativeTimeCache.get(key);
  if (hit && now - hit.at < RELATIVE_TIME_TTL_MS) return hit.text;
  const text = formatRelativeTime(value, fallback);
  if (relativeTimeCache.size >= RELATIVE_TIME_MAX_ENTRIES) {
    relativeTimeCache.clear();
  }
  relativeTimeCache.set(key, { at: now, text });
  return text;
}

export function formatUnixRelativeTime(value, fallback = "Unknown") {
  if (!value) return fallback;

  const parsed = parseBrowserTime(value);
  return parsed.isValid() ? parsed.fromNow() : fallback;
}
