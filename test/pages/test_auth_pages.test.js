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
import { repositoryAccessAPI } from "@/utils/api";
import InvitationPage from "@/components/repo/RepositoryInvitationPage.vue";
import GuestRegistrationLink from "@/components/repo/RepositoryGuestRegistrationLink.vue";
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

  const invitationCodeInput = (wrapper) =>
    wrapper.get('input[placeholder="Invitation code"]');

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
    [false, "admin-site-fixture"],
    [true, "admin-site-fixture"],
    [false, "repo_ambiguous-prefix-fixture"],
    [true, "repo_ambiguous-prefix-fixture"],
  ])(
    "uses one generic field and delegates code recognition to the server (required: %s, code: %s)",
    async (invitationOnly, code) => {
      axios.get.mockResolvedValueOnce({
        data: { invitation_only: invitationOnly },
      });
      const router = await createTestRouter("/register");
      const auth = useAuthStore();
      auth.register = vi.fn().mockResolvedValue({ email_verified: false });
      const wrapper = mountPage(RegisterPage, router);
      await flushPromises();
      const input = invitationCodeInput(wrapper);
      expect(input.attributes("aria-label")).toBe("Invitation code");
      expect(
        wrapper
          .findComponent({ name: "ElForm" })
          .props("rules")
          .invitationCode.some((rule) => rule.required === invitationOnly),
      ).toBe(true);
      expect(wrapper.html()).not.toContain("Repository invitation code");
      expect(wrapper.text()).not.toMatch(
        /Using Invitation|Grants read access|replace a required site registration invitation|You're registering with an invitation link/,
      );
      await fillRegistration(wrapper);
      await input.setValue(` ${code} `);
      await submitRegistration(wrapper);
      expect(auth.register).toHaveBeenCalledWith({
        username: "reader",
        email: "reader@example.com",
        password: "long-enough-password",
        invitation_code: code,
      });
      wrapper.unmount();
    },
  );

  it("waits for the registration policy before allowing signup", async () => {
    let finishConfig;
    axios.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishConfig = resolve;
      }),
    );
    const router = await createTestRouter("/register");
    const auth = useAuthStore();
    auth.register = vi.fn();
    const wrapper = mountPage(RegisterPage, router);
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).not.toHaveBeenCalled();
    finishConfig({ data: { invitation_only: true } });
    await flushPromises();
    await submitRegistration(wrapper);
    expect(auth.register).not.toHaveBeenCalled();
    expect(invitationCodeInput(wrapper).element.value).toBe("");
    wrapper.unmount();
  });

  it("accepts a site invitation without losing an existing visitor registration context", async () => {
    const { createGuestRepositoryRegistration, readRepositoryRegistration } =
      await import("@/utils/repository-registration");
    const target = createGuestRepositoryRegistration(
      { type: "dataset", namespace: "owner", name: "preview" },
      42,
    );
    axios.get.mockResolvedValueOnce({ data: { invitation_only: true } });
    const router = await createTestRouter(target);
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({
      email_verified: true,
      repository_url: "/datasets/owner/preview",
    });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    expect(invitationCodeInput(wrapper).element.value).toBe("");
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).not.toHaveBeenCalled();
    await invitationCodeInput(wrapper).setValue("site-guest-fixture");
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith({
      username: "reader",
      email: "reader@example.com",
      password: "long-enough-password",
      invitation_code: "site-guest-fixture",
      repo_guest_repository_id: 42,
    });
    expect(router.currentRoute.value.path).toBe("/datasets/owner/preview");
    expect(
      readRepositoryRegistration(target.query.repository_invitation),
    ).toBeNull();
    wrapper.unmount();
  });

  it("uses the edited invitation code instead of resubmitting the original link", async () => {
    const router = await createTestRouter(
      "/register?invitation=original-fixture",
    );
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({ email_verified: false });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    expect(invitationCodeInput(wrapper).element.value).toBe("original-fixture");
    await invitationCodeInput(wrapper).setValue("second-fixture");
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith({
      username: "reader",
      email: "reader@example.com",
      password: "long-enough-password",
      invitation_code: "second-fixture",
    });
    wrapper.unmount();
  });

  it.each(["model", "dataset"])(
    "registers from an active %s preview using its existing cookie context",
    async (type) => {
      const repository = { type, namespace: "owner", name: "preview" };
      const repositoryPath = `/${type}s/owner/preview`;
      const router = await createTestRouter(repositoryPath + "/tree/main");
      const host = mount(
        { render: () => null },
        { global: { plugins: [router] } },
      );
      const auth = useAuthStore();
      auth.register = vi.fn().mockResolvedValue({
        email_verified: true,
        repository_url: repositoryPath,
      });
      auth.login = vi.fn().mockResolvedValue({ ok: true });
      const link = mount(GuestRegistrationLink, {
        props: {
          repository,
          access: { access: "guest", registration_repository_id: 42 },
        },
        global: { plugins: [router] },
      });
      await link.get("a").trigger("click");
      await flushPromises();
      const handoffId = router.currentRoute.value.query.repository_invitation;
      expect(router.currentRoute.value.path).toBe("/register");
      link.unmount();
      const page = mountPage(RegisterPage, router);
      await flushPromises();
      expect(page.find('input[placeholder="Invitation code"]').exists()).toBe(
        false,
      );
      await fillRegistration(page);
      await submitRegistration(page);
      expect(auth.register).toHaveBeenCalledWith({
        username: "reader",
        email: "reader@example.com",
        password: "long-enough-password",
        repo_guest_repository_id: 42,
      });
      expect(auth.login).toHaveBeenCalledOnce();
      expect(router.currentRoute.value.fullPath).toBe(repositoryPath);
      expect(
        sessionStorage.getItem(`repository-registration:${handoffId}`),
      ).toBeNull();
      page.unmount();
      host.unmount();
    },
  );

  it("carries an entered code through the real invitation registration link and a page unmount", async () => {
    const repository = { type: "model", namespace: "owner", name: "demo" };
    const repositoryPath = "/models/owner/demo";
    const token = "repo_real_link_fixture";
    const { readRepositoryRegistration } = await import(
      "@/utils/repository-registration"
    );
    const router = await createTestRouter(repositoryPath);
    // Route changes unmount pages while the SPA's router-owning root survives.
    // Keep that root installed when swapping these independently mounted pages.
    const routerHost = mount(
      { render: () => null },
      { global: { plugins: [router] } },
    );
    vi.spyOn(repositoryAccessAPI, "getRequest").mockResolvedValue({
      data: { request: null },
    });
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({
      email_verified: true,
      repository_url: repositoryPath,
    });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const invitation = mount(InvitationPage, {
      props: {
        repository,
        access: { visibility: "invite", invite_markdown: "# Join" },
        embedded: true,
      },
      global: { plugins: [router], stubs: { ...ElementPlusStubs } },
    });
    await flushPromises();
    await invitation
      .findAll("button")
      .find((button) => button.text() === "Have an Invitation?")
      .trigger("click");
    await invitation
      .get('input[aria-label="Repository invitation code"]')
      .setValue(token);
    const link = invitation
      .findAll("a")
      .find((anchor) => anchor.text() === "Sign Up");
    const href = new URL(link.attributes("href"), "http://localhost");
    const handoffId = href.searchParams.get("repository_invitation");
    expect(handoffId).toMatch(/^[a-f0-9]{32}$/);
    expect(href.href).not.toContain(token);
    expect(readRepositoryRegistration(handoffId)).toBeNull();

    await link.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/register");
    expect(router.currentRoute.value.query.repository_invitation).toBe(
      handoffId,
    );
    expect(readRepositoryRegistration(handoffId)).toEqual({
      token,
      repositoryPath,
    });
    invitation.unmount();
    expect(router.currentRoute.value.path).toBe("/register");
    expect(readRepositoryRegistration(handoffId)).toEqual({
      token,
      repositoryPath,
    });

    const registration = mountPage(RegisterPage, router);
    await flushPromises();
    expect(invitationCodeInput(registration).element.value).toBe(token);
    await fillRegistration(registration);
    await submitRegistration(registration);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_code: token }),
    );
    expect(auth.login).toHaveBeenCalledWith({
      username: "reader",
      password: "long-enough-password",
    });
    expect(router.currentRoute.value.path).toBe(repositoryPath);
    expect(readRepositoryRegistration(handoffId)).toBeNull();
    registration.unmount();
    routerHost.unmount();
  });

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
      auth.register = vi.fn().mockResolvedValue({
        email_verified: true,
        repository_url: repositoryUrl,
      });
      auth.login = vi.fn().mockResolvedValue({ ok: true });
      const wrapper = mountPage(RegisterPage, router);
      await flushPromises();
      expect(router.currentRoute.value.fullPath).not.toContain(context.token);
      expect(invitationCodeInput(wrapper).element.value).toBe(context.token);
      await fillRegistration(wrapper);
      await submitRegistration(wrapper);
      expect(auth.register).toHaveBeenCalledWith({
        username: "reader",
        email: "reader@example.com",
        password: "long-enough-password",
        invitation_code: context.token,
      });
      expect(auth.login).toHaveBeenCalledTimes(1);
      expect(router.currentRoute.value.path).toBe(expectedPath);
      expect(context.read()).toBeNull();
      expect(invitationCodeInput(wrapper).element.value).toBe("");
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
    expect(invitationCodeInput(wrapper).element.value).toBe("");
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
    expect(invitationCodeInput(wrapper).element.value).toBe("");
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
    expect(invitationCodeInput(wrapper).element.value).toBe(context.token);
    expect(auth.login).not.toHaveBeenCalled();
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledTimes(2);
    for (const [payload] of auth.register.mock.calls)
      expect(payload.invitation_code).toBe(context.token);
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
    expect(wrapper.get('input[placeholder="Choose a username"]').exists()).toBe(
      true,
    );
    expect(invitationCodeInput(wrapper).element.value).toBe("");
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).not.toHaveBeenCalled();
    expect(context.read().token).toBe(context.token);
    auth.register.mockResolvedValue({
      email_verified: true,
      repository_url: context.repositoryPath,
    });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    await invitationCodeInput(wrapper).setValue("admin-manual-fixture");
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({
        invitation_code: "admin-manual-fixture",
        repo_invitation_token: context.token,
      }),
    );
    expect(router.currentRoute.value.path).toBe(context.repositoryPath);
    expect(context.read()).toBeNull();
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
        invitation_code: "site_registration_fixture",
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
    auth.register = vi.fn().mockResolvedValue({
      email_verified: true,
      repository_url: "/models/owner/legacy",
    });
    auth.login = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    expect(invitationCodeInput(wrapper).element.value).toBe(
      "repo_legacy_fixture",
    );
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_code: "repo_legacy_fixture" }),
    );
    expect(auth.register.mock.calls[0][0].invitation_token).toBeUndefined();
    expect(router.currentRoute.value.path).toBe("/models/owner/legacy");
    expect(invitationCodeInput(wrapper).element.value).toBe("");
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

  it("allows an invitation to be entered when registration requires one", async () => {
    const router = await createTestRouter("/register");
    axios.get.mockResolvedValueOnce({
      data: { invitation_only: true },
    });

    const wrapper = mountPage(RegisterPage, router);
    await flushPromises();
    const auth = useAuthStore();
    auth.register = vi.fn().mockResolvedValue({ email_verified: false });
    expect(wrapper.get('input[placeholder="Choose a username"]').exists()).toBe(
      true,
    );
    expect(invitationCodeInput(wrapper).element.value).toBe("");
    await fillRegistration(wrapper);
    await submitRegistration(wrapper);
    expect(auth.register).not.toHaveBeenCalled();
    await invitationCodeInput(wrapper).setValue("admin-site-fixture");
    await submitRegistration(wrapper);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_code: "admin-site-fixture" }),
    );
    wrapper.unmount();
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
    expect(invitationCodeInput(wrapper).element.value).toBe("invite-123");
    expect(wrapper.text()).not.toMatch(
      /Using Invitation|You're registering with an invitation link|Grants read access/,
    );

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
      invitation_code: "invite-123",
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
    await w.get('input[placeholder="Invitation code"]').setValue("repo_secret");
    await w
      .findAll("button")
      .find((b) => b.text().includes("Sign Up"))
      .trigger("click");
    await flushPromises();
    expect(authStore.register).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_code: "repo_secret" }),
    );
    w.unmount();
  });
  it("leaves invitation eligibility to the server instead of classifying a query code in the browser", async () => {
    const router = await createTestRouter("/register?invitation=repo_private");
    axios.get.mockResolvedValueOnce({ data: { invitation_only: true } });
    const w = mountPage(RegisterPage, router);
    await flushPromises();
    const auth = useAuthStore();
    auth.register = vi
      .fn()
      .mockRejectedValue(new Error("Invalid invitation code"));
    auth.login = vi.fn();
    expect(invitationCodeInput(w).element.value).toBe("repo_private");
    await fillRegistration(w);
    await submitRegistration(w);
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_code: "repo_private" }),
    );
    expect(auth.login).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/register");
    expect(invitationCodeInput(w).element.value).toBe("repo_private");
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
      invitation_code: "invite-123",
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

  it("does not submit registration when the site settings cannot load", async () => {
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
    expect(authStore.register).not.toHaveBeenCalled();
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
