import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterLinkStub, ElementPlusStubs } from "../helpers/vue";
const mocks = vi.hoisted(() => ({ getFeed: vi.fn() }));
vi.mock("@/utils/api", () => ({ workspaceAPI: { getFeed: mocks.getFeed } }));
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceActivity } from "@/components/home/workspace/useWorkspaceActivity";
import WorkspaceFeed from "@/components/home/workspace/WorkspaceFeed.vue";

function event(id = "commit:1", overrides = {}) {
  return {
    id,
    kind: "commit",
    created_at: "2026-10-04T03:04:05Z",
    actor: { username: "alice", full_name: "Alice", is_org: false },
    namespace: { username: "research-lab", is_org: true },
    repository: { id: "research-lab/model.v1", type: "model", private: true },
    commit: {
      sha: "abcdef0123456789",
      message: "Update weights\n<script>alert(1)</script>",
    },
    ...overrides,
  };
}
function response(items, more = false, cursor = null) {
  return { data: { items, has_more: more, next_cursor: cursor } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const Harness = defineComponent({
  setup(_, { expose }) {
    const activity = useWorkspaceActivity();
    expose(activity);
    return () =>
      h(WorkspaceFeed, {
        username: useAuthStore().username,
        organizations: useAuthStore().organizations,
        scope: activity.scope.value,
        type: activity.type.value,
        "onUpdate:scope": (value) => {
          activity.scope.value = value;
        },
        "onUpdate:type": (value) => {
          activity.type.value = value;
        },
        items: activity.items.value,
        loading: activity.loading.value,
        error: activity.error.value,
        hasMore: activity.hasMore.value,
        onRetry: activity.retry,
        onLoadMore: activity.loadMore,
      });
  },
});

describe("workspace activity", () => {
  const wrappers = [];
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    useAuthStore().user = { username: "alice" };
    mocks.getFeed.mockResolvedValue(response([event()]));
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
  function render() {
    const wrapper = mount(Harness, {
      global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
    });
    wrappers.push(wrapper);
    return wrapper;
  }
  function button(wrapper, label) {
    const buttons = ["All", "Models", "Datasets", "Spaces", "Likes"].includes(
      label,
    )
      ? wrapper.get('[aria-label="Activity category"]').findAll("button")
      : wrapper.findAll("button");
    return buttons.find((item) => item.text() === label);
  }

  async function selectScope(wrapper, command) {
    wrapper.getComponent({ name: "ElDropdown" }).vm.$emit("command", command);
    await nextTick();
  }

  it("renders real commit, creation and like events with UTC time and correct account links", async () => {
    mocks.getFeed.mockResolvedValue(
      response([
        event(),
        event("repo_created:2", {
          kind: "repo_created",
          actor: null,
          commit: null,
        }),
        event("like:3", {
          kind: "like",
          created_at: "2026-10-03T19:20:21Z",
          actor: {
            username: "contributors",
            full_name: "Contributors",
            is_org: true,
          },
          commit: null,
        }),
      ]),
    );
    const wrapper = render();
    await flushPromises();
    const cards = wrapper.findAll(".activity-card");
    expect(cards).toHaveLength(3);
    expect(cards[0].get(".activity-actor-link").text()).toBe("Alice");
    expect(cards[0].get(".activity-actor-link").attributes("href")).toBe(
      "/alice",
    );
    expect(cards[0].text().replace(/\s+/g, " ")).toContain(
      "Alice updated a Model",
    );
    expect(
      cards[0]
        .get('a[href="/models/research-lab/model.v1/commit/abcdef0123456789"]')
        .text(),
    ).toBe("abcdef0");
    expect(cards[0].get("time").attributes("datetime")).toBe(
      "2026-10-04T03:04:05.000Z",
    );
    expect(cards[0].get("time").attributes("title")).toBe(
      "2026-10-04 03:04:05 UTC",
    );
    expect(cards[2].get("time").attributes("datetime")).toBe(
      "2026-10-03T19:20:21.000Z",
    );
    expect(cards[0].text()).toContain("Private");
    expect(cards[0].text()).toContain("<script>alert(1)</script>");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(cards[1].text().replace(/\s+/g, " ")).toContain(
      "Unknown user created a Model",
    );
    expect(cards[1].text()).not.toContain("fake-creator");
    expect(cards[2].get(".activity-actor-link").text()).toBe("Contributors");
    expect(cards[2].text()).toContain("liked a Model");
  });

  it("requests server scopes and repository types, clearing old cards before the new filter resolves", async () => {
    const pending = deferred();
    const wrapper = render();
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "all",
      repo_type: "all",
      limit: 20,
    });
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    await selectScope(wrapper, "following");
    expect(wrapper.find(".activity-card").exists()).toBe(false);
    expect(wrapper.text()).toContain("Loading activity");
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "following",
      repo_type: "all",
      limit: 20,
    });
    await button(wrapper, "Datasets").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "following",
      repo_type: "dataset",
      event_type: "repository",
      limit: 20,
    });
    pending.resolve(response([event("commit:stale")]));
    await flushPromises();
    expect(wrapper.find('[data-event-id="commit:stale"]').exists()).toBe(false);
  });

  it("appends the opaque cursor page and deduplicates event IDs", async () => {
    mocks.getFeed.mockResolvedValueOnce(
      response([event()], true, "opaque/+=="),
    );
    mocks.getFeed.mockResolvedValueOnce(
      response([event(), event("like:2", { kind: "like", commit: null })]),
    );
    const wrapper = render();
    await flushPromises();
    await button(wrapper, "Load more").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "all",
      repo_type: "all",
      limit: 20,
      cursor: "opaque/+==",
    });
    expect(wrapper.findAll(".activity-card")).toHaveLength(2);
    expect(wrapper.findAll('[data-event-id="commit:1"]')).toHaveLength(1);
    expect(button(wrapper, "Load more")).toBeUndefined();
    expect(wrapper.text()).toContain("You're up to date.");
  });

  it("selects Self through the dropdown and sends the self scope", async () => {
    const wrapper = render();
    await flushPromises();
    await selectScope(wrapper, "self");
    await flushPromises();
    expect(wrapper.get('[aria-label="Filter activity"]').text()).toBe("Self");
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "self",
      repo_type: "all",
      limit: 20,
    });
    expect(wrapper.text()).not.toContain("Personal");
  });

  it("changes organization scope and category atomically without requesting an intermediate Likes view", async () => {
    useAuthStore().userOrganizations = [{ name: "research-lab" }];
    const wrapper = render();
    await flushPromises();
    await button(wrapper, "Likes").trigger("click");
    await flushPromises();
    const previousCalls = mocks.getFeed.mock.calls.length;
    const pending = deferred();
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    wrapper.vm.setFilters("org:research-lab", "all");
    expect(wrapper.vm.items).toEqual([]);
    expect(wrapper.vm.hasMore).toBe(false);
    expect(wrapper.vm.type).toBe("all");
    expect(mocks.getFeed).toHaveBeenCalledTimes(previousCalls + 1);
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "research-lab",
      repo_type: "all",
      limit: 20,
    });
    wrapper.vm.setFilters("all", "all");
    await flushPromises();
    pending.resolve(response([event("like:stale-org")], true, "old-page"));
    await flushPromises();
    expect(wrapper.find('[data-event-id="like:stale-org"]').exists()).toBe(
      false,
    );
    expect(wrapper.vm.scope).toBe("all");
    expect(wrapper.vm.hasMore).toBe(false);
  });

  it.each([
    ["Models", "model"],
    ["Datasets", "dataset"],
    ["Spaces", "space"],
  ])(
    "requests only repository events for the %s category while keeping Following scope",
    async (label, type) => {
      const wrapper = render();
      await flushPromises();
      mocks.getFeed.mockResolvedValueOnce(
        response([event()], true, "old-category-page"),
      );
      await selectScope(wrapper, "following");
      await flushPromises();
      const pending = deferred();
      mocks.getFeed.mockReturnValueOnce(pending.promise);
      await button(wrapper, label).trigger("click");
      expect(wrapper.vm.items).toEqual([]);
      expect(wrapper.vm.hasMore).toBe(false);
      expect(button(wrapper, label).attributes("aria-pressed")).toBe("true");
      expect(
        wrapper
          .get('[aria-label="Filter activity"]')
          .get(".scope-label")
          .text(),
      ).toBe("Following");
      expect(mocks.getFeed).toHaveBeenLastCalledWith({
        scope: "following",
        repo_type: type,
        event_type: "repository",
        limit: 20,
      });
      pending.resolve(
        response([
          event(`repo_created:${type}`, {
            kind: "repo_created",
            actor: null,
            commit: null,
            repository: { id: `research-lab/${type}`, type, private: false },
          }),
        ]),
      );
      await flushPromises();
      expect(
        wrapper.get(".activity-card").text().replace(/\s+/g, " "),
      ).toContain(
        `Unknown user created a ${{ model: "Model", dataset: "Dataset", space: "Space" }[type]}`,
      );
      await button(wrapper, "All").trigger("click");
      await flushPromises();
      expect(mocks.getFeed).toHaveBeenLastCalledWith({
        scope: "following",
        repo_type: "all",
        limit: 20,
      });
    },
  );

  it.each(["following", "org:research-lab"])(
    "paginates Likes across repository types while preserving %s",
    async (scope) => {
      useAuthStore().userOrganizations = [{ name: "research-lab" }];
      const wrapper = render();
      await flushPromises();
      mocks.getFeed.mockResolvedValueOnce(
        response([event()], true, "old-scope-cursor"),
      );
      await selectScope(wrapper, scope);
      await flushPromises();
      const modelLike = event("like:model", {
        kind: "like",
        commit: null,
        repository: { id: "research-lab/model", type: "model", private: false },
      });
      const datasetLike = event("like:dataset", {
        kind: "like",
        commit: null,
        repository: {
          id: "research-lab/data",
          type: "dataset",
          private: false,
        },
      });
      const spaceLike = event("like:space", {
        kind: "like",
        commit: null,
        repository: { id: "research-lab/demo", type: "space", private: false },
      });
      const pending = deferred();
      mocks.getFeed.mockReturnValueOnce(pending.promise);
      await button(wrapper, "Likes").trigger("click");
      const params = {
        scope: scope === "following" ? "following" : "organization",
        ...(scope.startsWith("org:") ? { organization: "research-lab" } : {}),
        repo_type: "all",
        event_type: "like",
        limit: 20,
      };
      expect(mocks.getFeed).toHaveBeenLastCalledWith(params);
      expect(wrapper.vm.items).toEqual([]);
      expect(wrapper.vm.hasMore).toBe(false);
      expect(wrapper.vm.scope).toBe(scope);
      pending.resolve(response([modelLike, datasetLike], true, "likes/+=="));
      await flushPromises();
      expect(wrapper.findAll(".activity-card")).toHaveLength(2);
      expect(wrapper.text()).toContain("liked a Model");
      mocks.getFeed.mockResolvedValueOnce(response([datasetLike, spaceLike]));
      await button(wrapper, "Load more").trigger("click");
      await flushPromises();
      expect(mocks.getFeed).toHaveBeenLastCalledWith({
        ...params,
        cursor: "likes/+==",
      });
      expect(wrapper.findAll(".activity-card")).toHaveLength(3);
      expect(
        wrapper.find('a[href="/models/research-lab/model"]').exists(),
      ).toBe(true);
      expect(
        wrapper.find('a[href="/datasets/research-lab/data"]').exists(),
      ).toBe(true);
      expect(wrapper.find('a[href="/spaces/research-lab/demo"]').exists()).toBe(
        true,
      );
    },
  );

  it("rejects an old Likes cursor response after choosing a repository category", async () => {
    const wrapper = render();
    await flushPromises();
    mocks.getFeed.mockResolvedValueOnce(
      response(
        [event("like:initial", { kind: "like", commit: null })],
        true,
        "likes-page",
      ),
    );
    await button(wrapper, "Likes").trigger("click");
    await flushPromises();
    const stale = deferred();
    mocks.getFeed.mockReturnValueOnce(stale.promise);
    await button(wrapper, "Load more").trigger("click");
    mocks.getFeed.mockResolvedValueOnce(response([event("commit:models")]));
    await button(wrapper, "Models").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "all",
      repo_type: "model",
      event_type: "repository",
      limit: 20,
    });
    stale.resolve(
      response(
        [event("like:stale", { kind: "like", commit: null })],
        true,
        "stale-likes-page",
      ),
    );
    await flushPromises();
    expect(wrapper.find('[data-event-id="commit:models"]').exists()).toBe(true);
    expect(wrapper.find('[data-event-id="like:stale"]').exists()).toBe(false);
    expect(wrapper.find('[data-event-id="like:initial"]').exists()).toBe(false);
    expect(wrapper.vm.hasMore).toBe(false);
  });

  it("clears private organization Likes after a 403 and retries the same category without its old cursor", async () => {
    useAuthStore().userOrganizations = [{ name: "research-lab" }];
    const wrapper = render();
    await flushPromises();
    await selectScope(wrapper, "org:research-lab");
    await flushPromises();
    mocks.getFeed.mockResolvedValueOnce(
      response(
        [event("like:private", { kind: "like", commit: null })],
        true,
        "private-likes",
      ),
    );
    await button(wrapper, "Likes").trigger("click");
    await flushPromises();
    mocks.getFeed.mockRejectedValueOnce({ response: { status: 403 } });
    await button(wrapper, "Load more").trigger("click");
    await flushPromises();
    expect(wrapper.vm.items).toEqual([]);
    expect(wrapper.vm.hasMore).toBe(false);
    expect(wrapper.vm.scope).toBe("org:research-lab");
    expect(wrapper.vm.type).toBe("likes");
    expect(wrapper.text()).toContain("Could not load activity");
    expect(wrapper.find('[data-event-id="like:private"]').exists()).toBe(false);
    await button(wrapper, "Try again").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "research-lab",
      repo_type: "all",
      event_type: "like",
      limit: 20,
    });
  });

  it("loads an organization scope with type and opaque pagination without reusing another scope's cursor", async () => {
    useAuthStore().userOrganizations = [{ name: "research-lab" }];
    mocks.getFeed.mockResolvedValueOnce(
      response([event()], true, "all-cursor"),
    );
    const pending = deferred();
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    const wrapper = render();
    await flushPromises();
    await selectScope(wrapper, "org:research-lab");
    expect(wrapper.vm.items).toEqual([]);
    expect(wrapper.vm.hasMore).toBe(false);
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "research-lab",
      repo_type: "all",
      limit: 20,
    });
    expect(wrapper.get('[aria-label="Filter activity"]').text()).toBe(
      "research-lab",
    );
    pending.resolve(response([event("commit:org")], true, "org/+=="));
    await flushPromises();
    mocks.getFeed.mockResolvedValueOnce(
      response([
        event("commit:org"),
        event("like:org", { kind: "like", commit: null }),
      ]),
    );
    await button(wrapper, "Load more").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "research-lab",
      repo_type: "all",
      limit: 20,
      cursor: "org/+==",
    });
    expect(wrapper.findAll(".activity-card")).toHaveLength(2);
    await button(wrapper, "Datasets").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "research-lab",
      repo_type: "dataset",
      event_type: "repository",
      limit: 20,
    });
    await selectScope(wrapper, "self");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "self",
      repo_type: "dataset",
      event_type: "repository",
      limit: 20,
    });
  });

  it("ignores a late organization page after switching scopes", async () => {
    useAuthStore().userOrganizations = [
      { name: "research-lab" },
      { name: "next-team" },
    ];
    const wrapper = render();
    await flushPromises();
    const old = deferred();
    mocks.getFeed.mockReturnValueOnce(old.promise);
    await selectScope(wrapper, "org:research-lab");
    mocks.getFeed.mockResolvedValueOnce(response([event("commit:next-team")]));
    await selectScope(wrapper, "org:next-team");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "organization",
      organization: "next-team",
      repo_type: "all",
      limit: 20,
    });
    old.resolve(response([event("commit:stale-org")], true, "stale-cursor"));
    await flushPromises();
    expect(wrapper.find('[data-event-id="commit:next-team"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-event-id="commit:stale-org"]').exists()).toBe(
      false,
    );
    expect(wrapper.vm.hasMore).toBe(false);
  });

  it("clears a removed organization's retained events and ignores its pending page", async () => {
    const auth = useAuthStore();
    auth.userOrganizations = [{ name: "research-lab" }, { name: "other-team" }];
    const wrapper = render();
    await flushPromises();
    mocks.getFeed.mockResolvedValueOnce(
      response([event("commit:private-org")], true, "private-page"),
    );
    await selectScope(wrapper, "org:research-lab");
    await flushPromises();
    const old = deferred();
    const fresh = deferred();
    mocks.getFeed
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    await button(wrapper, "Load more").trigger("click");
    auth.userOrganizations = [{ name: "other-team" }];
    expect(wrapper.vm.scope).toBe("all");
    expect(wrapper.vm.items).toEqual([]);
    expect(wrapper.vm.hasMore).toBe(false);
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "all",
      repo_type: "all",
      limit: 20,
    });
    await nextTick();
    expect(wrapper.get('[aria-label="Filter activity"]').text()).toBe("All");
    expect(wrapper.find('[data-event-id="commit:private-org"]').exists()).toBe(
      false,
    );
    fresh.resolve(response([event("commit:current")]));
    await flushPromises();
    old.resolve(
      response([event("commit:revoked-org")], true, "revoked-cursor"),
    );
    await flushPromises();
    expect(wrapper.find('[data-event-id="commit:current"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-event-id="commit:revoked-org"]').exists()).toBe(
      false,
    );
    expect(wrapper.vm.hasMore).toBe(false);
  });

  it("keeps a selected membership when a different organization is removed", async () => {
    const auth = useAuthStore();
    auth.userOrganizations = [{ name: "research-lab" }, { name: "other-team" }];
    const wrapper = render();
    await flushPromises();
    await selectScope(wrapper, "org:research-lab");
    await flushPromises();
    const calls = mocks.getFeed.mock.calls.length;
    auth.userOrganizations = [{ name: "research-lab" }];
    await nextTick();
    expect(wrapper.vm.scope).toBe("org:research-lab");
    expect(mocks.getFeed).toHaveBeenCalledTimes(calls);
    expect(wrapper.find(".activity-card").exists()).toBe(true);
  });

  it("keeps mounted cards during refresh and after an error until retry succeeds", async () => {
    const pending = deferred();
    const wrapper = render();
    await flushPromises();
    const card = wrapper.get(".activity-card").element;
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    wrapper.vm.refresh();
    await nextTick();
    expect(wrapper.get(".activity-card").element).toBe(card);
    expect(wrapper.text()).toContain("Updating activity");
    expect(wrapper.find(".workspace-skeleton").exists()).toBe(false);
    pending.resolve(response([event()]));
    await flushPromises();
    mocks.getFeed.mockRejectedValueOnce(new Error("offline"));
    wrapper.vm.refresh();
    await nextTick();
    await flushPromises();
    expect(wrapper.text()).toContain("Could not load activity");
    expect(wrapper.get(".activity-card").element).toBe(card);
    await button(wrapper, "Try again").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("retries a failed append using the same cursor while retaining prior events", async () => {
    mocks.getFeed.mockResolvedValueOnce(response([event()], true, "page-2"));
    mocks.getFeed.mockRejectedValueOnce(new Error("offline"));
    const wrapper = render();
    await flushPromises();
    await button(wrapper, "Load more").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".activity-card")).toHaveLength(1);
    mocks.getFeed.mockResolvedValueOnce(response([event("commit:2")]));
    await button(wrapper, "Try again").trigger("click");
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenLastCalledWith({
      scope: "all",
      repo_type: "all",
      limit: 20,
      cursor: "page-2",
    });
    expect(wrapper.findAll(".activity-card")).toHaveLength(2);
  });

  it("clears private events synchronously on identity changes and ignores late authenticated responses", async () => {
    const pending = deferred();
    const wrapper = render();
    await flushPromises();
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    wrapper.vm.refresh();
    await nextTick();
    const auth = useAuthStore();
    auth.user = null;
    expect(wrapper.vm.items).toEqual([]);
    await nextTick();
    expect(wrapper.find(".activity-card").exists()).toBe(false);
    pending.resolve(response([event("commit:secret")]));
    await flushPromises();
    expect(wrapper.text()).not.toContain("research-lab/model.v1");
    mocks.getFeed.mockResolvedValueOnce(
      response([
        event("commit:bob", {
          repository: { id: "bob/public", type: "model", private: false },
        }),
      ]),
    );
    auth.user = { username: "bob" };
    await flushPromises();
    expect(wrapper.text()).toContain("bob/public");
    expect(wrapper.find('[data-event-id="commit:secret"]').exists()).toBe(
      false,
    );
  });

  it("refreshes all/following after follow changes and removes the event listener on unmount", async () => {
    const wrapper = render();
    await flushPromises();
    window.dispatchEvent(new CustomEvent("hub-follow-changed"));
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenCalledTimes(2);
    await selectScope(wrapper, "following");
    await flushPromises();
    window.dispatchEvent(new CustomEvent("hub-follow-changed"));
    await flushPromises();
    expect(mocks.getFeed).toHaveBeenCalledTimes(4);
    await selectScope(wrapper, "self");
    await flushPromises();
    window.dispatchEvent(new CustomEvent("hub-follow-changed"));
    expect(mocks.getFeed).toHaveBeenCalledTimes(5);
    useAuthStore().userOrganizations = [{ name: "research-lab" }];
    await selectScope(wrapper, "org:research-lab");
    await flushPromises();
    window.dispatchEvent(new CustomEvent("hub-follow-changed"));
    expect(mocks.getFeed).toHaveBeenCalledTimes(6);
    wrapper.unmount();
    wrappers.pop();
    window.dispatchEvent(new CustomEvent("hub-follow-changed"));
    expect(mocks.getFeed).toHaveBeenCalledTimes(6);
  });

  it.each(["id", "is_org", "is_active", "token"])(
    "invalidates same-name session responses when %s changes",
    async (field) => {
      const auth = useAuthStore();
      auth.user = { username: "alice", id: 1, is_org: false, is_active: true };
      auth.token = "old-token";
      const wrapper = render();
      await flushPromises();
      await selectScope(wrapper, "following");
      await flushPromises();
      const old = deferred();
      const current = deferred();
      mocks.getFeed
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise);
      wrapper.vm.refresh();
      await nextTick();
      if (field === "token") auth.token = "new-token";
      else
        auth.user = {
          ...auth.user,
          [field]: field === "id" ? 2 : !auth.user[field],
        };
      expect(wrapper.vm.items).toEqual([]);
      expect(wrapper.vm.scope).toBe("all");
      expect(mocks.getFeed).toHaveBeenLastCalledWith({
        scope: "all",
        repo_type: "all",
        limit: 20,
      });
      current.resolve(response([event("commit:current")]));
      await flushPromises();
      old.resolve(response([event("commit:revoked")]));
      await flushPromises();
      expect(wrapper.find('[data-event-id="commit:current"]').exists()).toBe(
        true,
      );
      expect(wrapper.find('[data-event-id="commit:revoked"]').exists()).toBe(
        false,
      );
    },
  );

  it.each([
    [401, "refresh"],
    [403, "refresh"],
    [401, "append"],
    [403, "append"],
  ])(
    "removes retained private events after a %s %s failure",
    async (status, operation) => {
      mocks.getFeed.mockResolvedValueOnce(
        response([event()], true, "private-cursor"),
      );
      mocks.getFeed.mockRejectedValueOnce({ response: { status } });
      const wrapper = render();
      await flushPromises();
      if (operation === "append")
        await button(wrapper, "Load more").trigger("click");
      else wrapper.vm.refresh();
      await nextTick();
      await flushPromises();
      expect(wrapper.vm.items).toEqual([]);
      expect(wrapper.vm.hasMore).toBe(false);
      expect(wrapper.find(".activity-card").exists()).toBe(false);
      expect(wrapper.text()).toContain("Could not load activity");
      await button(wrapper, "Try again").trigger("click");
      await flushPromises();
      expect(mocks.getFeed).toHaveBeenLastCalledWith({
        scope: "all",
        repo_type: "all",
        limit: 20,
      });
    },
  );

  it("disables repeated Load more while its cursor request is pending", async () => {
    const pending = deferred();
    mocks.getFeed.mockResolvedValueOnce(response([event()], true, "next-page"));
    mocks.getFeed.mockReturnValueOnce(pending.promise);
    const wrapper = render();
    await flushPromises();
    await button(wrapper, "Load more").trigger("click");
    const loadingButton = button(wrapper, "Loading…");
    expect(loadingButton.element.disabled).toBe(true);
    await loadingButton.trigger("click");
    expect(mocks.getFeed).toHaveBeenCalledTimes(2);
    pending.resolve(response([event("commit:2")]));
    await flushPromises();
    expect(wrapper.findAll(".activity-card")).toHaveLength(2);
  });

  it("offers an informative following empty state without falling back to repository summaries", async () => {
    mocks.getFeed.mockResolvedValue(response([]));
    const wrapper = render();
    await flushPromises();
    await selectScope(wrapper, "following");
    await flushPromises();
    expect(wrapper.text()).toContain("No activity yet");
    expect(wrapper.text()).toContain("Follow people and organizations");
    expect(wrapper.find(".activity-card").exists()).toBe(false);
  });
});
