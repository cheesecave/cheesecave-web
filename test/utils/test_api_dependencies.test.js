import { describe, expect, it, vi } from "vitest";

// Network/session logic must load without eagerly importing notification UI.
// Cold-loading that graph timed out the first API/auth/LFS test in each worker,
// leaving its unfinished request to contaminate the following test's counters.
vi.mock("element-plus", () => {
  throw new Error(
    "Network and session modules must not require notification UI",
  );
});

describe("network and session dependencies", () => {
  it("loads the API and auth store without the component library", async () => {
    const [{ default: api, authAPI }, { useAuthStore }] = await Promise.all([
      import("@/utils/api"),
      import("@/stores/auth"),
    ]);
    expect(api.get).toBeTypeOf("function");
    expect(authAPI.login).toBeTypeOf("function");
    expect(useAuthStore).toBeTypeOf("function");
  });
});
