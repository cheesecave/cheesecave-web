import { describe, expect, it, vi } from "vitest";

import {
  RETRY_WAITS,
  isTransientFetchFailure,
  runLimited,
  withRetry,
} from "@/utils/retry";

describe("isTransientFetchFailure", () => {
  it("treats a network-level fetch failure (TypeError) as transient", () => {
    expect(isTransientFetchFailure(new TypeError("Failed to fetch"))).toBe(
      true,
    );
  });

  it("treats 429 and 5xx answers as transient", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(
        isTransientFetchFailure(Object.assign(new Error("x"), { status })),
      ).toBe(true);
    }
  });

  it("does not retry answers that will not change: 4xx other than 429, format errors, aborts", () => {
    for (const status of [400, 401, 403, 404, 416]) {
      expect(
        isTransientFetchFailure(Object.assign(new Error("x"), { status })),
      ).toBe(false);
    }
    expect(isTransientFetchFailure(new Error("plain"))).toBe(false);
    expect(
      isTransientFetchFailure(
        Object.assign(new Error("x"), { name: "AbortError" }),
      ),
    ).toBe(false);
    expect(isTransientFetchFailure(null)).toBe(false);
    expect(isTransientFetchFailure(undefined)).toBe(false);
  });
});

describe("withRetry", () => {
  const sleepless = { waits: [0, 0] };

  it("returns the first success without waiting", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, sleepless)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and passes the attempt number", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("third time");
    await expect(withRetry(fn, sleepless)).resolves.toBe("third time");
    expect(fn.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });

  it("gives up after the last wait and rethrows the last error", async () => {
    const err = new TypeError("Failed to fetch");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, sleepless)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rethrows at once when the error is not transient", async () => {
    const err = Object.assign(new Error("gone"), { status: 404 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, sleepless)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours a custom isTransient", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("odd"));
    await expect(
      withRetry(fn, { waits: [0], isTransient: () => true }),
    ).rejects.toThrow("odd");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when the signal is aborted", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new TypeError("Failed to fetch");
    });
    await expect(
      withRetry(fn, { waits: [0, 0], signal: controller.signal }),
    ).rejects.toThrow(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits between attempts (default 300 ms, then 900 ms)", async () => {
    vi.useFakeTimers();
    try {
      expect(RETRY_WAITS).toEqual([300, 900]);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("a"))
        .mockRejectedValueOnce(new TypeError("b"))
        .mockResolvedValueOnce("done");
      const promise = withRetry(fn);
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(299);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(899);
      expect(fn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runLimited", () => {
  it("runs every task and returns the results in the order of the tasks", async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 10);
    await expect(runLimited(tasks, 2)).resolves.toEqual([10, 20, 30, 40, 50]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running -= 1;
    });
    await runLimited(tasks, 4);
    expect(peak).toBe(4);
  });

  it("copes with no tasks and with a limit larger than the number of tasks", async () => {
    await expect(runLimited([], 4)).resolves.toEqual([]);
    await expect(runLimited([async () => "a"], 4)).resolves.toEqual(["a"]);
  });

  it("rejects with the first failure", async () => {
    const boom = new Error("boom");
    await expect(
      runLimited([async () => 1, async () => { throw boom; }, async () => 3], 2),
    ).rejects.toBe(boom);
  });
});
