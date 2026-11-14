import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/errors/notify", () => ({ notifyError: notify }));

import {
  ElementPlusStubs,
  InvalidElFormStub,
  RouterLinkStub,
} from "../helpers/vue";
import axios from "@/testing/axios";
import { createMemoryHistory, createRouter } from "@/testing/router";

import { useAuthStore } from "@/stores/auth";
import LoginPage from "@/pages/login.vue";
import RegisterPage from "@/pages/register.vue";

describe("auth pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { invitation_only: false },
    });
  });

  async function createTestRouter(initialPath) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: { template: "<div />" } },
        { path: "/register", component: { template: "<div />" } },
        { path: "/:pathMatch(.*)*", component: { template: "<div />" } },
      ],
    });

    await router.push(initialPath);
    await router.isReady();
    return router;
  }

  function mountPage(component, router, extraStubs = {}) {
    return mount(component, {
      global: {
        plugins: [router],
        stubs: {
          ...ElementPlusStubs,
          ...extraStubs,
          RouterLink: RouterLinkStub,
        },
      },
    });
  }

  const repositoryCodeInput = (wrapper) =>
    wrapper.get('input[placeholder="Optional repository invitation code"]');

  async function fillRegistration(wrapper) {
    await wrapper
      .get('input[placeholder="Choose a username"]')
      .setValue("reader");
    await wrapper
      .get('input[placeholder="your@email.com"]')
      .setValue("reader@example.com");
    await wrapper
      .get('input[placeholder="Create a password"]')
      .setValue("long-enough-password");
  }

  async function submitRegistration(wrapper) {
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();
  }

  async function repositoryRegistration(type = "model") {
    const { createRepositoryRegistration, readRepositoryRegistration } =
      await import("@/utils/repository-registration");
    const repository = { type, namespace: "owner", name: "invited" };
    const token = "repo_registration_fixture";
    const location = createRepositoryRegistration(repository, token);
    return {
      location,
      token,
      repositoryPath: `/${type}s/owner/invited`,
      read: () =>
        readRepositoryRegistration(location.query.repository_invitation),
    };
  }

  it.each([
    ["model", undefined, "/models/owner/invited"],
    ["dataset", "/datasets/owner/approved", "/datasets/owner/approved"],
    ["space", "https://other.example/private", "/spaces/owner/invited"],
  ])(
    "registers from a %s invitation without putting its code in the URL",
    async (type, repositoryUrl, expectedPath) => {
      const context = await repositoryRegistration(type);
      expect(JSON.stringify(context.location)).not.toContain(context.token);
      const router = await createTestRouter(context.location);
      const auth = useAuthStore();
      auth.register = vi
        .fn()
        .mockResolvedValue({
          email_verified: true,
          repository_url: repositoryUrl,
        });
      auth.login = vi.fn().mockResolvedValue({ ok: true });
      const wrapper = mountPage(RegisterPage, router);
      await flushPromises();
      expect(router.currentRoute.value.fullPath).not.toContain(context.token);
      expect(repositoryCodeInput(wrapper).element.value).toBe(context.token);
      await fillRegistration(wrapper);
      await submitRegistration(wrapper);
      expect(auth.register).toHaveBeenCalledWith({
        username: "reader",
        email: "reader@example.com",
        password: "long-enough-password",
        repo_invitation_token: context.token,
      });
      expect(auth.login).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value.path).toBe(expectedPath);
      expect(context.read()).toBeNull();
      expect(repositoryCodeInput(wrapper).element.value).toBe("");
      wrapper.unmount();
    },
  );

  it("keeps the repository destination for login when email verification is required", async () => {
    const context = await repositoryRegistration("dataset");
    const router = await createTestRouter(context.location);
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({ email_verified: false });
    auth.login = vi.fn();
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.login).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.return).toBe(context.repositoryPath);
    expect(router.currentRoute.value.fullPath).not.toContain(context.token);
    expect(context.read()).toBeNull();
    expect(repositoryCodeInput(wrapper).element.value).toBe("");
    wrapper.unmount();
  });

  it("routes to login after account creation succeeds but automatic login fails", async () => {
    const context = await repositoryRegistration();
    const router = await createTestRouter(context.location);
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({ email_verified: true });
    auth.login = vi
      .fn()
      .mockRejectedValue(new Error("Temporary login failure"));
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.return).toBe(context.repositoryPath);
    expect(context.read()).toBeNull();
    expect(repositoryCodeInput(wrapper).element.value).toBe("");
    wrapper.unmount();
  });

  it("retains the repository handoff after failed registration and consumes it only after a successful retry", async () => {
    const context = await repositoryRegistration();
    const router = await createTestRouter(context.location);
    const auth = useAuthStore();
    auth.register = vi
      .fn()
      .mockRejectedValueOnce(new Error("Try again"))
      .mockResolvedValueOnce({ email_verified: true });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(router.currentRoute.value.path).toBe("/register");
    expect(context.read()).toEqual({
      token: context.token,
      repositoryPath: context.repositoryPath,
    });
    expect(repositoryCodeInput(wrapper).element.value).toBe(context.token);
    expect(auth.login).not.toHaveBeenCalled();
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledTimes(2);
    for (const [payload] of auth.register.mock.calls)
      expect(payload.repo_invitation_token).toBe(context.token);
    expect(router.currentRoute.value.path).toBe(context.repositoryPath);
    expect(context.read()).toBeNull();
    wrapper.unmount();
  });

  it("does not let a repository registration handoff bypass invitation-only registration", async () => {
    const context = await repositoryRegistration();
    axios.get.mockResolvedValueOnce({ data: { invitation_only: true } });
    const router = await createTestRouter(context.location);
    const auth = useAuthStore();
    auth.register = vi.fn();
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    expect(wrapper.text()).toContain("Registration is Invitation-Only");
    expect(
      wrapper.find('input[placeholder="Choose a username"]').exists(),
    ).toBe(false);
    expect(auth.register).not.toHaveBeenCalled();
    expect(context.read().token).toBe(context.token);
    wrapper.unmount();
  });

  it("sends a separate site invitation alongside the repository registration handoff", async () => {
    const context = await repositoryRegistration();
    context.location.query.invitation = "site_registration_fixture";
    axios.get.mockResolvedValueOnce({ data: { invitation_only: true } });
    const router = await createTestRouter(context.location);
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({ email_verified: true });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({
        invitation_token: "site_registration_fixture",
        repo_invitation_token: context.token,
      }),
    );
    expect(router.currentRoute.value.path).toBe(context.repositoryPath);
    expect(context.read()).toBeNull();
    wrapper.unmount();
  });

  it("preserves legacy repository-code prefill and uses the server repository destination", async () => {
    const router = await createTestRouter(
      "/register?invitation=repo_legacy_fixture",
    );
    const auth = useAuthStore();
    auth.register = vi
      .fn()
      .mockResolvedValue({
        email_verified: true,
        repository_url: "/models/owner/legacy",
      });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    expect(repositoryCodeInput(wrapper).element.value).toBe(
      "repo_legacy_fixture",
    );
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ repo_invitation_token: "repo_legacy_fixture" }),
    );
    expect(auth.register.mock.calls[0][0].invitation_token).toBeUndefined();
    expect(router.currentRoute.value.path).toBe("/models/owner/legacy");
    expect(repositoryCodeInput(wrapper).element.value).toBe("");
    wrapper.unmount();
  });

  it.each([
    ["login", LoginPage, "/login"],
    ["register", RegisterPage, "/register"],
  ])(
    "says so when the %s page cannot load the site settings",
    async (_, page, path) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      axios.get.mockRejectedValueOnce(new Error("down"));
      const router = await createTestRouter(path);
      mountPage(page, router);
      await flushPromises();
      expect(notify).toHaveBeenCalledWith(expect.any(Error), {
        fallback: "Failed to load site settings",
      });
    },
  );

  it.each(["//evil.example/x", "/\\evil.example", "https://evil.example/x"])(
    "does not follow a return URL to another origin (%s)",
    async (target) => {
      const router = await createTestRouter(
        `/login?return=${encodeURIComponent(target)}`,
      );
      const pushSpy = vi.spyOn(router, "push");
      const authStore = useAuthStore();
      authStore.login = vi.fn().mockResolvedValue({ ok: true });
      const wrapper = mountPage(LoginPage, router);
      await flushPromises();
      await wrapper
        .find('input[placeholder="Enter your username"]')
        .setValue("mai_lin");
      await wrapper
        .find('input[placeholder="Enter your password"]')
        .setValue("KohakuDev123!");
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("Login"))
        .trigger("click");
      await flushPromises();
      expect(pushSpy).toHaveBeenCalledWith("/");
      expect(pushSpy).not.toHaveBeenCalledWith(target);
    },
  );

  it("loads site config and logs in with the return URL", async () => {
    const router = await createTestRouter(
      `/login?return=${encodeURIComponent("/models/mai_lin/lineart-caption-base")}`,
    );
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Enter your username"]')
      .setValue("mai_lin");
    await wrapper
      .find('input[placeholder="Enter your password"]')
      .setValue("KohakuDev123!");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Login"))
      .trigger("click");
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith("/api/site-config");
    expect(authStore.login).toHaveBeenCalledWith({
      username: "mai_lin",
      password: "KohakuDev123!",
    });
    expect(pushSpy).toHaveBeenCalledWith(
      "/models/mai_lin/lineart-caption-base",
    );
  });

  it("logs in and falls back to the home page when no return URL is present", async () => {
    const router = await createTestRouter("/login");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Enter your username"]')
      .setValue("mai_lin");
    await wrapper
      .find('input[placeholder="Enter your password"]')
      .setValue("secret");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Login"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith("/");
  });

  it("submits login when Enter is pressed in the password field", async () => {
    const router = await createTestRouter("/login");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Enter your username"]')
      .setValue("mai_lin");
    const passwordInput = wrapper.find(
      'input[placeholder="Enter your password"]',
    );
    await passwordInput.setValue("KohakuDev123!");
    await passwordInput.trigger("keyup.enter");
    await flushPromises();

    expect(authStore.login).toHaveBeenCalledWith({
      username: "mai_lin",
      password: "KohakuDev123!",
    });
    expect(pushSpy).toHaveBeenCalledWith("/");
  });

  it("shows the invitation-only login message when signups are closed", async () => {
    const router = await createTestRouter("/login");
    axios.get.mockResolvedValueOnce({
      data: { invitation_only: true },
    });

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    expect(wrapper.text()).toContain("Registration is invitation-only");
    expect(wrapper.text()).not.toContain("Sign up");
  });

  it("keeps working when the login page config or submit flow fails", async () => {
    const router = await createTestRouter("/login");
    const pushSpy = vi.spyOn(router, "push");
    axios.get.mockRejectedValueOnce(new Error("boom"));
    const authStore = useAuthStore();
    authStore.login = vi.fn().mockRejectedValue(new Error("bad credentials"));

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Enter your username"]')
      .setValue("mai_lin");
    await wrapper
      .find('input[placeholder="Enter your password"]')
      .setValue("secret");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Login"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("stops login submission when validation fails", async () => {
    const router = await createTestRouter("/login");
    const authStore = useAuthStore();
    authStore.login = vi.fn();

    const wrapper = mountPage(LoginPage, router, {
      ElForm: InvalidElFormStub,
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Login"))
      .trigger("click");
    await flushPromises();

    expect(authStore.login).not.toHaveBeenCalled();
  });

  it("keeps users on the login page when authentication fails", async () => {
    const router = await createTestRouter("/login");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.login = vi.fn().mockRejectedValue({
      response: {
        data: {
          detail: "Bad credentials",
        },
      },
    });

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();
    await wrapper
      .find('input[placeholder="Enter your username"]')
      .setValue("mai_lin");
    await wrapper
      .find('input[placeholder="Enter your password"]')
      .setValue("secret");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Login"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalledWith("/");
  });

  it("shows invitation-only login guidance when registration is closed", async () => {
    const router = await createTestRouter("/login");
    axios.get.mockResolvedValueOnce({
      data: { invitation_only: true },
    });

    const authStore = useAuthStore();
    authStore.login = vi.fn().mockRejectedValue(new Error("bad credentials"));

    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    expect(wrapper.text()).toContain("Registration is invitation-only");
    expect(wrapper.text()).not.toContain("Sign up");
  });

  it("blocks registration without an invitation and routes visitors to login", async () => {
    const router = await createTestRouter("/register");
    const pushSpy = vi.spyOn(router, "push");
    axios.get.mockResolvedValueOnce({
      data: { invitation_only: true },
    });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    expect(wrapper.text()).toContain("Registration is Invitation-Only");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Go to Login"))
      .trigger("click");

    expect(pushSpy).toHaveBeenCalledWith("/login");
  });

  it("registers with an invitation token and auto-logins verified users", async () => {
    const router = await createTestRouter(
      `/register?invitation=invite-123&return=${encodeURIComponent("/datasets/aurora-labs/street-sign-zh-en")}`,
    );
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({
      message: "Registration successful",
      email_verified: true,
    });
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("ivy_ops");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("ivy@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(authStore.register).toHaveBeenCalledWith({
      username: "ivy_ops",
      email: "ivy@example.com",
      password: "securepass",
      invitation_token: "invite-123",
    });
    expect(authStore.login).toHaveBeenCalledWith({
      username: "ivy_ops",
      password: "securepass",
    });
    expect(pushSpy).toHaveBeenCalledWith(
      "/datasets/aurora-labs/street-sign-zh-en",
    );
  });

  it("sends a manually supplied repository code during open registration", async () => {
    const router = await createTestRouter("/register");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({ email_verified: false });
    const w = mountPage(RegisterPage, router);
    await flushPromises();
    await w.get('input[placeholder="Choose a username"]').setValue("reader");
    await w
      .get('input[placeholder="your@email.com"]')
      .setValue("reader@example.com");
    await w
      .get('input[placeholder="Create a password"]')
      .setValue("long-enough-password");
    await w
      .get('input[placeholder="Optional repository invitation code"]')
      .setValue("repo_secret");
    await w
      .findAll("button")
      .find((b) => b.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();
    expect(authStore.register).toHaveBeenCalledWith(
      expect.objectContaining({ repo_invitation_token: "repo_secret" }),
    );
    w.unmount();
  });
  it("does not treat a repository-code link as a site registration invitation", async () => {
    const router = await createTestRouter("/register?invitation=repo_private");
    axios.get.mockResolvedValueOnce({ data: { invitation_only: true } });
    const w = mountPage(RegisterPage, router);
    await flushPromises();
    expect(w.text()).toContain("Registration is Invitation-Only");
    expect(w.find('input[placeholder="Choose a username"]').exists()).toBe(
      false,
    );
    w.unmount();
  });

  it("registers invited users without a return URL and routes them home", async () => {
    const router = await createTestRouter("/register?invitation=invite-123");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({
      message: "Registration successful",
      email_verified: true,
    });
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("ivy_ops");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("ivy@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(authStore.register).toHaveBeenCalledWith({
      username: "ivy_ops",
      email: "ivy@example.com",
      password: "securepass",
      invitation_token: "invite-123",
    });
    expect(pushSpy).toHaveBeenCalledWith("/");
  });

  it("returns to login when registration does not verify the email", async () => {
    const router = await createTestRouter("/register");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({
      message: "Check your email",
      email_verified: false,
    });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("noah_kim");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("noah@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith("/login");
  });

  it("routes verified registrations home when no return URL is set", async () => {
    const router = await createTestRouter("/register");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({
      message: "Registration successful",
      email_verified: true,
    });
    authStore.login = vi.fn().mockResolvedValue({ ok: true });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("ivy_ops");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("ivy@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith("/");
  });

  it("keeps the register page stable when submission fails", async () => {
    const router = await createTestRouter("/register");
    const pushSpy = vi.spyOn(router, "push");
    axios.get.mockRejectedValueOnce(new Error("boom"));
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockRejectedValue(new Error("bad request"));

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();

    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("noah_kim");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("noah@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalledWith("/");
    expect(pushSpy).not.toHaveBeenCalledWith("/login");
  });

  it("uses the default success message and skips invalid register submissions", async () => {
    const router = await createTestRouter("/register");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockResolvedValue({
      email_verified: false,
    });

    const invalidWrapper = mountPage(RegisterPage, router, {
      ElForm: InvalidElFormStub,
    });
    await flushPromises();
    await invalidWrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();
    expect(authStore.register).not.toHaveBeenCalled();

    const validWrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await validWrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("ivy_ops");
    await validWrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("ivy@example.com");
    await validWrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await validWrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(authStore.register).toHaveBeenCalled();
  });

  it("keeps users on the register page when registration fails", async () => {
    const router = await createTestRouter("/register");
    const pushSpy = vi.spyOn(router, "push");
    const authStore = useAuthStore();
    authStore.register = vi.fn().mockRejectedValue({
      response: {
        data: {
          detail: "Registration failed",
        },
      },
    });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    await wrapper
      .find('input[placeholder="Choose a username"]')
      .setValue("ivy_ops");
    await wrapper
      .find('input[placeholder="your@email.com"]')
      .setValue("ivy@example.com");
    await wrapper
      .find('input[placeholder="Create a password"]')
      .setValue("securepass");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalledWith("/");
    expect(pushSpy).not.toHaveBeenCalledWith("/login");
  });

  it("tells a person who forgot the password to ask the administrator for a link", async () => {
    const router = await createTestRouter("/login");
    const wrapper = mountPage(LoginPage, router);
    await flushPromises();

    expect(wrapper.get('[data-testid="forgot-password"]').text()).toContain(
      "Forgot your password? Ask your administrator for a reset link.",
    );
  });

  it("asks for the password the server accepts when someone registers", async () => {
    const router = await createTestRouter("/register");
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    const rule = wrapper
      .findComponent({ name: "ElForm" })
      .props("rules")
      .password.find((entry) => entry.validator);
    const check = async (value) => {
      let result;
      await rule.validator({}, value, (error) => (result = error));
      return result?.message ?? null;
    };

    expect(await check("sixsix")).toBe(
      "Password must be at least 8 characters",
    );
    expect(await check("a".repeat(73))).toMatch(/at most 72 bytes/);
    expect(await check("long-enough-1")).toBeNull();
  });
});
