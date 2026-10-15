// A user or organization without an avatar answers /api/users/<name>/avatar with 404, and the browser prints that in
// red in the console for every <img> that asks. Once an avatar has failed to load, it is remembered for a while
// (this session, at most MISSING_TTL_MS), so the next place that shows the same account does not ask again and
// goes straight to the initials. Uploading or deleting an avatar forgets it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildEntityAvatarUrl,
  clearMissingEntityAvatars,
  invalidateEntityAvatar,
  isEntityAvatarMissing,
  markEntityAvatarMissing,
  MISSING_TTL_MS,
} from "@/utils/entity-avatar";

describe("avatars known to be missing", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMissingEntityAvatars();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearMissingEntityAvatars();
  });

  it("asks for an avatar until one has failed, then does not", () => {
    expect(buildEntityAvatarUrl({ username: "plain" })).toBe(
      "/api/users/plain/avatar",
    );

    markEntityAvatarMissing("plain");

    expect(isEntityAvatarMissing("plain")).toBe(true);
    expect(buildEntityAvatarUrl({ username: "plain" })).toBeUndefined();
  });

  it("tells users from organizations, and one account from another", () => {
    markEntityAvatarMissing("same-name");

    expect(buildEntityAvatarUrl({ username: "same-name", isOrg: true })).toBe(
      "/api/organizations/same-name/avatar",
    );
    expect(buildEntityAvatarUrl({ username: "other" })).toBe(
      "/api/users/other/avatar",
    );
    expect(isEntityAvatarMissing("same-name", true)).toBe(false);
  });

  it("leaves an external or signed image URL as it is", () => {
    markEntityAvatarMissing("plain");

    expect(
      buildEntityAvatarUrl({
        username: "plain",
        src: "https://cdn.example.com/a.png?sig=1",
      }),
    ).toBe("https://cdn.example.com/a.png?sig=1");
  });

  it("forgets it when the avatar is uploaded or deleted", () => {
    markEntityAvatarMissing("uploader");

    invalidateEntityAvatar("uploader");

    expect(isEntityAvatarMissing("uploader")).toBe(false);
    expect(buildEntityAvatarUrl({ username: "uploader" })).toMatch(
      /^\/api\/users\/uploader\/avatar\?v=\d+$/,
    );
  });

  it("asks again after the memory has run out, in case an avatar was added elsewhere", () => {
    vi.useFakeTimers();
    markEntityAvatarMissing("ttl-user");
    vi.advanceTimersByTime(MISSING_TTL_MS - 1);
    expect(isEntityAvatarMissing("ttl-user")).toBe(true);

    vi.advanceTimersByTime(2);

    expect(isEntityAvatarMissing("ttl-user")).toBe(false);
    expect(buildEntityAvatarUrl({ username: "ttl-user" })).toBe(
      "/api/users/ttl-user/avatar",
    );
  });

  it("ignores a missing name and can be emptied", () => {
    markEntityAvatarMissing("");
    markEntityAvatarMissing(null);
    expect(isEntityAvatarMissing("")).toBe(false);

    markEntityAvatarMissing("plain");
    clearMissingEntityAvatars();
    expect(isEntityAvatarMissing("plain")).toBe(false);
  });
});
