import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  route: null,
  router: { push: vi.fn(), replace: vi.fn() },
  repoAPI: { getInfo: vi.fn() },
  settingsAPI: { getSiteConfig: vi.fn(), getLfsSettings: vi.fn() },
  quotaAPI: { getRepoQuota: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { username: "owner" } }),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: mocks.repoAPI,
  settingsAPI: mocks.settingsAPI,
  quotaAPI: mocks.quotaAPI,
  validationAPI: {},
}));
import Page from "@/pages/[type]s/[namespace]/[name]/settings.vue";

let wrapper, access;
const link = (label) =>
  wrapper
    .get('nav[aria-label="Repository settings sections"]')
    .findAll("a")
    .find((node) => node.text() === label);
const selected = () =>
  wrapper
    .get(
      'nav[aria-label="Repository settings sections"] a[aria-current="page"]',
    )
    .text();
async function open({
  type = "model",
  tab,
  manage = true,
  embedded = true,
} = {}) {
  mocks.route = reactive({
    path: `/${type}s/team/demo/settings`,
    params: { type, namespace: "team", name: "demo" },
    query: tab === undefined ? {} : { tab },
    hash: "",
  });
  access = ref({ can_manage: manage, visibility: "invite" });
  wrapper = mount(Page, {
    props: { embedded },
    global: {
      provide: { repositoryAccess: access },
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        RepositoryAccessManager: {
          template:
            '<section data-testid="access-manager">Access manager</section>',
        },
        ElTable: true,
        ElTableColumn: true,
        ElInputNumber: true,
      },
    },
  });
  await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.repoAPI.getInfo.mockResolvedValue({ data: { private: true } });
  mocks.settingsAPI.getSiteConfig.mockResolvedValue({ data: {} });
  mocks.settingsAPI.getLfsSettings.mockResolvedValue({
    data: {
      server_defaults: {},
      lfs_threshold_bytes: null,
      lfs_keep_versions: null,
      lfs_suffix_rules: null,
    },
  });
  mocks.quotaAPI.getRepoQuota.mockResolvedValue({
    data: {
      quota_bytes: null,
      namespace_available_bytes: null,
      effective_quota_bytes: null,
    },
  });
});
afterEach(() => wrapper?.unmount());

describe("repository Settings sidebar", () => {
  it.each(["model", "dataset", "space"])(
    "uses a left navigation and right settings content for %s",
    async (type) => {
      await open({ type });
      expect(selected()).toBe("General");
      expect(wrapper.get(".repository-settings-content").exists()).toBe(true);
      expect(
        wrapper.find("[data-el-tabs], [data-el-breadcrumb]").exists(),
      ).toBe(false);
      expect(wrapper.find("h1").exists()).toBe(false);
      expect(wrapper.get('h2[id="repository-settings-general"]').text()).toBe(
        "General",
      );
      for (const [label, tab] of [
        ["General", "general"],
        ["Branches & Tags", "branches"],
        ["LFS Settings", "lfs"],
        ["Storage & Quota", "quota"],
        ["Repository access", "access"],
      ]) {
        const target = link(label).attributes("href");
        expect(JSON.parse(target)).toMatchObject({
          path: `/${type}s/team/demo/settings`,
          query: { tab },
        });
      }
    },
  );
  it.each([undefined, null, "missing", ["quota"], []])(
    "defaults safely for invalid query %j",
    async (tab) => {
      await open({ tab });
      expect(selected()).toBe("General");
      expect(mocks.router.replace).not.toHaveBeenCalled();
      expect(mocks.quotaAPI.getRepoQuota).not.toHaveBeenCalled();
    },
  );
  it("opens a direct LFS or quota link and follows back/forward query changes", async () => {
    await open({ tab: "lfs" });
    expect(selected()).toBe("LFS Settings");
    expect(mocks.settingsAPI.getLfsSettings).toHaveBeenCalledExactlyOnceWith(
      "model",
      "team",
      "demo",
    );
    mocks.route.query.tab = "quota";
    await flushPromises();
    expect(selected()).toBe("Storage & Quota");
    expect(mocks.quotaAPI.getRepoQuota).toHaveBeenCalledExactlyOnceWith(
      "model",
      "team",
      "demo",
    );
    mocks.route.query.tab = "general";
    await flushPromises();
    expect(selected()).toBe("General");
    mocks.route.query.tab = "lfs";
    await flushPromises();
    expect(selected()).toBe("LFS Settings");
    expect(mocks.settingsAPI.getLfsSettings).toHaveBeenCalledTimes(1);
  });
  it("loads a direct quota URL once and retains unsaved branch fields across section navigation", async () => {
    await open({ tab: "quota" });
    expect(selected()).toBe("Storage & Quota");
    expect(mocks.quotaAPI.getRepoQuota).toHaveBeenCalledTimes(1);
    mocks.route.query.tab = "branches";
    await flushPromises();
    const input = wrapper.get('input[placeholder="my-feature-branch"]');
    await input.setValue("unsaved-branch");
    mocks.route.query.tab = "general";
    await flushPromises();
    expect(input.isVisible()).toBe(false);
    mocks.route.query.tab = "branches";
    await flushPromises();
    expect(wrapper.get('input[placeholder="my-feature-branch"]').element).toBe(
      input.element,
    );
    expect(input.element.value).toBe("unsaved-branch");
  });

  it("does not expose the access panel without management permission, including query changes", async () => {
    await open({ tab: "access", manage: false });
    expect(selected()).toBe("General");
    expect(link("Repository access")).toBeUndefined();
    expect(wrapper.find('[data-testid="access-manager"]').exists()).toBe(false);
    access.value.can_manage = true;
    await flushPromises();
    expect(selected()).toBe("Repository access");
    expect(wrapper.find('[data-testid="access-manager"]').exists()).toBe(true);
    access.value.can_manage = false;
    await flushPromises();
    expect(selected()).toBe("General");
    expect(wrapper.find('[data-testid="access-manager"]').exists()).toBe(false);
  });
  it("preserves unrelated query state in native navigation links", async () => {
    await open();
    mocks.route.query.from = "repository";
    mocks.route.hash = "#settings";
    await flushPromises();
    expect(JSON.parse(link("Branches & Tags").attributes("href"))).toEqual({
      path: "/models/team/demo/settings",
      query: { from: "repository", tab: "branches" },
      hash: "#settings",
    });
  });
});
