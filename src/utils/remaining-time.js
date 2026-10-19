const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** How long is left, as a phrase that follows "stops working": "in 59 minutes", "in 3 days", or "has expired". */
export function describeRemaining(ms) {
  if (ms <= 0) return "has expired";
  if (ms < MINUTE) return "in less than a minute";
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return `in ${plural(minutes, "minute")}`;
  if (ms < 48 * HOUR) return `in ${plural(Math.round(ms / HOUR), "hour")}`;
  return `in ${plural(Math.round(ms / DAY), "day")}`;
}
