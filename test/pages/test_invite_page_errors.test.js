import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  accept: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { token: "tok" }, fullPath: "/invite/tok" }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));
vi.mock("@/utils/api", () => ({
  invitationAPI: {
    get: (...a) => mocks.get(...a),
    accept: (...a) => mocks.accept(...a),
  },
}));

import InvitePage from "@/pages/invite/[token].vue";

const failure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const invitation = {
  org_name: "acme",
  role: "member",
  inviter_username: "bob",
  expires_at: "2030-01-01T00:00:00Z",
  is_available: true,
  is_reusable: false,
};
const mountPage = () =>
  mount(InvitePage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
const title = (w) => w.get('[data-testid="error-title"]').text();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("invite page failures", () => {
  it("says a missing invitation is missing", async () => {
    mocks.get.mockRejectedValue(failure(404));
    const w = mountPage();
    await flushPromises();
    expect(title(w)).toBe("Invitation not found");
  });

  it("retries after the service was unavailable", async () => {
    mocks.get
      .mockRejectedValueOnce(failure(503))
      .mockResolvedValueOnce({ data: invitation });
    const w = mountPage();
    await flushPromises();
    expect(title(w)).toBe("Service unavailable");
    await w.get('[data-testid="error-action-retry"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(w.text()).toContain("acme");
  });

  it("shows nothing for a cancelled load", async () => {
    mocks.get.mockRejectedValue(new DOMException("a", "AbortError"));
    const w = mountPage();
    await flushPromises();
    expect(w.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("reports a failed accept and reloads the invitation", async () => {
    mocks.get.mockResolvedValue({ data: invitation });
    const err = failure(409);
    mocks.accept.mockRejectedValue(err);
    const w = mountPage();
    await flushPromises();
    await w.vm.acceptInvitation();
    expect(mocks.notify).toHaveBeenCalledWith(err, {
      fallback: "Failed to accept invitation",
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
