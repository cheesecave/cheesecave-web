import { describe, expect, it } from "vitest";

import { AppError, KIND } from "@/errors";
import {
  describeError,
  requestLine,
  retryDelaySeconds,
  safeReturn,
  signInPath,
} from "@/errors/copy";

const err = (kind, extra = {}) => new AppError({ kind, ...extra });
const ALL = Object.values(KIND).filter((k) => k !== KIND.CANCELLED);

describe("describeError", () => {
  it.each(ALL)(
    "has a title, a description, an icon and a tone for %s",
    (kind) => {
      const d = describeError(err(kind));
      expect(d.title).toMatch(/\S/);
      expect(d.description).toMatch(/\S/);
      expect(d.icon).toMatch(/^i-carbon-/);
      expect(["warning", "neutral", "danger"]).toContain(d.tone);
      expect(Array.isArray(d.actions)).toBe(true);
    },
  );

  it("offers nothing to show for a cancelled request", () => {
    expect(describeError(err(KIND.CANCELLED))).toBeNull();
  });

  it("names the thing that was not found, and says what to do about a private repository", () => {
    expect(
      describeError(err(KIND.NOT_FOUND), { noun: "repository" }).title,
    ).toBe("Repository not found");
    expect(describeError(err(KIND.NOT_FOUND)).title).toBe("Page not found");
    const anon = describeError(err(KIND.NOT_FOUND), {
      noun: "repository",
      signedIn: false,
    });
    expect(anon.description).toContain("sign in");
    expect(anon.actions).toEqual(["signin", "back", "home"]);
    const signed = describeError(err(KIND.NOT_FOUND), {
      noun: "repository",
      signedIn: true,
    });
    expect(signed.description).toContain("don't have access");
    expect(signed.actions).toEqual(["back", "home"]);
    const expired = describeError(err(KIND.NOT_FOUND), {
      noun: "repository",
      sessionExpired: true,
    });
    expect(expired.description).toContain("session has expired");
    expect(expired.actions[0]).toBe("signin");
  });

  it("uses what the server said when it adds something, and ignores a bare status line", () => {
    const useful = describeError(
      err(KIND.NOT_FOUND, {
        serverMessage: "Revision 'x' not found in repository 'a/b'",
      }),
      { noun: "branch" },
    );
    expect(useful.description).toBe(
      "Revision 'x' not found in repository 'a/b'",
    );
    const bare = describeError(
      err(KIND.NOT_FOUND, { serverMessage: "Not Found" }),
      { noun: "file" },
    );
    expect(bare.description).not.toBe("Not Found");
    expect(
      describeError(
        err(KIND.FORBIDDEN, {
          serverMessage: "Not authorized to update this user's settings",
        }),
      ).description,
    ).toBe("Not authorized to update this user's settings");
    expect(
      describeError(err(KIND.FORBIDDEN, { serverMessage: "Forbidden" }))
        .description,
    ).toContain("permission");
  });

  it("puts the server's sentence before the hint for a repository", () => {
    const d = describeError(
      err(KIND.NOT_FOUND, {
        serverMessage: "Repository 'a/b' (dataset) not found",
      }),
      { noun: "repository", signedIn: true },
    );
    expect(d.description).toBe(
      "Repository 'a/b' (dataset) not found. It may not exist, or it may be private and you don't have access.",
    );
    // a sentence that is already finished is not given a second full stop
    const finished = describeError(
      err(KIND.NOT_FOUND, { serverMessage: "No source serves it!" }),
      { noun: "repository", signedIn: true },
    );
    expect(finished.description).toBe(
      "No source serves it! It may not exist, or it may be private and you don't have access.",
    );
  });

  it("keeps a specific sentence for a missing login, and drops the generic one", () => {
    expect(
      describeError(
        err(KIND.AUTH_REQUIRED, {
          serverMessage: "Admin token required in X-Admin-Token header",
        }),
      ).description,
    ).toBe("Admin token required in X-Admin-Token header");
    expect(
      describeError(
        err(KIND.AUTH_REQUIRED, { serverMessage: "Not authenticated" }),
      ).description,
    ).toBe("Sign in to continue.");
  });

  it("shows the server's wording for client mistakes, and its own for the server's failures", () => {
    const rejected = describeError(
      err(KIND.INVALID, { serverMessage: "Name has a space" }),
    );
    expect(rejected.description).toBe("Name has a space");
    const broken = describeError(
      err(KIND.SERVER, {
        serverMessage: "psycopg2.OperationalError: password=hunter2",
      }),
    );
    expect(broken.description).not.toContain("hunter2");
    expect(
      describeError(
        err(KIND.UNAVAILABLE, { serverMessage: "upstream exploded" }),
      ).description,
    ).not.toContain("exploded");
  });

  it("tells a signed-out user to sign in, and an expired session what it cost", () => {
    expect(describeError(err(KIND.AUTH_REQUIRED)).actions).toEqual([
      "signin",
      "back",
    ]);
    const expired = describeError(err(KIND.SESSION_EXPIRED));
    expect(expired.title).toBe("Your session has expired");
    expect(expired.actions).toEqual(["signin"]);
    expect(
      describeError(err(KIND.AUTH_REQUIRED), { sessionExpired: true }).title,
    ).toBe("Your session has expired");
  });

  it("separates being offline from the server not answering", () => {
    expect(describeError(err(KIND.NETWORK, { offline: true })).title).toBe(
      "You're offline",
    );
    expect(describeError(err(KIND.NETWORK)).title).toBe(
      "Can't reach the server",
    );
    expect(describeError(err(KIND.NETWORK)).actions).toEqual(["retry"]);
    const storage = describeError(err(KIND.NETWORK), { storage: true });
    expect(storage.title).toBe("Browser blocked the request");
    expect(storage.description).toContain("CORS failure");
    expect(storage.description).toContain("MinIO CORS");
    expect(
      describeError(err(KIND.NETWORK, { offline: true }), { storage: true })
        .title,
    ).toBe("You're offline");
  });

  it("offers Retry where trying again can help, and Reload for a bug", () => {
    for (const kind of [
      KIND.TIMEOUT,
      KIND.UNAVAILABLE,
      KIND.SERVER,
      KIND.UNEXPECTED,
      KIND.RATE_LIMITED,
    ]) {
      expect(describeError(err(kind)).actions).toContain("retry");
    }
    expect(describeError(err(KIND.BUG)).actions).toEqual(["retry", "reload"]);
    expect(describeError(err(KIND.GATED)).actions).toEqual([
      "settings",
      "back",
    ]);
    expect(describeError(err(KIND.CONFLICT)).actions).toEqual([]);
    expect(
      describeError(
        err(KIND.CONFLICT, {
          code: "RepoNameRecycling",
          serverMessage: "being deleted",
        }),
      ).actions,
    ).toEqual(["retry"]);
  });

  it("says how long to wait when rate limited", () => {
    expect(
      describeError(err(KIND.RATE_LIMITED, { retryAfter: 7000 })).description,
    ).toContain("7 seconds");
    expect(
      describeError(err(KIND.RATE_LIMITED, { retryAfter: 1000 })).description,
    ).toContain("1 second and");
    expect(describeError(err(KIND.RATE_LIMITED)).description).toContain(
      "5 seconds",
    );
  });

  it("falls back to the status line when a kind has no wording of its own", () => {
    expect(describeError(err("something-new"))).toMatchObject({
      title: "Something went wrong",
    });
  });
});

describe("helpers", () => {
  it("gives the retry delay in whole seconds, with a default", () => {
    expect(
      retryDelaySeconds(err(KIND.RATE_LIMITED, { retryAfter: 2500 })),
    ).toBe(3);
    expect(retryDelaySeconds(err(KIND.RATE_LIMITED))).toBe(5);
    expect(retryDelaySeconds(err(KIND.RATE_LIMITED, { retryAfter: 0 }))).toBe(
      5,
    );
  });

  it("builds a sign-in path that returns here, refusing anything but a local path", () => {
    expect(signInPath("/datasets/a/b?tab=files")).toBe(
      "/login?return=%2Fdatasets%2Fa%2Fb%3Ftab%3Dfiles",
    );
    expect(signInPath("//evil.example/x")).toBe("/login");
    expect(signInPath("https://evil.example")).toBe("/login");
    expect(signInPath("")).toBe("/login");
    expect(signInPath("/login")).toBe("/login");
    expect(signInPath(undefined)).toBe("/login");
    expect(signInPath("/\\evil.example")).toBe("/login");
    expect(signInPath("/ok\u0009//evil")).toBe("/login");
  });

  it("returns only to this site after signing in, never to another origin", () => {
    expect(safeReturn("/datasets/a/b?tab=files")).toBe(
      "/datasets/a/b?tab=files",
    );
    expect(safeReturn(["/first", "/second"])).toBe("/first");
    for (const hostile of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/a\u0000b",
      "",
      undefined,
      null,
    ])
      expect(safeReturn(hostile)).toBe("/");
  });

  it("writes the line to quote to whoever runs the server", () => {
    expect(
      requestLine(
        err(KIND.SERVER, {
          status: 500,
          code: "ServerError",
          requestId: "r-1",
        }),
      ),
    ).toBe("HTTP 500 · ServerError · request r-1");
    expect(requestLine(err(KIND.NETWORK))).toBe("");
    expect(requestLine(err(KIND.SERVER, { requestId: "only" }))).toBe(
      "request only",
    );
  });
});
