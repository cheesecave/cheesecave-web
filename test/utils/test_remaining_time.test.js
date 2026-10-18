// How long a reset link has left, in words a person reads at a glance.

import { describe, expect, it } from "vitest";

import { describeRemaining } from "@/utils/remaining-time";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("describing the time a link has left", () => {
  it.each([
    [-5 * MIN, "has expired"],
    [0, "has expired"],
    [20_000, "in less than a minute"],
    [MIN, "in 1 minute"],
    [14 * MIN + 1, "in 15 minutes"],
    [59 * MIN, "in 59 minutes"],
    [HOUR, "in 1 hour"],
    [HOUR + 20 * MIN, "in 1 hour"],
    [6 * HOUR, "in 6 hours"],
    [47 * HOUR, "in 47 hours"],
    [3 * DAY, "in 3 days"],
    [7 * DAY, "in 7 days"],
  ])("%d ms is %s", (ms, text) => expect(describeRemaining(ms)).toBe(text));
});
