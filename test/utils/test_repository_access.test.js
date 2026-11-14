import { describe, expect, it, vi } from "vitest";
import {
  repositoryFromRoute,
  visibilityPayload,
  renderPublicInviteMarkdown,
  isAccountGrantActive,
} from "@/utils/repository-access";
import { inZone } from "../helpers/zone";

describe("repository account grant expiry", () => {
  it.each(["UTC", "Asia/Shanghai", "America/Los_Angeles"])(
    "reads naive server expiry as UTC in %s",
    (zone) =>
      inZone(zone, () => {
        const now = Date.UTC(2026, 0, 1, 0);
        expect(
          isAccountGrantActive({ expires_at: "2026-01-01T01:00:00" }, now),
        ).toBe(true);
        expect(
          isAccountGrantActive({ expires_at: "2025-12-31T23:00:00" }, now),
        ).toBe(false);
        expect(
          isAccountGrantActive({ expires_at: "2026-01-01T00:00:00" }, now),
        ).toBe(false);
        expect(
          isAccountGrantActive(
            { expires_at: "2026-01-01T09:00:00+08:00" },
            now,
          ),
        ).toBe(true);
        expect(isAccountGrantActive({ expires_at: "invalid" }, now)).toBe(
          false,
        );
        expect(isAccountGrantActive({ expires_at: null }, now)).toBe(true);
        expect(
          isAccountGrantActive(
            { revoked_at: "2025-12-31", expires_at: null },
            now,
          ),
        ).toBe(false);
        expect(isAccountGrantActive(null, now)).toBe(false);
      }),
  );
});

describe("repository invitation boundaries", () => {
  it.each([
    "models/a/b",
    "datasets/a/b/blob/main/x",
    "spaces/a/b/settings",
    "models/a/b/tree/main",
    "models/a/b/commits/main",
    "models/a/b/edit/main/x",
    "models/a/b/upload/main",
  ])("recognizes %s before its page mounts", (path) => {
    expect(repositoryFromRoute({ path: `/${path}` })).toEqual({
      type: path.split("/")[0].slice(0, -1),
      namespace: "a",
      name: "b",
    });
  });
  it("leaves nonrepository routes alone", () => {
    expect(repositoryFromRoute({ path: "/models" })).toBeNull();
    expect(repositoryFromRoute({ path: "/repo-access" })).toBeNull();
  });
  it.each([
    ["public", { private: false, invite_mode: false }],
    ["private", { private: true, invite_mode: false }],
    ["invite", { private: true, invite_mode: true }],
  ])("maps %s without making invitations public", (state, expected) =>
    expect(visibilityPayload(state)).toEqual(expected),
  );
  it("rejects unknown visibility instead of accidentally publishing", () =>
    expect(() => visibilityPayload("missing")).toThrow());
  it("renders public prose without loading private or relative resources", () => {
    const html = renderPublicInviteMarkdown(
      '# Welcome\n![secret](secret.png)\n<img src="/models/a/b/resolve/main/x" srcset="secret 2x" style="background:url(secret)">\n\n[private](/models/a/b/blob/main/x) [relative](README.md) [external](https://example.org/docs) [anchor](#hello)\n<a href="javascript:alert(1)">unsafe</a>',
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h1").textContent.trim()).toBe("Welcome");
    expect(
      doc.querySelector("img,[src],[srcset],[style],iframe,object"),
    ).toBeNull();
    expect(
      [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
    ).toEqual(["https://example.org/docs", "#hello"]);
  });
  it("removes media before any DOM parser could load it", () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    const html = renderPublicInviteMarkdown(
      '![secret](hidden.png)\n\n<img src="hidden.png"><iframe src="hidden.html"></iframe>',
    );
    expect(parse).not.toHaveBeenCalled();
    expect(html).not.toContain("hidden.png");
    expect(html).not.toContain("hidden.html");
    expect(html).not.toMatch(/<img|<iframe|src=/);
  });
  it("blocks absolute same-origin download links and resource-bearing HTML", () => {
    const html = renderPublicInviteMarkdown(
      `<a href="${window.location.origin}/models/a/b/resolve/main/x">file</a><video poster="secret" src="secret"></video><picture><source srcset="secret"></picture><style>body{background:url(secret)}</style>`,
    );
    expect(html).not.toMatch(
      /src=|srcset=|poster=|<video|<source|<style|href=/,
    );
  });
});
