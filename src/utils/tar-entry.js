// Prototype (proto/indexed-tar-entry): how the pages decide that a .tar has an index sidecar, and how they probe for it.
// `?tarentry=new` switches the whole prototype on; without it every page behaves exactly as `main` does.

let modeSearch = null;
let modeValue = "today";
export function tarEntryMode() {
  try {
    // Called per row of a long list: do the URL parse and the storage write once per query string.
    const search = window.location.search;
    if (search === modeSearch) return modeValue;
    const q = new URLSearchParams(search).get("tarentry");
    if (q === "new" || q === "today") sessionStorage.setItem("tarentry", q);
    modeValue = sessionStorage.getItem("tarentry") === "new" ? "new" : "today";
    modeSearch = search;
    return modeValue;
  } catch {
    return "today";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `fn` until it stops throwing a transient error: waits[i] ms before retry i. `isTransient(err)` false means rethrow at once. */
export async function withRetry(fn, { waits = [300, 900], isTransient = () => true } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === waits.length) throw err;
      await sleep(waits[attempt]);
    }
  }
  throw lastError;
}

/** At most `limit` of the tasks run at once; resolves when all have. */
export async function runLimited(tasks, limit = 4) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const mine = next++;
      await tasks[mine]();
    }
  });
  await Promise.all(workers);
}

const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);

/**
 * The listing is paged in the server's order (bytewise on the key, a directory counted as `name/`), and each page continues
 * where the last ended. So when the sidecar's name sorts BEFORE the last key already loaded and it is not among the loaded
 * names, it does not exist: no probe is needed. Only a name that sorts after the last loaded key (the last rows of a page)
 * can still be on a later page. Non-ASCII names are left to the probe (UTF-16 and UTF-8 order differ for some characters).
 */
export function sidecarKnownAbsent(sidecarPath, loadedPaths, lastKey, hasMore) {
  if (loadedPaths.has(sidecarPath)) return false;
  if (!hasMore) return true; // the listing is complete: what is not in it is not there
  if (!lastKey || !isAscii(sidecarPath) || !isAscii(lastKey)) return false;
  return sidecarPath < lastKey;
}

/** The key of the last entry of a page, in the server's order. */
export function lastKeyOf(entries) {
  if (!entries?.length) return "";
  const e = entries[entries.length - 1];
  return e.type === "directory" ? `${e.path}/` : e.path;
}

// ---- Route-entry prefetch. The file page only mounts after the repository shell has loaded the repository, its owner and the
// README (about four round trips), and only then asks for the sidecar. The router knows the file the moment the link is
// followed, so the sidecar request can start there; the page takes the answer when it is ready for it.
import { parseTarIndex } from "@/utils/indexed-tar";
import { normalizeCatchAllParam } from "@/utils/repo-paths";

const prefetched = new Map(); // url -> { promise, at }
const PREFETCH_TTL_MS = 30_000;

export function sidecarUrlFor(repoType, namespace, name, branch, filePath) {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return "";
  return `/${repoType}s/${namespace}/${name}/resolve/${branch}/${filePath.slice(0, dot)}.json`;
}

export function prefetchTarSidecarForRoute(to) {
  if (tarEntryMode() !== "new") return;
  const seg = (to.path || "").split("/")[1];
  const repoType = { models: "model", datasets: "dataset", spaces: "space" }[seg];
  if (!repoType || !(to.path || "").includes("/blob/")) return;
  const filePath = normalizeCatchAllParam(to.params.file);
  if (!filePath.toLowerCase().endsWith(".tar")) return;
  const url = sidecarUrlFor(repoType, to.params.namespace, to.params.name, to.params.branch || "main", filePath);
  if (!url || prefetched.has(url)) return;
  const promise = parseTarIndex(url);
  promise.catch(() => {}); // taken or not, a failure here is only reported to whoever takes it
  prefetched.set(url, { promise, at: Date.now() });
}

/** The prefetched answer for `url` (a promise), once; null when there is none or it is stale. */
export function takePrefetchedSidecar(url) {
  const hit = prefetched.get(url);
  prefetched.delete(url);
  return hit && Date.now() - hit.at < PREFETCH_TTL_MS ? hit.promise : null;
}
