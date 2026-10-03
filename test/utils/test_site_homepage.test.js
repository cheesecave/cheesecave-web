import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "@/testing/msw";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";
import {
  DEFAULT_HOMEPAGE,
  fetchHomepage,
  isSafeHomepageUrl,
  normalizeHomepage,
} from "../../src/shared/site-homepage";

describe("homepage configuration", () => {
  afterEach(() => vi.useRealTimers());
  it("supplies defaults for partial configuration and drops unrecognized fields", () => {
    expect(normalizeHomepage({})).toEqual(DEFAULT_HOMEPAGE);
    const result = normalizeHomepage({
      title: "Our community",
      enabled: false,
      script: "ignored",
    });
    expect(result).toEqual({
      ...DEFAULT_HOMEPAGE,
      title: "Our community",
      enabled: false,
    });
    result.primary_label = "Changed";
    expect(DEFAULT_HOMEPAGE.primary_label).toBe("Get Started");
  });

  it.each([
    "",
    "/",
    "/register",
    "/models?sort=updated#recent",
    "https://docs.example.com/start",
    "http://localhost:48888/docs",
  ])("accepts a safe navigation target %s", (url) => {
    expect(isSafeHomepageUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example.com",
    "/\\evil.example.com",
    "https://user:password@example.com",
    "https://user@example.com",
    "https:example.com",
    "https://",
    "https://example.com\n",
    "/path\t",
    " /register",
    "mailto:hello@example.com",
    "/" + "a".repeat(2048),
    null,
    3,
  ])("rejects an unsafe or malformed target %s", (url) => {
    expect(isSafeHomepageUrl(url)).toBe(false);
  });

  it.each([
    null,
    [],
    "a string",
    { enabled: "false" },
    { animation_enabled: 1 },
    { show_repositories: null },
    { title: "   " },
    { title: null },
    { title: "x".repeat(201) },
    { eyebrow: "x".repeat(101) },
    { description: "x".repeat(2001) },
    { primary_label: "x".repeat(81) },
    { secondary_label: "x".repeat(81) },
    { illustration: "uploaded-html" },
    { primary_url: "javascript:alert(1)" },
    { secondary_url: "//external.example.com" },
  ])("rejects invalid published configuration %j", (config) => {
    expect(normalizeHomepage(config)).toBeNull();
  });

  it("counts non-BMP characters as characters and supports hiding optional content", () => {
    const config = {
      title: "🐭".repeat(200),
      eyebrow: "",
      description: "",
      primary_label: "",
      secondary_label: "",
      illustration: "none",
      animation_enabled: false,
      show_repositories: false,
    };
    expect(normalizeHomepage(config)).toEqual({
      ...DEFAULT_HOMEPAGE,
      ...config,
    });
    expect(normalizeHomepage({ title: "🐭".repeat(201) })).toBeNull();
  });

  it("fetches the latest public configuration with session credentials and no cached response", async () => {
    let request;
    server.use(
      http.get("/api/site-homepage", ({ request: incoming }) => {
        request = incoming;
        return jsonResponse({ title: "Published from admin" });
      }),
    );
    expect(await fetchHomepage()).toEqual({
      ...DEFAULT_HOMEPAGE,
      title: "Published from admin",
    });
    expect(request.credentials).toBe("same-origin");
    expect(request.cache).toBe("no-store");
  });

  it("rejects a failed configuration request", async () => {
    server.use(
      http.get("/api/site-homepage", () =>
        jsonResponse({ detail: "offline" }, { status: 503 }),
      ),
    );
    await expect(fetchHomepage()).rejects.toThrow(
      "Homepage configuration is unavailable",
    );
  });

  it("rejects an invalid configuration response", async () => {
    server.use(
      http.get("/api/site-homepage", () =>
        jsonResponse({ primary_url: "javascript:alert(1)" }),
      ),
    );
    await expect(fetchHomepage()).rejects.toThrow(
      "Invalid homepage configuration",
    );
  });
  function installPendingFetch() {
    let requestSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, { signal }) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => {
          const abort = () =>
            reject(new DOMException("Request aborted", "AbortError"));
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
      }),
    );
    return () => requestSignal;
  }

  it("aborts a stalled configuration request after four seconds", async () => {
    vi.useFakeTimers();
    const getSignal = installPendingFetch();
    const result = fetchHomepage().catch((error) => error);
    await vi.advanceTimersByTimeAsync(3999);
    expect(getSignal().aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(getSignal().aborted).toBe(true);
    expect((await result).name).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forwards caller cancellation and cleans up its timeout and listener", async () => {
    vi.useFakeTimers();
    const getSignal = installPendingFetch();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = fetchHomepage({ signal: controller.signal }).catch(
      (error) => error,
    );
    controller.abort();
    expect((await result).name).toBe("AbortError");
    expect(getSignal().aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors a signal cancelled before the request begins", async () => {
    vi.useFakeTimers();
    const getSignal = installPendingFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchHomepage({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getSignal().aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up the timeout and caller listener after a successful response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    expect(await fetchHomepage({ signal: controller.signal })).toEqual(
      DEFAULT_HOMEPAGE,
    );
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
