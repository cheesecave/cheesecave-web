import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useAuthStore } from "@/stores/auth";
import { useErrorContext } from "@/composables/useErrorContext";

describe("useErrorContext", () => {
  it("describes who is looking, so the same error can read differently", () => {
    setActivePinia(createPinia());
    const auth = useAuthStore();
    const context = useErrorContext();
    expect(context("repository")).toEqual({
      noun: "repository",
      signedIn: false,
      sessionExpired: false,
    });
    auth.user = { username: "alice" };
    expect(context("file").signedIn).toBe(true);
    auth.user = null;
    auth.sessionExpired = true;
    expect(context("user")).toEqual({
      noun: "user",
      signedIn: false,
      sessionExpired: true,
    });
  });
});
