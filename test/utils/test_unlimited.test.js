import { describe, expect, it } from "vitest";

import {
  INFINITY,
  NAMESPACE_UNLIMITED,
  NO_LIMIT,
  UNLIMITED_BRACKET,
  UNLIMITED_LABEL,
} from "@/utils/unlimited";

describe("how no limit is written", () => {
  it('is the mathematical symbol, and its word is "No limit"', () => {
    expect(INFINITY).toBe("∞");
    expect(NO_LIMIT).toBe("No limit");
  });

  it("puts the word next to the symbol on a control, and inside brackets without brackets of its own", () => {
    expect(UNLIMITED_LABEL).toBe("∞ No limit");
    expect(UNLIMITED_BRACKET).toBe("∞ no limit");
    expect(`(${UNLIMITED_BRACKET})`).not.toMatch(/\(.*\(/);
  });

  it("says it in a sentence about a namespace", () => {
    expect(NAMESPACE_UNLIMITED).toBe("Namespace has no quota limit (∞)");
  });
});
