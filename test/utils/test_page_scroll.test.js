import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter, createWebHistory } from "vue-router/auto";
import { createPageScrollBehavior } from "@/utils/page-scroll";

let controller;
let navigate;
let beforeNavigation;
let afterNavigation;
let currentRoute;
let observers;
let removeBefore;
let removeAfter;

function createWrap(height = 2000) {
  const wrap = document.createElement("div");
  wrap.className = "page-scroll-wrap";
  wrap.innerHTML = '<div class="page-scroll-content"></div>';
  let scrollTop = 0;
  Object.defineProperties(wrap, {
    clientHeight: { value: 100 },
    scrollHeight: { get: () => height },
    scrollTop: {
      get: () => scrollTop,
      set: (value) => {
        scrollTop = Math.max(0, Math.min(value, height - 100));
      },
    },
  });
  wrap.getBoundingClientRect = () => ({ top: 64 });
  wrap.setHeight = (value) => {
    height = value;
    observers
      .filter((observer) => !observer.disconnected)
      .forEach((observer) => observer.callback());
  };
  document.body.append(wrap);
  return wrap;
}

async function settle() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 1));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  observers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  );
  history.replaceState({ position: 0 }, "", "/");
  currentRoute = { fullPath: "", hash: "" };
  removeBefore = vi.fn();
  removeAfter = vi.fn();
  controller = createPageScrollBehavior();
  controller.install({
    beforeEach(callback) {
      beforeNavigation = callback;
      return removeBefore;
    },
    afterEach(callback) {
      afterNavigation = callback;
      return removeAfter;
    },
  });
  navigate = (fullPath, position, pop = false, savedWindowPosition = null) => {
    const route = {
      fullPath,
      hash: fullPath.includes("#") ? fullPath.slice(fullPath.indexOf("#")) : "",
    };
    if (pop) history.replaceState({ position }, "", "/");
    beforeNavigation();
    if (!pop) history.replaceState({ position }, "", "/");
    afterNavigation(route, currentRoute);
    const result = controller.scrollBehavior(
      route,
      currentRoute,
      savedWindowPosition,
    );
    currentRoute = route;
    return result;
  };
});

afterEach(() => {
  controller.dispose();
  vi.useRealTimers();
});

describe("page scroll navigation", () => {
  it("follows Vue Router's real guard, history and deferred scrollBehavior ordering", async () => {
    controller.dispose();
    controller = createPageScrollBehavior();
    const routerHistory = createWebHistory();
    const router = createRouter({
      history: routerHistory,
      routes: ["/", "/models", "/datasets"].map((path) => ({
        path,
        component: { render: () => null },
      })),
      scrollBehavior: controller.scrollBehavior,
    });
    controller.install(router);
    const wrap = createWrap();
    try {
      await router.push("/models");
      await settle();
      wrap.scrollTop = 470;
      await router.push("/datasets");
      await settle();
      expect(wrap.scrollTop).toBe(0);
      wrap.scrollTop = 820;
      router.back();
      await settle();
      expect(router.currentRoute.value.path).toBe("/models");
      expect(wrap.scrollTop).toBe(470);
      router.forward();
      await settle();
      expect(router.currentRoute.value.path).toBe("/datasets");
      expect(wrap.scrollTop).toBe(820);
    } finally {
      routerHistory.destroy();
    }
  });

  it("resets pushes and restores each back/forward entry's inner position", () => {
    const wrap = createWrap();
    navigate("/models", 0);
    wrap.scrollTop = 420;
    wrap.scrollLeft = 15;
    expect(navigate("/datasets", 1)).toBe(false);
    expect(wrap.scrollTop).toBe(0);
    wrap.scrollTop = 730;
    navigate("/models", 0, true, { top: 19, left: 0 });
    expect(wrap.scrollTop).toBe(420);
    expect(wrap.scrollLeft).toBe(15);
    navigate("/datasets", 1, true, { top: 20, left: 0 });
    expect(wrap.scrollTop).toBe(730);
  });

  it("keeps repeated URLs in separate history entries and discards replaced forward entries", () => {
    const wrap = createWrap();
    navigate("/models", 0);
    wrap.scrollTop = 250;
    navigate("/datasets", 1);
    wrap.scrollTop = 600;
    navigate("/models", 2);
    wrap.scrollTop = 900;
    navigate("/models", 0, true);
    expect(wrap.scrollTop).toBe(250);
    navigate("/datasets", 1);
    expect(wrap.scrollTop).toBe(0);
    wrap.scrollTop = 100;
    navigate("/models", 0, true);
    navigate("/datasets", 1, true);
    expect(wrap.scrollTop).toBe(100);
  });

  it("restores after async content provides enough height", async () => {
    const wrap = createWrap();
    navigate("/models", 0);
    wrap.scrollTop = 800;
    navigate("/datasets", 1);
    wrap.setHeight(200);
    navigate("/models", 0, true);
    expect(wrap.scrollTop).toBe(100);
    wrap.setHeight(1200);
    await settle();
    expect(wrap.scrollTop).toBe(800);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
  });

  it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
    "stops pending restoration after %s user input",
    async (type) => {
      const wrap = createWrap();
      navigate("/models", 0);
      wrap.scrollTop = 800;
      navigate("/datasets", 1);
      wrap.setHeight(200);
      navigate("/models", 0, true);
      document.dispatchEvent(
        type === "keydown"
          ? new KeyboardEvent(type, { key: "PageDown" })
          : new Event(type),
      );
      wrap.scrollTop = 40;
      wrap.setHeight(1200);
      await settle();
      expect(wrap.scrollTop).toBe(40);
    },
  );

  it("cancels a pending restore when navigating elsewhere", async () => {
    const wrap = createWrap();
    navigate("/models", 0);
    wrap.scrollTop = 800;
    navigate("/datasets", 1);
    wrap.setHeight(200);
    navigate("/models", 0, true);
    navigate("/spaces", 1);
    wrap.setHeight(1200);
    await settle();
    expect(wrap.scrollTop).toBe(0);
  });

  it("waits for the initial app scroll area and asynchronously rendered hash target", async () => {
    navigate("/models#model%20card", 0);
    const wrap = createWrap();
    await settle();
    const target = document.createElement("h2");
    target.id = "model card";
    target.style.scrollMarginTop = "12px";
    target.getBoundingClientRect = () => ({ top: 64 + 650 - wrap.scrollTop });
    wrap.firstElementChild.append(target);
    await settle();
    expect(wrap.scrollTop).toBe(638);
  });

  it("expires an impossible restore without moving later user scroll", async () => {
    const wrap = createWrap();
    navigate("/models", 0);
    wrap.scrollTop = 800;
    navigate("/datasets", 1);
    wrap.setHeight(200);
    navigate("/models", 0, true);
    await vi.advanceTimersByTimeAsync(5000);
    wrap.scrollTop = 30;
    wrap.setHeight(1200);
    await settle();
    expect(wrap.scrollTop).toBe(30);
  });

  it("ignores obsolete deferred scrollBehavior calls and disposes guards", () => {
    const wrap = createWrap();
    navigate("/models", 0);
    const staleRoute = currentRoute;
    navigate("/datasets", 1);
    wrap.scrollTop = 400;
    expect(controller.scrollBehavior(staleRoute)).toBe(false);
    expect(wrap.scrollTop).toBe(400);
    controller.dispose();
    expect(removeBefore).toHaveBeenCalled();
    expect(removeAfter).toHaveBeenCalled();
  });
});
