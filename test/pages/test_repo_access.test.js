import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { RouterView, createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  auth: null,
  redeem: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repositoryAccessAPI: { redeem: mocks.redeem },
}));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
import Page from "@/pages/repo-access.vue";

const wrappers = [];
async function openPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/repo-access", component: Page },
      { path: "/login", component: { template: "<p>Sign in</p>" } },
      {
        path: "/:pathMatch(.*)*",
        component: { template: "<p>Destination</p>" },
      },
    ],
  });
  await router.push("/repo-access");
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router], stubs: ElementPlusStubs },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}
const codeInput = (wrapper) =>
  wrapper.get('input[aria-label="Invitation code"]');
const submit = async (wrapper) => {
  await wrapper.get("form").trigger("submit");
  await flushPromises();
};
const result = (
  repository_url = "/models/owner/demo",
  grant = { revoked_at: null, expires_at: null },
) => ({ data: { success: true, repository_url, grant } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "reader",
    user: { id: 7 },
    token: "normal-token",
  });
  mocks.redeem.mockResolvedValue(result());
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("account-only repository code access", () => {
  it("redirects anonymous users before showing the form, then returns after sign-in", async () => {
    mocks.auth.isAuthenticated = false;
    const { wrapper, router } = await openPage();
    expect(wrapper.find("input").exists()).toBe(false);
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query).toEqual({ return: "/repo-access" });
    expect(mocks.redeem).not.toHaveBeenCalled();
    mocks.auth.isAuthenticated = true;
    await router.push(router.currentRoute.value.query.return);
    await flushPromises();
    expect(codeInput(wrapper).element.value).toBe("");
  });
  it("asks only for the code with one primary action", async () => {
    const { wrapper } = await openPage();
    expect(wrapper.findAll("input")).toHaveLength(1);
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "Open repository",
    ]);
    expect(wrapper.get("button").attributes("data-type")).toBe("primary");
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(
      /Bind|Temporary|Sign Up|personal token|normal downloads/,
    );
  });
  it.each(["model", "dataset", "space"])(
    "redeems once and opens the inferred %s repository",
    async (type) => {
      const target = `/${type}s/owner/demo`;
      mocks.redeem.mockResolvedValue(result(target));
      localStorage.setItem("hf_token", "normal-token");
      const { wrapper, router } = await openPage();
      await codeInput(wrapper).setValue(" repo_fixture ");
      if (type === "dataset") {
        await wrapper.get("button").trigger("click");
        await flushPromises();
      } else await submit(wrapper);
      expect(mocks.redeem).toHaveBeenCalledExactlyOnceWith("repo_fixture");
      expect(router.currentRoute.value.fullPath).toBe(target);
      expect(router.currentRoute.value.fullPath).not.toContain("repo_fixture");
      expect(localStorage.getItem("hf_token")).toBe("normal-token");
    },
  );
  it("does not redeem an empty code", async () => {
    const { wrapper } = await openPage();
    await codeInput(wrapper).setValue("   ");
    await submit(wrapper);
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
  it("keeps a failed exchange on the page for correction", async () => {
    mocks.redeem.mockRejectedValue(new Error("Unavailable"));
    const { wrapper, router } = await openPage();
    await codeInput(wrapper).setValue("repo_bad");
    await submit(wrapper);
    expect(router.currentRoute.value.path).toBe("/repo-access");
    expect(codeInput(wrapper).element.value).toBe("repo_bad");
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it.each([
    { revoked_at: "2026-01-01T00:00:00Z", expires_at: null },
    { revoked_at: null, expires_at: "2020-01-01T00:00:00Z" },
  ])("does not navigate or renew an inactive grant: %j", async (grant) => {
    mocks.redeem.mockResolvedValue(result("/models/owner/demo", grant));
    const { wrapper, router } = await openPage();
    await codeInput(wrapper).setValue("repo_old");
    await submit(wrapper);
    expect(router.currentRoute.value.path).toBe("/repo-access");
    expect(wrapper.text()).toContain("Contact the repository manager");
    expect(codeInput(wrapper).element.value).toBe("");
  });
  it.each([
    "https://evil.example/repo",
    "//evil.example/repo",
    "/settings",
    "/models/owner/demo?token=secret",
    null,
  ])("rejects an invalid repository destination: %s", async (target) => {
    mocks.redeem.mockResolvedValue(result(target));
    const { wrapper, router } = await openPage();
    await codeInput(wrapper).setValue("repo_fixture");
    await submit(wrapper);
    expect(router.currentRoute.value.path).toBe("/repo-access");
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it.each(["logout", "account change", "unmount"])(
    "discards late results after %s and clears entered secrets",
    async (change) => {
      let complete;
      mocks.redeem.mockReturnValue(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      const { wrapper, router } = await openPage();
      const page = wrapper.getComponent(Page);
      await codeInput(wrapper).setValue("repo_fixture");
      expect(page.vm.token).toBe("repo_fixture");
      await wrapper.get("form").trigger("submit");
      await wrapper.get("form").trigger("submit");
      expect(mocks.redeem).toHaveBeenCalledOnce();
      if (change === "logout") mocks.auth.isAuthenticated = false;
      else if (change === "account change") mocks.auth.user = { id: 8 };
      else await router.push("/settings");
      await flushPromises();
      expect(page.vm.token).toBe("");
      if (change === "account change")
        expect(codeInput(wrapper).element.value).toBe("");
      complete(result());
      await flushPromises();
      expect(router.currentRoute.value.path).toBe(
        change === "logout"
          ? "/login"
          : change === "unmount"
            ? "/settings"
            : "/repo-access",
      );
    },
  );
});
