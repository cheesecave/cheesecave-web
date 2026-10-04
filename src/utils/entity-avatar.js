import { reactive } from "vue";

const revisions = reactive(new Map());
const entityKey = (username, isOrg) => `${isOrg ? "org" : "user"}:${username}`;
const revisionKey = (key) => `kohakuhub.avatar-revision.v1:${key}`;

function cachedRevision(key) {
  try {
    const value = Number(globalThis.localStorage.getItem(revisionKey(key)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function currentRevision(key) {
  return Math.max(revisions.get(key) || 0, cachedRevision(key));
}

export function buildEntityProfilePath(username, isOrg = false) {
  if (!username) return null;
  return `${isOrg ? "/organizations" : ""}/${encodeURIComponent(username)}`;
}

export function invalidateEntityAvatar(username, isOrg = false) {
  if (!username) return;
  const key = entityKey(username, isOrg);
  const revision = Math.max(Date.now(), currentRevision(key) + 1);
  revisions.set(key, revision);
  // Avatar responses are cached for 24 hours. Keep the invalidation across
  // reloads so uploading/deleting cannot resurrect the previously cached image.
  try {
    globalThis.localStorage.setItem(revisionKey(key), String(revision));
  } catch {
    // Storage may be disabled; mounted avatars still refresh through the map.
  }
}

export function buildEntityAvatarUrl({
  username,
  isOrg = false,
  src,
  version,
} = {}) {
  const endpoint = username
    ? `/api/${isOrg ? "organizations" : "users"}/${encodeURIComponent(username)}/avatar`
    : undefined;
  const source = src || endpoint;
  if (!source || !endpoint) return source;
  // Only our own avatar endpoint can be cache-invalidated. Preserve external and
  // signed image URLs, along with unrelated local image sources, byte-for-byte.
  if (source.split(/[?#]/, 1)[0] !== endpoint) return source;
  const revision = currentRevision(entityKey(username, isOrg));
  const hasVersion =
    version !== undefined && version !== null && version !== "";
  const cacheVersion = revision
    ? hasVersion
      ? `${version}.${revision}`
      : revision
    : version;
  if (
    cacheVersion === undefined ||
    cacheVersion === null ||
    cacheVersion === ""
  ) {
    return source;
  }
  const url = new URL(source, "http://avatar.local");
  url.searchParams.delete("t");
  url.searchParams.set("v", cacheVersion);
  return `${url.pathname}${url.search}${url.hash}`;
}
