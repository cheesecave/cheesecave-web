import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import { AppError, KIND } from "@/errors";
import { useAsyncResource } from "@/composables/useAsyncResource";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};
const failure = (status, extra = {}) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
    ...extra,
  });

let scope;
const make = (fetcher, options) => {
  scope = effectScope();
  return scope.run(() => useAsyncResource(fetcher, options));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  scope?.stop();
  vi.useRealTimers();
});

describe("useAsyncResource", () => {
  it("loads on creation and then holds the data", async () => {
    const r = make(async () => ({ id: 1 }));
    expect(r.status.value).toBe("loading");
    expect(r.loading.value).toBe(true);
    await flush();
    expect(r.status.value).toBe("ready");
    expect(r.ready.value).toBe(true);
    expect(r.data.value).toEqual({ id: 1 });
    expect(r.error.value).toBeNull();
  });

  it("tells an empty answer from a failed one", async () => {
    const empty = make(async () => []);
    await flush();
    expect(empty.status.value).toBe("empty");
    expect(empty.empty.value).toBe(true);
    expect(empty.failed.value).toBe(false);
    const nothing = make(async () => null);
    await flush();
    expect(nothing.status.value).toBe("empty");
    const custom = make(async () => ({ items: [] }), {
      isEmpty: (v) => v.items.length === 0,
    });
    await flush();
    expect(custom.status.value).toBe("empty");
  });

  it("fails with a decoded error and keeps the last good data", async () => {
    let n = 0;
    const r = make(
      async () => {
        n += 1;
        if (n === 2) throw failure(404);
        return { n };
      },
      { autoRetry: false },
    );
    await flush();
    await r.reload();
    await flush();
    expect(r.status.value).toBe("failed");
    expect(r.failed.value).toBe(true);
    expect(r.error.value).toBeInstanceOf(AppError);
    expect(r.error.value.kind).toBe(KIND.NOT_FOUND);
    expect(r.data.value).toEqual({ n: 1 });
  });

  it("does not start until asked when immediate is off", async () => {
    const fetcher = vi.fn(async () => 1);
    const r = make(fetcher, { immediate: false });
    expect(r.status.value).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
    await r.reload();
    expect(r.data.value).toBe(1);
  });

  it("gives the fetcher a signal, and aborts it when superseded", async () => {
    const signals = [];
    const r = make(
      (ctx) => {
        signals.push(ctx.signal);
        return new Promise(() => {});
      },
      { autoRetry: false },
    );
    r.reload();
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("ignores an answer that arrived after a newer request began", async () => {
    const resolvers = [];
    const r = make(() => new Promise((resolve) => resolvers.push(resolve)), {
      autoRetry: false,
    });
    r.reload();
    resolvers[1]("new");
    await flush();
    resolvers[0]("old");
    await flush();
    expect(r.data.value).toBe("new");
  });

  it("ignores a failure that arrived after a newer request began", async () => {
    const rejecters = [];
    const r = make(() => new Promise((_, reject) => rejecters.push(reject)), {
      autoRetry: false,
    });
    r.reload();
    rejecters[0](failure(500));
    await flush();
    expect(r.status.value).toBe("loading");
  });

  it("gives up waiting after the timeout, even when the fetcher ignores its signal", async () => {
    const r = make(() => new Promise(() => {}), {
      timeoutMs: 5000,
      autoRetry: false,
    });
    await vi.advanceTimersByTimeAsync(5001);
    expect(r.status.value).toBe("failed");
    expect(r.error.value.kind).toBe(KIND.TIMEOUT);
  });

  it("goes back to what it knew when stopped mid-load", async () => {
    let n = 0;
    const r = make(
      async () => {
        n += 1;
        if (n === 1) return { id: 1 };
        return new Promise(() => {});
      },
      { autoRetry: false },
    );
    await flush();
    r.reload();
    expect(r.status.value).toBe("loading");
    r.stop();
    expect(r.status.value).toBe("ready");
    expect(r.data.value).toEqual({ id: 1 });

    const fresh = make(() => new Promise(() => {}), { autoRetry: false });
    fresh.stop();
    expect(fresh.status.value).toBe("idle");
    const empty = make(async () => [], { autoRetry: false });
    await flush();
    empty.reload();
    empty.stop();
    expect(empty.status.value).toBe("empty");
    let fail = false;
    const failed = make(
      async () => {
        if (fail) return new Promise(() => {});
        throw failure(404);
      },
      { autoRetry: false },
    );
    await flush();
    fail = true;
    failed.reload();
    failed.stop();
    expect(failed.status.value).toBe("failed");
  });

  it("stays quiet about a request it cancelled itself", async () => {
    const r = make(
      (ctx) =>
        new Promise((_, reject) =>
          ctx.signal.addEventListener("abort", () =>
            reject(new DOMException("a", "AbortError")),
          ),
        ),
      { autoRetry: false },
    );
    r.stop();
    await flush();
    expect(r.error.value).toBeNull();
  });

  it("treats a fetcher that was cancelled by someone else as no failure", async () => {
    const r = make(
      async () => {
        throw new DOMException("a", "AbortError");
      },
      { autoRetry: false },
    );
    await flush();
    expect(r.status.value).toBe("loading");
    expect(r.error.value).toBeNull();
  });

  it("marks a manual retry as retrying until it settles", async () => {
    let fail = true;
    const r = make(
      async () => {
        if (fail) throw failure(500);
        return "ok";
      },
      { autoRetry: false },
    );
    await flush();
    expect(r.retrying.value).toBe(false);
    fail = false;
    const pending = r.reload();
    expect(r.retrying.value).toBe(true);
    await pending;
    expect(r.retrying.value).toBe(false);
    expect(r.data.value).toBe("ok");
  });

  describe("automatic retry", () => {
    it("retries a transient failure after a short countdown, showing it", async () => {
      let n = 0;
      const r = make(async () => {
        n += 1;
        if (n === 1) throw failure(503);
        return "ok";
      });
      await flush();
      expect(r.status.value).toBe("failed");
      expect(r.autoRetryIn.value).toBe(1);
      await vi.advanceTimersByTimeAsync(1001);
      await flush();
      expect(r.autoRetryIn.value).toBeNull();
      expect(r.status.value).toBe("ready");
      expect(r.data.value).toBe("ok");
    });

    it("counts down in whole seconds for a longer wait, and honours Retry-After", async () => {
      let n = 0;
      const r = make(
        async () => {
          n += 1;
          throw failure(429, {
            response: {
              status: 429,
              headers: { "retry-after": "3" },
              data: {},
            },
          });
        },
        { autoRetry: { max: 1 } },
      );
      await flush();
      expect(r.autoRetryIn.value).toBe(3);
      await vi.advanceTimersByTimeAsync(1000);
      expect(r.autoRetryIn.value).toBe(2);
      await vi.advanceTimersByTimeAsync(2001);
      await flush();
      expect(n).toBe(2);
    });

    it("does not count down a wait of more than a minute", async () => {
      const r = make(async () => {
        throw failure(429, {
          response: {
            status: 429,
            headers: { "retry-after": "3600" },
            data: {},
          },
        });
      });
      await flush();
      expect(r.status.value).toBe("failed");
      expect(r.autoRetryIn.value).toBeNull();
    });

    it("stops retrying after the allowed attempts", async () => {
      let n = 0;
      const r = make(async () => {
        n += 1;
        throw failure(503);
      });
      await flush();
      await vi.advanceTimersByTimeAsync(1100);
      await flush();
      expect(n).toBe(2);
      expect(r.autoRetryIn.value).toBeNull();
      expect(r.status.value).toBe("failed");
    });

    it("does not retry what trying again cannot fix", async () => {
      const r = make(async () => {
        throw failure(404);
      });
      await flush();
      expect(r.autoRetryIn.value).toBeNull();
    });

    it("can be cancelled by the user", async () => {
      let n = 0;
      const r = make(async () => {
        n += 1;
        throw failure(503);
      });
      await flush();
      r.cancelAutoRetry();
      expect(r.autoRetryIn.value).toBeNull();
      await vi.advanceTimersByTimeAsync(5000);
      expect(n).toBe(1);
    });

    it("is off when asked", async () => {
      const r = make(
        async () => {
          throw failure(503);
        },
        { autoRetry: false },
      );
      await flush();
      expect(r.autoRetryIn.value).toBeNull();
    });
  });

  it("reloads when a watched source changes", async () => {
    const id = ref(1);
    const fetcher = vi.fn(async () => id.value);
    const r = make(fetcher, { watch: [id] });
    await flush();
    id.value = 2;
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r.data.value).toBe(2);
  });

  it("stops everything when its scope ends", async () => {
    let n = 0;
    const r = make(async () => {
      n += 1;
      throw failure(503);
    });
    await flush();
    scope.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(n).toBe(1);
    expect(r.autoRetryIn.value).toBeNull();
  });
});
