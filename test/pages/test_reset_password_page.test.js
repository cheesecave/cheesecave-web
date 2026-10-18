// The page an administrator's reset link opens: it reads the token from the URL fragment, asks whose account it is,
// takes a new password, and says what happened. Every state a person can land in is checked here.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ElementPlusStubs,
  InvalidElFormStub,
  RouterLinkStub,
} from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  success: vi.fn(),
  authAPI: { checkPasswordReset: vi.fn(), resetPassword: vi.fn() },
}));

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("@/utils/api", () => ({ authAPI: mocks.authAPI }));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), { success: mocks.success, error: vi.fn() }),
}));

import ResetPasswordPage from "@/pages/reset-password.vue";
import { useAuthStore } from "@/stores/auth";

const NOW = new Date("2026-10-19T10:00:00Z");
const httpFailure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const validCheck = (minutes = 59) => ({
  data: {
    username: "alice",
    expires_at: new Date(NOW.getTime() + minutes * 60_000).toISOString(),
  },
});

let wrapper;
const open = (hash = "#token=abc123", stubs = {}) => {
  window.history.replaceState(null, "", `/reset-password${hash}`);
  wrapper = mount(ResetPasswordPage, {
    global: { stubs: { ...ElementPlusStubs, ...stubs, RouterLink: RouterLinkStub } },
  });
  return flushPromises();
};
const has = (id) => wrapper.find(`[data-testid="${id}"]`).exists();
const type = (placeholder, value) =>
  wrapper.get(`input[placeholder="${placeholder}"]`).setValue(value);
const submit = () =>
  wrapper
    .findAll("button")
    .find((button) => button.text().includes("Set new password"))
    .trigger("click");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.authAPI.checkPasswordReset.mockResolvedValue(validCheck());
  mocks.authAPI.resetPassword.mockResolvedValue({ data: { success: true } });
  document.head.querySelectorAll('meta[name="referrer"]').forEach((m) => m.remove());
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

describe("opening the link", () => {
  it("asks about the token from the fragment, and names the account and how long is left", async () => {
    await open("#token=abc123");

    expect(mocks.authAPI.checkPasswordReset).toHaveBeenCalledWith("abc123");
    expect(has("reset-ready")).toBe(true);
    expect(wrapper.get('[data-testid="reset-account"]').text()).toContain("alice");
    expect(wrapper.get('[data-testid="reset-expiry"]').text()).toContain("in 59 minutes");
    expect(wrapper.get('[data-testid="reset-expiry"]').text()).toContain("works once");
  });

  it("takes the token out of the address bar and out of the history entry", async () => {
    await open("#token=abc123");

    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("asks the browser to send no Referer while it is open, and puts things back after", async () => {
    await open();
    expect(document.head.querySelector('meta[name="referrer"]').content).toBe("no-referrer");

    wrapper.unmount();
    wrapper = null;
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it("restores a referrer policy the page already had", async () => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "origin";
    document.head.append(meta);

    await open();
    expect(meta.content).toBe("no-referrer");
    wrapper.unmount();
    wrapper = null;

    expect(document.head.querySelector('meta[name="referrer"]').content).toBe("origin");
  });

  it("says the link is no good without asking when there is no token", async () => {
    await open("");

    expect(mocks.authAPI.checkPasswordReset).not.toHaveBeenCalled();
    expect(has("reset-invalid")).toBe(true);
  });

  it("says one thing for a link that is unknown, expired or used, and where to go next", async () => {
    mocks.authAPI.checkPasswordReset.mockRejectedValue(httpFailure(400));
    await open();

    expect(has("reset-invalid")).toBe(true);
    expect(has("reset-ready")).toBe(false);
    expect(wrapper.get('[data-testid="reset-invalid"]').text()).toContain(
      "This reset link is invalid, expired or already used",
    );
    expect(wrapper.get('[data-testid="reset-invalid"]').text()).toContain("Ask your administrator for a new link");
  });

  it("does not call a link bad when the server could not be asked, and lets the person try again", async () => {
    mocks.authAPI.checkPasswordReset.mockRejectedValueOnce(httpFailure(503));
    await open();

    expect(has("reset-invalid")).toBe(false);
    expect(has("reset-unreachable")).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Could not check the reset link",
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Try again"))
      .trigger("click");
    await flushPromises();

    expect(mocks.authAPI.checkPasswordReset).toHaveBeenCalledTimes(2);
    expect(mocks.authAPI.checkPasswordReset).toHaveBeenLastCalledWith("abc123");
    expect(has("reset-ready")).toBe(true);
  });
});

describe("setting the new password", () => {
  it("sends the token and the password, then says it is done and signs the browser out", async () => {
    const auth = useAuthStore();
    auth.user = { username: "someone-else" };
    await open();

    await type("New password", "a-brand-new-one");
    await type("Repeat the new password", "a-brand-new-one");
    await submit();
    await flushPromises();

    expect(mocks.authAPI.resetPassword).toHaveBeenCalledWith({
      token: "abc123",
      new_password: "a-brand-new-one",
    });
    expect(has("reset-done")).toBe(true);
    expect(has("reset-ready")).toBe(false);
    expect(wrapper.get('[data-testid="reset-done"]').text()).toContain("signed out everywhere");
    expect(auth.user).toBeNull(); // the sessions are gone on the server; the browser stops pretending
    expect(mocks.success).toHaveBeenCalledWith("Password changed");
  });

  it("sends nothing while the form is not valid", async () => {
    await open("#token=abc123", { ElForm: InvalidElFormStub });

    await submit();
    await flushPromises();

    expect(mocks.authAPI.resetPassword).not.toHaveBeenCalled();
    expect(has("reset-ready")).toBe(true);
  });

  it("turns into the invalid-link page when the link was used up meanwhile", async () => {
    mocks.authAPI.resetPassword.mockRejectedValue(httpFailure(400));
    await open();
    await type("New password", "a-brand-new-one");
    await type("Repeat the new password", "a-brand-new-one");

    await submit();
    await flushPromises();

    expect(has("reset-invalid")).toBe(true);
    expect(has("reset-done")).toBe(false);
  });

  it("keeps the form, and says why, when the server failed", async () => {
    mocks.authAPI.resetPassword.mockRejectedValue(httpFailure(500));
    await open();
    await type("New password", "a-brand-new-one");
    await type("Repeat the new password", "a-brand-new-one");

    await submit();
    await flushPromises();

    expect(has("reset-ready")).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Failed to reset the password",
    });
    expect(wrapper.get('input[placeholder="New password"]').element.value).toBe("a-brand-new-one");
  });

  it("holds the rules the server holds, and a matching repeat", async () => {
    await open();
    const rules = wrapper.findComponent({ name: "ElForm" }).props("rules");
    const check = async (field, ...args) => {
      let result;
      await rules[field].find((rule) => rule.validator).validator({}, ...args, (error) => (result = error));
      return result?.message ?? null;
    };

    expect(await check("password", "short")).toBe("Password must be at least 8 characters");
    expect(await check("password", "long-enough-1")).toBeNull();
    expect(await check("confirm", "")).toBe("Please repeat the password");
    await type("New password", "long-enough-1");
    expect(await check("confirm", "long-enough-2")).toBe("The two passwords do not match");
    expect(await check("confirm", "long-enough-1")).toBeNull();
  });
});
