// src/utils/onnx-cache.js
//
// Remembers the weight descriptors of an ONNX file in the browser, so the serial
// walk over the initializers is paid once per file and browser. The key is the
// file's path plus its size; a real implementation should key on the file's
// object id from the tree API, so a rewritten file of the same size cannot match.

const DB_NAME = "cheesecave-onnx";
const STORE = "weights";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("no indexedDB"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const cacheKey = (url, size) =>
  `${new URL(url, "http://x").pathname}|${size}`;

export async function loadWeights(key) {
  try {
    return (await run("readonly", (store) => store.get(key))) || null;
  } catch {
    return null;
  }
}

export async function saveWeights(key, tensors) {
  try {
    await run("readwrite", (store) => store.put(tensors, key));
  } catch {
    // private window, quota, blocked storage: the cache is only a convenience
  }
}
