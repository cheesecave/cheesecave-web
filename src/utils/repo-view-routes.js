import { normalizeCatchAllParam } from "./repo-paths";

const REPO_VIEW_ROUTES = new Map([
  ["/[type]s/[namespace]/[name]/", "card"],
  ["/[type]s/[namespace]/[name]/tree/[branch]/", "files"],
  ["/[type]s/[namespace]/[name]/tree/[branch]/[...path]", "files"],
  ["/[type]s/[namespace]/[name]/commits/[branch]/", "commits"],
]);
const ROOT_TABS = new Set(["card", "metadata", "viewer"]);
const loadRepoViewer = () => import("../components/repo/RepoViewer.vue");

/** A tuple preserves repository boundaries even when both names contain hyphens. */
export function getRouteViewKey(route) {
  const match = route.path.match(
    /^\/(models|datasets|spaces)\/([^/]+)\/([^/]+)/,
  );
  return match ? JSON.stringify(match.slice(1)) : route.path;
}

/** Keep one repository component across the generated tab route records. */
export function createRepoViewRoutes(routes) {
  return routes.map((record) => {
    const route = { ...record };
    if (record.children) {
      route.children = createRepoViewRoutes(record.children);
    }
    const tab = REPO_VIEW_ROUTES.get(record.name);
    if (!tab) return route;

    route.component = loadRepoViewer;
    route.props = (resolvedRoute) => ({
      repoType: resolvedRoute.params.type,
      namespace: resolvedRoute.params.namespace,
      name: resolvedRoute.params.name,
      branch: resolvedRoute.params.branch || "main",
      currentPath: normalizeCatchAllParam(resolvedRoute.params.path),
      tab:
        tab === "card" && ROOT_TABS.has(resolvedRoute.query.tab)
          ? resolvedRoute.query.tab
          : tab,
    });
    return route;
  });
}
