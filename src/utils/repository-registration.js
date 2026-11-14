import { safeReturn } from "@/errors/copy";

const PREFIX = "repository-registration:";
const LIFETIME_MS = 30 * 60 * 1000;
const validId = (id) => typeof id === "string" && /^[a-f0-9]{32}$/.test(id);
const validPath = (path) =>
  typeof path === "string" &&
  safeReturn(path) === path &&
  /^\/(models|datasets|spaces)\/[^/?#]+\/[^/?#]+$/.test(path);

export function newRepositoryRegistrationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function repositoryRegistrationTarget(repository, id) {
  const path = `/${repository.type}s/${encodeURIComponent(repository.namespace)}/${encodeURIComponent(repository.name)}`;
  if (!validId(id) || !validPath(path))
    throw new Error("Invalid repository registration context");
  return {
    path: "/register",
    query: { repository_invitation: id, return: path },
  };
}

export function createRepositoryRegistration(
  repository,
  token,
  id = newRepositoryRegistrationId(),
) {
  const target = repositoryRegistrationTarget(repository, id);
  const code = typeof token === "string" ? token.trim() : "";
  if (!code || code.length > 256)
    throw new Error("Enter a repository invitation code");
  sessionStorage.setItem(
    PREFIX + id,
    JSON.stringify({
      token: code,
      repositoryPath: target.query.return,
      expiresAt: Date.now() + LIFETIME_MS,
    }),
  );
  return target;
}

export function clearRepositoryRegistration(id) {
  if (validId(id)) {
    try {
      sessionStorage.removeItem(PREFIX + id);
    } catch {
      /* Account creation must not depend on storage cleanup. */
    }
  }
}

export function readRepositoryRegistration(id) {
  if (!validId(id)) return null;
  try {
    const context = JSON.parse(sessionStorage.getItem(PREFIX + id));
    if (
      context &&
      typeof context.token === "string" &&
      context.token.length > 0 &&
      context.token.length <= 256 &&
      validPath(context.repositoryPath) &&
      Number.isFinite(context.expiresAt) &&
      context.expiresAt > Date.now()
    )
      return { token: context.token, repositoryPath: context.repositoryPath };
    clearRepositoryRegistration(id);
  } catch {
    // Unavailable storage or an expired/malformed handoff cannot supply a code.
    clearRepositoryRegistration(id);
  }
  return null;
}
