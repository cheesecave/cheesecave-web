import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";

dayjs.extend(relativeTime);
dayjs.extend(utc);

// A time string that names its own zone: ends in Z or in an offset after a clock time.
// (A date such as "2026-01-01" ends in "-01" but has no clock time, so it does not match.)
const NAMES_ITS_ZONE =
  /[T ]\d\d:\d\d(?::\d\d(?:[.,]\d+)?)?\s*(?:Z|[+-]\d\d(?::?\d\d)?)$/i;

/**
 * Read a time the server sent, in the one way the server means it.
 *
 * - a string with `Z` or an offset is that instant;
 * - a string with neither is **UTC**: the backend's database values are naive UTC and are sent without a
 *   marker (invitations, tokens, organizations, ...);
 * - a number is unix seconds, a `Date` is itself.
 *
 * There is no second reading: a time is never re-read as local time, and a time that is ahead of the
 * browser's clock (the client's clock is a little behind) stays ahead of it.
 *
 * @returns a dayjs value in the viewer's zone (call `.isValid()` before using it)
 */
export function parseServerTime(value) {
  if (value === undefined || value === null) return dayjs(null); // dayjs(undefined) would be "now"
  if (typeof value === "number") return dayjs.unix(value);
  if (value instanceof Date) return dayjs(value);
  if (typeof value === "string") {
    const text = value.trim();
    return NAMES_ITS_ZONE.test(text) ? dayjs(text) : dayjs.utc(text).local();
  }
  return dayjs(value);
}

export function formatRelativeTime(value, fallback = "never") {
  if (!value) return fallback;

  const parsed = parseServerTime(value);
  return parsed.isValid() ? parsed.fromNow() : fallback;
}

/** A server time as a calendar date or clock time of the viewer's zone, e.g. `formatServerDate(v, "MMM D, YYYY")`. */
export function formatServerDate(value, format, fallback = "") {
  if (!value) return fallback;

  const parsed = parseServerTime(value);
  return parsed.isValid() ? parsed.format(format) : fallback;
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

  const parsed = parseServerTime(value);
  return parsed.isValid() ? parsed.fromNow() : fallback;
}
