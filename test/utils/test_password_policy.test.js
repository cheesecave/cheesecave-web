// What the forms ask of a password before they send it: the server's rule (8 characters to 72 bytes), so a person
// is told in the form and not by a 422.

import { describe, expect, it } from "vitest";

import {
  confirmationProblem,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
} from "@/utils/password-policy";

describe("the password rule", () => {
  it("is the server's: 8 characters to 72 bytes", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });

  it.each(["12345678", "correct horse battery staple", "a".repeat(72), "パスワード".repeat(4)])(
    "has no complaint about %s",
    (value) => expect(passwordProblem(value)).toBeNull(),
  );

  it("asks for a password when there is none", () => {
    expect(passwordProblem("")).toBe("Please enter a password");
    expect(passwordProblem(undefined)).toBe("Please enter a password");
  });

  it("says how short is too short", () => {
    expect(passwordProblem("1234567")).toBe("Password must be at least 8 characters");
  });

  it("counts bytes for the upper limit, not characters", () => {
    expect(passwordProblem("a".repeat(73))).toMatch(/at most 72 bytes/);
    // 25 characters, 75 bytes
    expect(passwordProblem("パスワード".repeat(5))).toMatch(/at most 72 bytes/);
  });
});

describe("repeating the password", () => {
  it("asks for the repeat, and for it to match", () => {
    expect(confirmationProblem("longenough", "")).toBe("Please repeat the password");
    expect(confirmationProblem("longenough", "longenough!")).toBe("The two passwords do not match");
    expect(confirmationProblem("longenough", "longenough")).toBeNull();
  });
});
