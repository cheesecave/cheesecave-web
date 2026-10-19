// The document title of a page, worked out from the route alone: a repository id, an account name and a file path
// are all in the URL, so nothing has to be fetched and the title is right on the first paint. The shape follows
// Hugging Face's (see formatDocumentTitle in site-branding.js, which also adds the site name); the site name comes
// from the branding settings.
import { setDocumentPageTitle } from "@/shared/site-branding";

const NOT_FOUND = { title: "404" };

const STATIC = {
  "/": "",
  "/models": "Models",
  "/datasets": "Datasets",
  "/spaces": "Spaces",
  "/organizations": "Organizations",
  "/organizations/new": "New organization",
  "/new": "New repository",
  "/login": "Log in",
  "/register": "Create account",
  "/reset-password": "Reset password",
  "/settings": "Settings",
  "/about": "About",
  "/get-started": "Get started",
  "/self-hosted": "Self-hosted",
  "/contributing": "Contributing",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/docs": "Documentation",
};

// What a repository of each type is called before the site's name: a model is just "owner/name · <site>"
const SECTIONS = { models: "", datasets: "Datasets", spaces: "Spaces" };
const ACCOUNT_VIEWS = {
  models: "Models",
  datasets: "Datasets",
  spaces: "Spaces",
  storage: "Storage",
};

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
const last = (path) => decode(path.split("/").at(-1));

// What follows /{type}s/{namespace}/{name}, still percent-encoded (a branch may have a slash in it): a pattern for
// each view the router has, and its title. A page inside a repository names the repository, not the site.
const REPO_VIEWS = [
  [
    /^tree\/(?<branch>[^/]+)$/,
    (m, id) => `${id} at ${decode(m.groups.branch)}`,
  ],
  [
    /^tree\/(?<branch>[^/]+)\/(?<path>.+)$/,
    (m, id) => `${last(m.groups.path)} · ${id} at ${decode(m.groups.branch)}`,
  ],
  [
    /^blob\/(?<branch>[^/]+)\/(?<path>.+)$/,
    (m, id) => `${last(m.groups.path)} · ${id} at ${decode(m.groups.branch)}`,
  ],
  [
    /^edit\/(?<branch>[^/]+)\/(?<path>.+)$/,
    (m, id) =>
      `Edit ${last(m.groups.path)} · ${id} at ${decode(m.groups.branch)}`,
  ],
  [/^commits\/[^/]+$/, (_, id) => `Commits · ${id}`],
  [
    /^commit\/(?<sha>[^/]+)$/,
    (m, id) => `Commit ${decode(m.groups.sha).slice(0, 7)} · ${id}`,
  ],
  [/^settings$/, (_, id) => `Settings · ${id}`],
  [/^upload\/[^/]+$/, (_, id) => `Upload files · ${id}`],
];

function repositoryTitle(type, parts) {
  const id = `${decode(parts[1])}/${decode(parts[2])}`;
  if (parts.length === 3) return { title: id, section: SECTIONS[type] };
  const view = parts.slice(3).join("/");
  for (const [pattern, title] of REPO_VIEWS) {
    const match = pattern.exec(view);
    if (match) return { title: title(match, id), site: false };
  }
  return NOT_FOUND;
}

function accountTitle(name, views, view) {
  if (view === undefined) return { title: name };
  return views[view] ? { title: `${views[view]} · ${name}` } : NOT_FOUND;
}

/**
 * The title of the page for a route (`{ path }` is enough): `{ title, section?, site? }`, for
 * `formatDocumentTitle`. The home page has no title of its own.
 */
export function titleForRoute({ path }) {
  if (path in STATIC) return { title: STATIC[path] };
  const parts = path.split("/").filter(Boolean);
  const [first, second, third] = parts.map(decode);
  if (first === "docs") return { title: "Documentation" };
  if (first === "invite" && parts.length === 2)
    return { title: "Organization invitation" };
  if (first in SECTIONS && parts.length >= 3)
    return repositoryTitle(first, parts);
  if (first === "organizations" && parts.length <= 3)
    return accountTitle(
      second,
      { ...ACCOUNT_VIEWS, settings: "Settings" },
      third,
    );
  if (parts.length <= 2) return accountTitle(first, ACCOUNT_VIEWS, second);
  return NOT_FOUND;
}

/** Keep the document title in step with the route; returns the function that stops it. */
export function installPageTitle(router) {
  return router.afterEach((to, from, failure) => {
    if (!failure) setDocumentPageTitle(titleForRoute(to));
  });
}
