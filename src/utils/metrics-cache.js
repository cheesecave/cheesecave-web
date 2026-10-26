// src/utils/metrics-cache.js
//
// What was parsed from one log file, kept in the browser (IndexedDB) so the next visit does not
// read the file again. The key is the file's content id (`oid` from the tree listing: immutable for
// a given content), so a log that is replaced is read again and one that did not change never is.
//
// It also makes a cancelled or failed load of a big run resumable: every finished file is stored
// on its own, and a run of 117 files that stopped at the 90th starts from the 91st.
//
// Only the extracted numbers are stored, never the file (measured: a 546 MB file leaves 0.8 MB).
// Where IndexedDB is unavailable (private windows, blocked storage) every call quietly does nothing.

const DB_NAME = "cheesecave-metrics";
const STORE = "files";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        resolve(db);
        prune(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// once per session: drop what was not written for 30 days
function prune(db) {
  try {
    const tx = db.transaction(STORE, "readwrite");
    const cursor = tx.objectStore(STORE).openCursor();
    const limit = Date.now() - MAX_AGE_MS;
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      if ((c.value?.at ?? 0) < limit) c.delete();
      c.continue();
    };
  } catch {
    /* best effort */
  }
}

/** @returns {Promise<object|null>} */
export async function getCached(key) {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCached(key, value) {
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...value, at: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // quota exceeded and the like: not worth failing a load for
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** For tests and a "clear" button. */
export async function clearCache() {
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
  });
}
