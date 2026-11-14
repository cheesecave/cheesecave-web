// Retry helper for reads that go to the object-storage host (the tar sidecar, tar member ranges).
//
// A fetch to that host can fail for reasons that vanish a moment later: a dropped or reset connection, a
// timeout, a 429, an edge 5xx. The browser reports most of them as the same `TypeError`, so they cannot be
// told apart; trying again is the only useful answer. Failures that will not change (404, 403, a damaged
// file, an abort) are not retried.

/** Pauses before the 2nd and the 3rd attempt, in ms. */
export const RETRY_WAITS = [300, 900];

/**
 * Is this fetch failure worth another attempt?
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientFetchFailure(err) {
  if (!err || err.name === "AbortError") return false;
  if (err instanceof TypeError) return true;
  const status = err.status;
  return typeof status === "number" && (status === 429 || status >= 500);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn(attempt)` until it succeeds, waiting `waits[i]` ms before retry i.
 * The last error is rethrown once the waits run out, or at once if it is not transient
 * or the signal is aborted.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{waits?: number[], isTransient?: (err: unknown) => boolean, signal?: AbortSignal}} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(
  fn,
  { waits = RETRY_WAITS, isTransient = isTransientFetchFailure, signal } = {},
) {
  for (let attempt = 0; attempt < waits.length; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (signal?.aborted || !isTransient(err)) throw err;
      await sleep(waits[attempt]);
    }
  }
  // The last attempt: whatever it throws is the answer.
  return fn(waits.length);
}

/**
 * Run async tasks with at most `limit` of them in flight, results in task order.
 * Used where one page would otherwise fire dozens of requests at once.
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
export async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}
