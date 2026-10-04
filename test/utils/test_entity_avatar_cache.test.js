import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("entity avatar cache across page reloads", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it("preserves an uploaded/deleted avatar revision when the module is reloaded", async () => {
    const original = await import("@/utils/entity-avatar");
    original.invalidateEntityAvatar("reload-user");
    const first = original.buildEntityAvatarUrl({ username: "reload-user" });
    expect(first).toMatch(/^\/api\/users\/reload-user\/avatar\?v=\d+$/);
    vi.resetModules();
    const reloaded = await import("@/utils/entity-avatar");
    expect(reloaded.buildEntityAvatarUrl({ username: "reload-user" })).toBe(
      first,
    );
    expect(
      reloaded.buildEntityAvatarUrl({ username: "reload-user", isOrg: true }),
    ).toBe("/api/organizations/reload-user/avatar");
    reloaded.invalidateEntityAvatar("reload-user");
    const next = reloaded.buildEntityAvatarUrl({ username: "reload-user" });
    expect(
      Number(new URL(next, "http://test").searchParams.get("v")),
    ).toBeGreaterThan(
      Number(new URL(first, "http://test").searchParams.get("v")),
    );
  });

  it("still invalidates mounted avatars when persistent storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Disabled");
    });
    const { invalidateEntityAvatar, buildEntityAvatarUrl } = await import(
      "@/utils/entity-avatar"
    );
    expect(() => invalidateEntityAvatar("storage-disabled")).not.toThrow();
    expect(buildEntityAvatarUrl({ username: "storage-disabled" })).toMatch(
      /\?v=\d+$/,
    );
  });

  it.each(["NaN", "Infinity", "-5", "0"])(
    "ignores an invalid stored revision (%s)",
    async (value) => {
      localStorage.setItem(
        "kohakuhub.avatar-revision.v1:user:invalid-cache",
        value,
      );
      const { buildEntityAvatarUrl } = await import("@/utils/entity-avatar");
      expect(buildEntityAvatarUrl({ username: "invalid-cache" })).toBe(
        "/api/users/invalid-cache/avatar",
      );
    },
  );
});
