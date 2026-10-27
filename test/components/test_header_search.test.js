import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeaderSearch from "@/components/layout/HeaderSearch.vue";
import { repoAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { ElementPlusStubs } from "../helpers/vue";

enableAutoUnmount(afterEach);

const fixtures = {
  model: [
    { id: "alice/model-one", private: true },
    { id: "alice/model-two" },
    { id: "alice/model-three" },
  ],
  dataset: [{ id: "bob/dataset-one" }],
  space: [{ id: "carol/space-one" }],
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

async function mountSearch() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/models/alice/current");
  await router.isReady();
  return {
    router,
    wrapper: mount(HeaderSearch, {
      attachTo: document.body,
      global: { plugins: [router], stubs: ElementPlusStubs },
    }),
  };
}

describe("repository header search", () => {
  let list;
  beforeEach(() => {
    setActivePinia(createPinia());
    list = vi
      .spyOn(repoAPI, "listRepos")
      .mockImplementation(async (type) => ({ data: fixtures[type] }));
  });
  afterEach(() => vi.useRealTimers());

  it("loads real local trending repositories in three groups only when opened", async () => {
    const { wrapper } = await mountSearch();
    expect(list).not.toHaveBeenCalled();
    await wrapper
      .get('input[aria-label="Search repositories"]')
      .trigger("focus");
    await flushPromises();
    const panel = wrapper.get(
      '[role="dialog"][aria-label="Search suggestions"]',
    );
    expect(panel.findAll("h2").map((title) => title.text())).toEqual([
      "Models",
      "Datasets",
      "Spaces",
    ]);
    expect(panel.findAll("a").map((link) => link.attributes("href"))).toEqual([
      "/models/alice/model-one",
      "/models/alice/model-two",
      "/models/alice/model-three",
      "/datasets/bob/dataset-one",
      "/spaces/carol/space-one",
    ]);
    expect(list).toHaveBeenCalledTimes(3);
    for (const type of ["model", "dataset", "space"]) {
      expect(list).toHaveBeenCalledWith(
        type,
        { fallback: false, sort: "trending", limit: 3, search: "" },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    }
  });

  it("debounces typing and hides results for the previous query immediately", async () => {
    const { wrapper } = await mountSearch();
    const input = wrapper.get('input[aria-label="Search repositories"]');
    await input.trigger("focus");
    await flushPromises();
    vi.useFakeTimers();
    list.mockImplementation(async (type, params) => ({
      data: [{ id: `alice/${type}-${params.search}` }],
    }));
    await input.setValue("ca");
    expect(wrapper.findAll(".header-search-result")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    await input.setValue(" cats ");
    await vi.advanceTimersByTimeAsync(299);
    expect(list).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(6);
    expect(list.mock.calls.slice(3).map(([, params]) => params.search)).toEqual(
      ["cats", "cats", "cats"],
    );
    expect(
      wrapper.findAll(".header-search-result").map((link) => link.text()),
    ).toEqual(["alice/model-cats", "alice/dataset-cats", "alice/space-cats"]);
  });

  it("keeps completed groups usable and retries only a failed group while another is pending", async () => {
    const gate = deferred();
    let spaceAttempts = 0;
    list.mockImplementation(async (type) => {
      if (type === "model") return gate.promise;
      if (type === "space" && ++spaceAttempts === 1)
        throw {
          response: {
            status: 503,
            data: { detail: "Temporarily unavailable" },
          },
        };
      return { data: fixtures[type] };
    });
    const { wrapper } = await mountSearch();
    await wrapper.get("input").trigger("focus");
    await flushPromises();
    expect(
      wrapper.get('section[aria-label="Models"] [role="status"]').text(),
    ).toBe("Loading models...");
    expect(
      wrapper.get('section[aria-label="Datasets"] a').attributes("href"),
    ).toBe("/datasets/bob/dataset-one");
    const spaces = wrapper.get('section[aria-label="Spaces"]');
    expect(spaces.find('[role="alert"]').exists()).toBe(true);
    await spaces
      .get('button[aria-label="Retry spaces search"]')
      .trigger("click");
    await flushPromises();
    expect(spaces.get("a").attributes("href")).toBe("/spaces/carol/space-one");
    expect(list.mock.calls.map(([type]) => type)).toEqual([
      "model",
      "dataset",
      "space",
      "space",
    ]);
    gate.resolve({ data: fixtures.model });
    await flushPromises();
    expect(
      wrapper.get('section[aria-label="Models"]').findAll("a"),
    ).toHaveLength(3);
  });

  it("cancels an older query and ignores its eventual response", async () => {
    const gate = deferred();
    list.mockImplementation(async (type, params) =>
      params.search ? { data: [{ id: `new/${type}` }] } : gate.promise,
    );
    const { wrapper } = await mountSearch();
    const input = wrapper.get("input");
    await input.trigger("focus");
    const oldSignals = list.mock.calls.map(([, , config]) => config.signal);
    vi.useFakeTimers();
    await input.setValue("new");
    expect(oldSignals.every((signal) => signal.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(
      wrapper.findAll(".header-search-result").map((link) => link.text()),
    ).toEqual(["new/model", "new/dataset", "new/space"]);
    gate.resolve({ data: [{ id: "old/stale" }] });
    await flushPromises();
    expect(wrapper.text()).not.toContain("old/stale");
    expect(wrapper.findAll(".header-search-result")).toHaveLength(3);
  });

  it("supports arrow navigation and closes with Escape, outside pointer or leaving focus", async () => {
    const { wrapper } = await mountSearch();
    const input = wrapper.get("input");
    input.element.focus();
    await flushPromises();
    await input.trigger("keydown", { key: "ArrowDown" });
    const links = wrapper.findAll(".header-search-result");
    expect(document.activeElement).toBe(links[0].element);
    await links[0].trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1].element);
    await links[1].trigger("keydown", { key: "ArrowUp" });
    expect(document.activeElement).toBe(links[0].element);
    await links[0].trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(input.element);
    expect(input.attributes("aria-expanded")).toBe("false");
    await input.trigger("click");
    await flushPromises();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await input.trigger("click");
    await flushPromises();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    outside.remove();
  });

  it("keeps modified and middle clicks native, and lets Enter open a real result", async () => {
    const { wrapper, router } = await mountSearch();
    const input = wrapper.get("input");
    await input.trigger("focus");
    await flushPromises();
    const link = wrapper.get("a.header-search-result");
    const modified = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      button: 0,
    });
    link.element.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(router.currentRoute.value.path).toBe("/models/alice/current");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    const middle = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    link.element.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/models/alice/model-one");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("cancels in-flight requests and pending typing when closed, then reopens the current query", async () => {
    const gate = deferred();
    list.mockImplementation(() => gate.promise);
    const { wrapper } = await mountSearch();
    const input = wrapper.get("input");
    await input.trigger("focus");
    const signals = list.mock.calls.map(([, , config]) => config.signal);
    vi.useFakeTimers();
    await input.setValue("hello");
    await input.trigger("keydown", { key: "Escape" });
    await vi.advanceTimersByTimeAsync(300);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(list).toHaveBeenCalledTimes(3);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    list.mockImplementation(async (type) => ({ data: fixtures[type] }));
    await input.trigger("click");
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(6);
    expect(list.mock.calls.slice(3).map(([, params]) => params.search)).toEqual(
      ["hello", "hello", "hello"],
    );
    gate.resolve({ data: [{ id: "old/private" }] });
    await flushPromises();
    expect(wrapper.text()).not.toContain("old/private");
  });

  it.each(["account", "token"])(
    "clears results and closes when the signed-in %s changes",
    async (changed) => {
      const auth = useAuthStore();
      auth.user = { id: 1, username: "alice" };
      const { wrapper } = await mountSearch();
      await wrapper.get("input").trigger("focus");
      await flushPromises();
      expect(wrapper.text()).toContain("alice/model-one");
      if (changed === "account") auth.user = null;
      else auth.token = "different-test-identity";
      await flushPromises();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      list.mockResolvedValue({ data: [] });
      await wrapper.get("input").trigger("click");
      await flushPromises();
      expect(wrapper.text()).not.toContain("alice/model-one");
      expect(wrapper.findAll(".header-search-result")).toHaveLength(0);
      expect(wrapper.text()).toContain("No models found");
    },
  );
});
