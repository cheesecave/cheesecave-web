import { defineComponent, h, reactive } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
const mocks = vi.hoisted(() => ({ get: vi.fn(), auth: null }));
vi.mock("@/utils/api", () => ({
  repositoryAccessAPI: { getAccess: mocks.get },
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/components/repo/RepositoryInvitationPage.vue", () => ({
  default: defineComponent({ setup: () => () => h("p", "Invitation only") }),
}));
vi.mock("@/components/repo/RestrictedRepositoryViewer.vue", () => ({
  default: defineComponent({ setup: () => () => h("p", "Restricted preview") }),
}));
import Gate from "@/components/repo/RepositoryAccessGate.vue";
function mountGate(route = reactive({ path: "/models/a/b/blob/main/file" })) {
  return mount(Gate, {
    props: { route },
    slots: { default: "<div data-private-content>Ordinary repository</div>" },
    global: { stubs: { ...ElementPlusStubs, ErrorState: true } },
  });
}
describe("repository access preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = reactive({ isAuthenticated: false, username: null });
  });
  it("does not mount normal content while deciding or when invitation-only", async () => {
    let done;
    mocks.get.mockReturnValue(
      new Promise((r) => {
        done = r;
      }),
    );
    const w = mountGate();
    expect(w.find("[data-private-content]").exists()).toBe(false);
    done({ data: { access: "invite" } });
    await flushPromises();
    expect(w.text()).toContain("Invitation only");
    expect(w.find("[data-private-content]").exists()).toBe(false);
    w.unmount();
  });
  it.each(["full", "standard"])(
    "mounts normal content only after %s access",
    async (access) => {
      mocks.get.mockResolvedValue({ data: { access } });
      const w = mountGate();
      await flushPromises();
      expect(w.find("[data-private-content]").exists()).toBe(true);
      w.unmount();
    },
  );
  it("keeps guests in their own viewer", async () => {
    mocks.get.mockResolvedValue({ data: { access: "guest" } });
    const w = mountGate();
    await flushPromises();
    expect(w.text()).toContain("Restricted preview");
    expect(w.find("[data-private-content]").exists()).toBe(false);
    w.unmount();
  });
  it("rechecks auth and rejects stale replies after repository change", async () => {
    let done;
    mocks.get
      .mockReturnValueOnce(
        new Promise((r) => {
          done = r;
        }),
      )
      .mockResolvedValue({ data: { access: "invite" } });
    const route = reactive({ path: "/models/a/b" });
    const w = mountGate(route);
    route.path = "/datasets/a/other/tree/main";
    await flushPromises();
    done({ data: { access: "full" } });
    await flushPromises();
    expect(w.find("[data-private-content]").exists()).toBe(false);
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "reader";
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledTimes(4);
    w.unmount();
  });
  it("fails closed on errors or unknown responses", async () => {
    mocks.get.mockRejectedValue(new Error("offline"));
    const w = mountGate();
    await flushPromises();
    expect(w.find("[data-private-content]").exists()).toBe(false);
    w.unmount();
    mocks.get.mockResolvedValue({ data: { access: "unexpected" } });
    const unknown = mountGate();
    await flushPromises();
    expect(unknown.find("[data-private-content]").exists()).toBe(false);
    unknown.unmount();
  });
  it("does not preflight nonrepository routes", async () => {
    const w = mountGate(reactive({ path: "/login" }));
    await flushPromises();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(w.find("[data-private-content]").exists()).toBe(true);
    w.unmount();
  });
  it("discards cached private content when access becomes opaque standard", async () => {
    let text = "Authorized private content";
    let mounts = 0;
    const Probe = defineComponent({
      name: "RepoViewer",
      setup() {
        mounts++;
        const snapshot = text;
        return () => h("p", snapshot);
      },
    });
    mocks.get.mockResolvedValue({ data: { access: "full" } });
    const route = reactive({ path: "/models/a/private" });
    const w = mount(Gate, {
      props: { route, component: Probe, componentKey: "private" },
    });
    await flushPromises();
    expect(w.text()).toContain("Authorized private content");
    text = "Other repository";
    route.path = "/models/a/other";
    await w.setProps({ componentKey: "other" });
    await flushPromises();
    text = "Repository not found";
    mocks.get.mockResolvedValue({ data: { access: "standard" } });
    route.path = "/models/a/private";
    await w.setProps({ componentKey: "private" });
    await flushPromises();
    expect(w.text()).toContain("Repository not found");
    expect(w.text()).not.toContain("Authorized private content");
    expect(mounts).toBe(3);
    w.unmount();
  });
  it("discards a full-access cache when the signed-in account changes", async () => {
    let text = "Account A private content";
    const Probe = defineComponent({
      name: "RepoViewer",
      setup() {
        const snapshot = text;
        return () => h("p", snapshot);
      },
    });
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "account-a";
    mocks.get.mockResolvedValue({ data: { access: "full" } });
    const w = mount(Gate, {
      props: {
        route: { path: "/models/a/private" },
        component: Probe,
        componentKey: "private",
      },
    });
    await flushPromises();
    text = "Account B refreshed content";
    mocks.auth.username = "account-b";
    await flushPromises();
    expect(w.text()).toContain("Account B refreshed content");
    expect(w.text()).not.toContain("Account A private content");
    w.unmount();
  });
});
