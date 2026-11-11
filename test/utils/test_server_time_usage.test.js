// Every server time the web shows is read by parseServerTime (src/utils/datetime.js).
//
// dayjs(value) and new Date(value) read a string without a zone as the viewer's LOCAL time, while the server's naive values are UTC
// (a user's "Joined", an invitation's expiry): shown in UTC+8 they are 8 hours wrong. This keeps a new call from going around the one reading.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "src");
// Where reading a time another way is right, and why.
const ALLOWED = new Map([
  ["utils/datetime.js", "the one reading"],
  ["errors/decode.js", "Retry-After is an HTTP date (always GMT), not a time the server writes into its data"],
]);
// dayjs(x), new Date(x), Date.parse(...), dayjs.utc(...), dayjs.tz(...): ways to read a string. (dayjs.unix(n) is a number: unambiguous.)
const READS = [
  { pattern: /\bdayjs\(\s*[^)\s]/, what: "dayjs(value)" },
  { pattern: /\bnew Date\(\s*[^)\s]/, what: "new Date(value)" },
  { pattern: /\bDate\.parse\(/, what: "Date.parse(value)" },
  { pattern: /\bdayjs\.(utc|tz)\(/, what: "dayjs.utc / dayjs.tz" },
];

export function readsOfTime(source) {
  const found = [];
  source.split("\n").forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*(\*|\/\*).*$/, "");
    for (const { pattern, what } of READS) if (pattern.test(code)) found.push(`${index + 1}: ${what}`);
  });
  return found;
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(vue|js)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

describe("how the web reads a server time", () => {
  it("tells the readings of a string from the harmless calls", () => {
    expect(readsOfTime("dayjs(date).format('x')")).toEqual(["1: dayjs(value)"]);
    expect(readsOfTime("const at = new Date(expiresAt.value);")).toEqual(["1: new Date(value)"]);
    expect(readsOfTime("Date.parse(header)")).toEqual(["1: Date.parse(value)"]);
    expect(readsOfTime("dayjs.utc(text).local()")).toEqual(["1: dayjs.utc / dayjs.tz"]);
    expect(readsOfTime("dayjs.tz(text, zone)")).toEqual(["1: dayjs.utc / dayjs.tz"]);
    // the clock, a number, a comment
    expect(readsOfTime("const now = new Date();")).toEqual([]);
    expect(readsOfTime("dayjs.unix(seconds).format('x')")).toEqual([]);
    expect(readsOfTime("dayjs.extend(relativeTime);")).toEqual([]);
    expect(readsOfTime("// dayjs(date) would read it as local time")).toEqual([]);
    expect(readsOfTime(" * new Date(value)")).toEqual([]);
    expect(readsOfTime("Date.now()")).toEqual([]);
  });

  it("is the only way the application reads a time string: through parseServerTime", () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
      const name = relative(SRC, file).split(sep).join("/");
      if (ALLOWED.has(name)) continue;
      for (const found of readsOfTime(readFileSync(file, "utf8"))) offenders.push(`src/${name}:${found}`);
    }
    expect(offenders, "read it with parseServerTime / formatServerDate / formatRelativeTime from @/utils/datetime").toEqual([]);
  });

  it("has a reason for every allowed exception that still reads a time", () => {
    for (const [name, reason] of ALLOWED) {
      expect(reason.length).toBeGreaterThan(10);
      expect(readsOfTime(readFileSync(join(SRC, name), "utf8")).length, `${name} no longer needs its exception`).toBeGreaterThan(0);
    }
  });
});
