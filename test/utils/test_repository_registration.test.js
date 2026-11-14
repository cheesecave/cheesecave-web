import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRepositoryRegistration,
  createRepositoryRegistration,
  createGuestRepositoryRegistration,
  readRepositoryRegistration,
} from "@/utils/repository-registration";

const repository = { type: "dataset", namespace: "owner", name: "demo" };
beforeEach(() => sessionStorage.clear());

describe("repository registration handoff", () => {
  it("carries a guest repository without storing or recovering an invitation secret", () => {
    const target = createGuestRepositoryRegistration(repository, 42);
    const id = target.query.repository_invitation;
    expect(readRepositoryRegistration(id)).toEqual({
      guestRepositoryId: 42,
      repositoryPath: "/datasets/owner/demo",
    });
    expect(
      sessionStorage.getItem(`repository-registration:${id}`),
    ).not.toContain("token");
    clearRepositoryRegistration(id);
    expect(readRepositoryRegistration(id)).toBeNull();
    expect(() => createGuestRepositoryRegistration(repository, "42")).toThrow();
    expect(() => createGuestRepositoryRegistration(repository, -1)).toThrow();
  });
  it("uses an opaque link and tab-local storage without changing normal authentication", () => {
    localStorage.setItem("hf_token", "normal-token-fixture");
    const target = createRepositoryRegistration(
      repository,
      " repo_registration_fixture ",
    );
    const id = target.query.repository_invitation;
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(target)).not.toContain("repo_registration_fixture");
    expect(readRepositoryRegistration(id)).toEqual({
      token: "repo_registration_fixture",
      repositoryPath: "/datasets/owner/demo",
    });
    expect(localStorage.getItem("hf_token")).toBe("normal-token-fixture");
    clearRepositoryRegistration(id);
    expect(readRepositoryRegistration(id)).toBeNull();
  });
  it.each(["code", "guest"])("expires abandoned %s handoffs", (kind) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const target =
      kind === "guest"
        ? createGuestRepositoryRegistration(repository, 42)
        : createRepositoryRegistration(repository, "repo_expiration_fixture");
    clock.mockReturnValue(1000 + 30 * 60 * 1000);
    expect(
      readRepositoryRegistration(target.query.repository_invitation),
    ).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("rejects malformed handoffs and external return targets", () => {
    const target = createRepositoryRegistration(
      repository,
      "repo_tamper_fixture",
    );
    const id = target.query.repository_invitation;
    const key = `repository-registration:${id}`;
    const context = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...context, repositoryPath: "//evil.example/path" }),
    );
    expect(readRepositoryRegistration(id)).toBeNull();
    sessionStorage.setItem(key, "{");
    expect(readRepositoryRegistration(id)).toBeNull();
    expect(readRepositoryRegistration([id])).toBeNull();
  });
});
