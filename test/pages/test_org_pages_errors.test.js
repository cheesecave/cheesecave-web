// Creating and listing organizations report failures through notifyError.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => {
  const boom = () => Promise.reject(new Error("boom"));
  return {
    notify: vi.fn(),
    orgAPI: { create: vi.fn(boom), get: vi.fn(boom), listMembers: vi.fn(boom) },
    settingsAPI: { whoamiV2: vi.fn(boom) },
  };
});

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/utils/api", () => ({
  orgAPI: mocks.orgAPI,
  settingsAPI: mocks.settingsAPI,
}));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

import OrgIndex from "@/pages/organizations/index.vue";
import OrgNew from "@/pages/organizations/new.vue";
import { useAuthStore } from "@/stores/auth";

const stubs = {
  ...ElementPlusStubs,
  RouterLink: RouterLinkStub,
  EntityAvatar: true,
};
const expectFallback = (fallback) =>
  expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), { fallback });

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().user = { username: "alice" };
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("organization pages failures", () => {
  it("reports an organization that could not be created", async () => {
    const wrapper = mount(OrgNew, { global: { stubs } });
    await flushPromises();
    wrapper.vm.formRef = { validate: (cb) => cb(true) };
    wrapper.vm.form.name = "acme";
    await wrapper.vm.handleSubmit();
    expectFallback("Failed to create organization");
  });

  it("reports an organization list that could not be loaded", async () => {
    mount(OrgIndex, { global: { stubs } });
    await flushPromises();
    expectFallback("Failed to load organizations");
  });
});
