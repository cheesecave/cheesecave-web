// The document title of a page, worked out from the route alone: a repository id, an account name and a file path
// are all in the URL, so nothing has to be fetched and the title is right on the first paint. The site name comes
// from the branding settings (`setDocumentPageTitle` puts the two together).
import { setDocumentPageTitle } from "@/shared/site-branding";

const NOT_FOUND = "Page not found";

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
  "/settings": "Settings",
  "/about": "About",
  "/get-started": "Get started",
  "/self-hosted": "Self-hosted",
  "/contributing": "Contributing",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/docs": "Documentation",
};

const TYPES = new Set(["models", "datasets", "spaces"]);
const ACCOUNT_VIEWS = {
  models: "Models",
  datasets: "Datasets",
  spaces: "Spaces",
  storage: "Storage",
};

const last = (path) => path.split("/").at(-1);

// What follows /{type}s/{namespace}/{name}: a pattern for each view the router has, and its title
const REPO_VIEWS = [
  [/^$/, (_, id) => id],
  [/^tree\/[^/]+$/, (_, id) => id],
  [/^tree\/[^/]+\/(.+)$/, (m, id) => `${last(m[1])} · ${id}`],
  [/^blob\/[^/]+\/(.+)$/, (m, id) => `${last(m[1])} · ${id}`],
  [/^edit\/[^/]+\/(.+)$/, (m, id) => `Edit ${last(m[1])} · ${id}`],
  [/^commits\/[^/]+$/, (_, id) => `Commits · ${id}`],
  [/^commit\/([^/]+)$/, (m, id) => `Commit ${m[1].slice(0, 7)} · ${id}`],
  [/^settings$/, (_, id) => `Settings · ${id}`],
  [/^upload\/[^/]+$/, (_, id) => `Upload files · ${id}`],
];

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function repositoryTitle(parts) {
  const id = `${parts[1]}/${parts[2]}`;
  const view = parts.slice(3).join("/");
  for (const [pattern, title] of REPO_VIEWS) {
    const match = pattern.exec(view);
    if (match) return title(match, id);
  }
  return NOT_FOUND;
}

function accountTitle(name, views, view) {
  if (view === undefined) return name;
  return views[view] ? `${views[view]} · ${name}` : NOT_FOUND;
}

/** The page part of the title for a route (`{ path }` is enough), "" for the home page. */
export function titleForRoute({ path }) {
  if (path in STATIC) return STATIC[path];
  const parts = path.split("/").filter(Boolean).map(decode);
  const [first, second, third] = parts;
  if (first === "docs") return "Documentation";
  if (first === "invite" && parts.length === 2)
    return "Organization invitation";
  if (TYPES.has(first) && parts.length >= 3) return repositoryTitle(parts);
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
