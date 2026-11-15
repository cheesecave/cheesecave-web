import { mount, flushPromises } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  reactive,
  watchEffect,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(),
  auth: null,
  headers: 0,
  guests: 0,
  full: 0,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repositoryAccessAPI: { getAccess: mocks.getAccess, leaveGuest: vi.fn() },
}));
vi.mock("@/components/repo/RepositoryHeader.vue", () => ({
  default: defineComponent({
    props: ["namespace", "name", "repoInfo", "activeTab", "tabs"],
    setup(props) {
      mocks.headers++;
      return () =>
        h(
          "header",
          { "data-persistent-header": "", "aria-label": "Repository header" },
          [
            h("h1", `${props.namespace}/${props.name}`),
            h("span", props.repoInfo?.id || ""),
          ],
        );
    },
  }),
}));
vi.mock("@/components/repo/RepositoryInvitationPage.vue", () => ({
  default: defineComponent({
    props: ["repository", "embedded"],
    emits: ["changed"],
    setup(props, { emit }) {
      return () =>
        h("section", [
          h("p", `Invitation ${props.repository.name}`),
          h("button", { onClick: () => emit("changed") }, "Redeem invitation"),
        ]);
    },
  }),
}));
vi.mock("@/components/repo/RestrictedRepositoryViewer.vue", () => ({
  default: defineComponent({
    props: ["repository", "embedded", "view", "branch"],
    emits: ["changed", "overview", "navigate"],
    setup(props, { emit }) {
      mocks.guests++;
      return () =>
        h("section", [
          h(
            "p",
            `Guest sensitive preview ${props.repository.name} ${props.view}`,
          ),
          h("button", { onClick: () => emit("changed") }, "Recheck guest"),
        ]);
    },
  }),
}));
vi.mock("@/components/common/ErrorState.vue", () => ({
  default: { template: "<p>Access error</p>" },
}));
vi.mock("@/components/repo/metadata/MetadataHeader.vue", () => ({
  default: { template: "<span />" },
}));
import Gate from "@/components/repo/RepositoryAccessGate.vue";
import RestrictedViewer from "@/components/repo/RestrictedRepositoryViewer.vue";

const FullRepository = defineComponent({
  name: "RepoViewer",
  setup() {
    mocks.full++;
    const bridge = inject("repositoryHeaderBridge", null);
    const enabled = computed(() => Boolean(bridge?.enabled?.value));
    watchEffect(() => {
      if (enabled.value)
        bridge.state.value = {
          repoInfo: { id: "private-full-metadata", private: true },
          tabs: [
            { key: "card", label: "Model Card", to: "/models/owner/demo" },
          ],
          activeTab: "card",
          metadata: {},
          tagGroups: {},
          hasMetadataHeader: false,
        };
    });
    return () => h("p", "Full protected repository content");
  },
});
const wrappers = [];
function mountGate(
  route = reactive({ path: "/models/owner/demo", query: {} }),
) {
  const wrapper = mount(Gate, {
    props: { route, component: FullRepository, componentKey: "demo" },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const button = (wrapper, label) =>
  wrapper.findAll("button").find((entry) => entry.text() === label);
const reply = (access) => ({
  data: { access, visibility: "invite", invite_markdown: "# Apply" },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("repository access transitions preserve the header and replace only protected content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = reactive({
      isAuthenticated: false,
      username: null,
      user: null,
      token: null,
    });
    mocks.headers = mocks.guests = mocks.full = 0;
  });
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it.each([
    ["release", "release"],
    ["refs%2Fpr%2F1", "refs/pr/1"],
    ["%FF", "%FF"],
  ])(
    "forwards the requested restricted revision %s without silently using main",
    async (encoded, expected) => {
      mocks.getAccess.mockResolvedValue(reply("guest"));
      const wrapper = mountGate(
        reactive({
          path: `/models/owner/demo/blob/${encoded}/notes.txt`,
          query: {},
        }),
      );
      await flushPromises();
      expect(wrapper.findComponent(RestrictedViewer).props("branch")).toBe(
        expected,
      );
    },
  );
  it("keeps the same header through invitation, pending recheck, guest and full access", async () => {
    const check = deferred();
    mocks.getAccess
      .mockResolvedValueOnce(reply("invite"))
      .mockReturnValueOnce(check.promise)
      .mockResolvedValueOnce(reply("full"));
    const wrapper = mountGate();
    await flushPromises();
    const header = wrapper.get("[data-persistent-header]").element;
    expect(mocks.headers).toBe(1);
    expect(mocks.guests).toBe(0);
    expect(mocks.full).toBe(0);
    await button(wrapper, "Redeem invitation").trigger("click");
    expect(wrapper.get("[data-persistent-header]").element).toBe(header);
    expect(wrapper.text()).not.toContain("Invitation demo");
    expect(mocks.guests).toBe(0);
    check.resolve(reply("guest"));
    await flushPromises();
    expect(wrapper.get("[data-persistent-header]").element).toBe(header);
    expect(wrapper.text()).toContain("Guest sensitive preview demo card");
    expect(mocks.full).toBe(0);
    await button(wrapper, "Recheck guest").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-persistent-header]").element).toBe(header);
    expect(wrapper.text()).toContain("Full protected repository content");
    expect(wrapper.text()).toContain("private-full-metadata");
    expect(mocks.headers).toBe(1);
    expect(mocks.full).toBe(1);
  });

  it("hides cached full content and its header metadata immediately when identity changes", async () => {
    const check = deferred();
    mocks.getAccess
      .mockResolvedValueOnce(reply("invite"))
      .mockResolvedValueOnce(reply("full"))
      .mockReturnValueOnce(check.promise);
    const wrapper = mountGate();
    await flushPromises();
    const header = wrapper.get("[data-persistent-header]").element;
    await button(wrapper, "Redeem invitation").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("private-full-metadata");
    mocks.auth.username = "different-account";
    await nextTick();
    expect(wrapper.get("[data-persistent-header]").element).toBe(header);
    expect(wrapper.text()).not.toContain("Full protected repository content");
    expect(wrapper.text()).not.toContain("private-full-metadata");
    check.resolve(reply("invite"));
    await flushPromises();
    expect(wrapper.text()).toContain("Invitation demo");
    expect(wrapper.text()).not.toContain("private-full-metadata");
  });

  it("discards old header metadata and stale permission replies when the repository changes", async () => {
    const oldCheck = deferred();
    const newCheck = deferred();
    mocks.getAccess
      .mockResolvedValueOnce(reply("invite"))
      .mockReturnValueOnce(oldCheck.promise)
      .mockReturnValueOnce(newCheck.promise);
    const route = reactive({ path: "/models/owner/demo", query: {} });
    const wrapper = mountGate(route);
    await flushPromises();
    await button(wrapper, "Redeem invitation").trigger("click");
    route.path = "/models/owner/other";
    await nextTick();
    expect(wrapper.text()).not.toContain("Guest sensitive preview demo");
    expect(wrapper.text()).not.toContain("private-full-metadata");
    newCheck.resolve(reply("guest"));
    await flushPromises();
    expect(wrapper.get("[data-persistent-header]").text()).toContain(
      "owner/other",
    );
    expect(wrapper.text()).toContain("Guest sensitive preview other card");
    oldCheck.resolve(reply("full"));
    await flushPromises();
    expect(wrapper.text()).not.toContain("Full protected repository content");
    expect(mocks.full).toBe(0);
    expect(wrapper.get("[data-persistent-header]").text()).toContain(
      "owner/other",
    );
  });

  it("keeps safe header identity while removing full content after an access recheck fails", async () => {
    mocks.getAccess
      .mockResolvedValueOnce(reply("invite"))
      .mockResolvedValueOnce(reply("full"))
      .mockRejectedValueOnce(new Error("Access check unavailable"));
    const wrapper = mountGate();
    await flushPromises();
    const header = wrapper.get("[data-persistent-header]").element;
    await button(wrapper, "Redeem invitation").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("private-full-metadata");
    mocks.auth.token = "different-normal-token";
    await flushPromises();
    expect(wrapper.get("[data-persistent-header]").element).toBe(header);
    expect(wrapper.text()).toContain("Access error");
    expect(wrapper.text()).not.toContain("Full protected repository content");
    expect(wrapper.text()).not.toContain("private-full-metadata");
  });
});
