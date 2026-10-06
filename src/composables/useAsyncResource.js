import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
} from "vue";

import { AppError, KIND, decodeError } from "@/errors";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * One load that can fail: idle | loading | ready | empty | failed.
 *
 * Failures are decoded (`error` is an AppError), the last good `data` is kept,
 * a newer request supersedes an older one (its signal is aborted, its late
 * answer ignored), and a transient failure retries on its own, with a visible
 * countdown (`autoRetryIn`) the user can cancel.
 *
 * `fetcher({ signal })` returns the data. `autoRetry`: false, or `{ max }`
 * (default one retry).
 */
export function useAsyncResource(fetcher, options = {}) {
  const {
    immediate = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    autoRetry = {},
    isEmpty = (value) =>
      value === null ||
      value === undefined ||
      (Array.isArray(value) && !value.length),
    watch: sources = [],
  } = options;
  const maxRetries = autoRetry ? (autoRetry.max ?? 1) : 0;

  const status = ref(immediate ? "loading" : "idle");
  const data = shallowRef(null);
  const error = shallowRef(null);
  const retrying = ref(false);
  const autoRetryIn = ref(null);

  let controller = null;
  let requestId = 0;
  let retries = 0;
  let countdown = null;

  function cancelAutoRetry() {
    clearInterval(countdown);
    countdown = null;
    autoRetryIn.value = null;
  }

  function scheduleRetry(err) {
    if (!err.retriable || retries >= maxRetries) return;
    retries += 1;
    // what the server asked for, else 1 s, 2 s, 4 s ... (at most 8 s)
    autoRetryIn.value =
      err.retryAfter > 0
        ? Math.ceil(err.retryAfter / 1000)
        : Math.min(2 ** (retries - 1), 8);
    countdown = setInterval(() => {
      autoRetryIn.value -= 1;
      if (autoRetryIn.value <= 0) {
        cancelAutoRetry();
        load({ automatic: true });
      }
    }, 1000);
  }

  async function load({ automatic = false } = {}) {
    controller?.abort();
    cancelAutoRetry();
    if (!automatic) retries = 0;
    const id = ++requestId;
    const mine = (controller = new AbortController());
    retrying.value = status.value === "failed";
    status.value = "loading";
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        mine.abort();
        reject(new AppError({ kind: KIND.TIMEOUT }));
      }, timeoutMs);
    });
    try {
      const value = await Promise.race([
        fetcher({ signal: mine.signal }),
        timedOut,
      ]);
      if (id !== requestId) return;
      data.value = value;
      error.value = null;
      status.value = isEmpty(value) ? "empty" : "ready";
    } catch (raw) {
      if (id !== requestId) return;
      const err = raw instanceof AppError ? raw : decodeError(raw);
      if (err.kind === KIND.CANCELLED) return;
      error.value = err;
      status.value = "failed";
      scheduleRetry(err);
    } finally {
      clearTimeout(timer);
      if (id === requestId) retrying.value = false;
    }
  }

  /** Abandon whatever is in flight or counting down. */
  function stop() {
    controller?.abort();
    requestId += 1;
    cancelAutoRetry();
    retrying.value = false;
  }

  if (sources.length) watch(sources, () => load());
  if (getCurrentScope()) onScopeDispose(stop);
  if (immediate) load();

  return {
    status,
    data,
    error,
    retrying,
    autoRetryIn,
    loading: computed(() => status.value === "loading"),
    ready: computed(() => status.value === "ready"),
    empty: computed(() => status.value === "empty"),
    failed: computed(() => status.value === "failed"),
    reload: () => load(),
    cancelAutoRetry,
    stop,
  };
}
