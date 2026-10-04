import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { flushPromises } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
  },
  route: {
    params: {},
    query: {},
  },
  elMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("vue-router/auto", () => ({
  useRouter: () => mocks.router,
  useRoute: () => mocks.route,
}));

vi.mock("element-plus", async (original) => ({
  ...(await original()),
  ElMessage: mocks.elMessage,
}));

import TheHeader from "@/components/layout/TheHeader.vue";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useSiteBrandingStore } from "@/stores/siteBranding";

describe("TheHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
    setActivePinia(createPinia());
  });

  function mountHeader(props = {}) {
    return mount(TheHeader, {
      props,
      global: {
        mocks: {
          $router: mocks.router,
        },
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
        },
      },
    });
  }

  function authenticate() {
    const authStore = useAuthStore();
    authStore.user = { username: "alice" };
    authStore.logout = vi.fn().mockResolvedValue(undefined);
    return authStore;
  }

  async function openMobileMenu(wrapper) {
    await wrapper
      .findAll("button")
      .find((button) => button.find(".i-carbon-menu").exists())
      .trigger("click");
    return wrapper.get('[data-el-drawer="true"]');
  }

  function mobileAction(drawer, label) {
    return drawer
      .findAll(".cursor-pointer")
      .find((item) => item.text() === label);
  }

  const navigationEntries = [
    ["Models", "/models", "i-carbon-model", "text-blue-500"],
    ["Datasets", "/datasets", "i-carbon-data-table", "text-green-500"],
    ["Spaces", "/spaces", "i-carbon-application", "text-purple-500"],
    ["Organizations", "/organizations", "i-carbon-group", "text-orange-500"],
  ];

  const creationEntries = [
    ["New Model", { path: "/new", query: { type: "model" } }],
    ["New Dataset", { path: "/new", query: { type: "dataset" } }],
    ["New Space", { path: "/new", query: { type: "space" } }],
    ["New Organization", "/organizations/new"],
  ];

  it("switches between the expanded workspace layout and the visitor layout", async () => {
    const wrapper = mountHeader();
    expect(wrapper.get(".container-main").classes()).not.toContain(
      "workspace-header",
    );
    await wrapper.setProps({ expanded: true });
    expect(wrapper.get(".container-main").classes()).toContain(
      "workspace-header",
    );
    expect(wrapper.text()).toContain("Models");
    await wrapper.setProps({ expanded: false });
    expect(wrapper.get(".container-main").classes()).not.toContain(
      "workspace-header",
    );
    wrapper.unmount();
  });

  it("renders visitor navigation and toggles theme", async () => {
    const themeStore = useThemeStore();
    const wrapper = mountHeader();

    expect(wrapper.text()).toContain("Models");
    expect(wrapper.text()).toContain("Datasets");
    expect(wrapper.text()).toContain("Login");
    expect(wrapper.text()).toContain("Sign Up");

    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");

    expect(themeStore.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    const signUpButton = buttons.find((button) =>
      button.text().includes("Sign Up"),
    );
    await signUpButton.trigger("click");

    expect(mocks.router.push).toHaveBeenCalledWith("/register");
  });

  it("renders the same navigation destinations and authenticated menu entries on desktop and mobile", async () => {
    authenticate();
    const wrapper = mountHeader();
    const drawer = await openMobileMenu(wrapper);
    const desktopLinks = wrapper
      .get('nav[aria-label="Main navigation"]')
      .findAll("a");
    const mobileLinks = drawer.get("nav").findAll("a");

    for (const links of [desktopLinks, mobileLinks]) {
      expect(
        links.map((link) => [link.text(), link.attributes("href")]),
      ).toEqual(navigationEntries.map(([label, to]) => [label, to]));
    }
    navigationEntries.forEach(([, , icon, color], index) => {
      expect(mobileLinks[index].get(`.${icon}`).classes()).toContain(color);
    });

    const desktopMenus = wrapper.findAll('[data-el-dropdown-menu="true"]');
    const creationLabels = creationEntries.map(([label]) => label);
    const accountLabels = ["Profile", "Settings", "Logout"];
    expect(
      desktopMenus[0].findAll("button").map((item) => item.text()),
    ).toEqual(creationLabels);
    expect(
      desktopMenus[1].findAll("button").map((item) => item.text()),
    ).toEqual(accountLabels);
    expect(
      drawer.findAll(".cursor-pointer").map((item) => item.text()),
    ).toEqual([...creationLabels, ...accountLabels]);
    navigationEntries.forEach(([, , icon, color], index) => {
      for (const item of [
        desktopMenus[0].findAll("button")[index],
        mobileAction(drawer, creationLabels[index]),
      ]) {
        expect(item.get(`.${icon}`).classes()).toContain(color);
      }
    });
    expect(mobileAction(drawer, "Logout").classes()).toContain("text-red-600");
    wrapper.unmount();
  });

  it.each(navigationEntries)(
    "links to %s and closes the mobile drawer",
    async (label, to) => {
      const wrapper = mountHeader();
      const drawer = await openMobileMenu(wrapper);
      const link = drawer
        .get("nav")
        .findAll("a")
        .find((item) => item.text() === label);
      expect(link.attributes("href")).toBe(to);
      // The RouterLink stub is a plain anchor; avoid jsdom document navigation.
      link.element.addEventListener(
        "click",
        (event) => event.preventDefault(),
        {
          once: true,
        },
      );
      await link.trigger("click");
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it.each(creationEntries)(
    "routes %s to the same destination on desktop and mobile",
    async (label, to) => {
      authenticate();
      const wrapper = mountHeader();
      await wrapper
        .get('[data-el-dropdown-menu="true"]')
        .findAll("button")
        .find((item) => item.text() === label)
        .trigger("click");
      expect(mocks.router.push).toHaveBeenLastCalledWith(to);
      mocks.router.push.mockClear();

      const drawer = await openMobileMenu(wrapper);
      await mobileAction(drawer, label).trigger("click");
      expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(to);
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it.each([
    ["Profile", "/alice"],
    ["Settings", "/settings"],
    ["Logout", "/"],
  ])(
    "uses the same %s account action on desktop and mobile",
    async (label, to) => {
      const authStore = authenticate();
      const wrapper = mountHeader();
      await wrapper
        .findAll('[data-el-dropdown-menu="true"]')[1]
        .findAll("button")
        .find((item) => item.text() === label)
        .trigger("click");
      await flushPromises();
      expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(to);
      expect(authStore.logout).toHaveBeenCalledTimes(
        label === "Logout" ? 1 : 0,
      );
      mocks.router.push.mockClear();
      authStore.logout.mockClear();

      const drawer = await openMobileMenu(wrapper);
      await mobileAction(drawer, label).trigger("click");
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      await flushPromises();
      expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(to);
      expect(authStore.logout).toHaveBeenCalledTimes(
        label === "Logout" ? 1 : 0,
      );
      if (label === "Logout") {
        expect(mocks.elMessage.success).toHaveBeenCalledWith(
          "Logged out successfully",
        );
      }
      wrapper.unmount();
    },
  );

  it("updates both profile actions when the authenticated username changes", async () => {
    const authStore = authenticate();
    const wrapper = mountHeader();
    authStore.user = { username: "bob" };
    await nextTick();
    await wrapper
      .findAll('[data-el-dropdown-menu="true"]')[1]
      .findAll("button")
      .find((item) => item.text() === "Profile")
      .trigger("click");
    expect(mocks.router.push).toHaveBeenLastCalledWith("/bob");
    const drawer = await openMobileMenu(wrapper);
    await mobileAction(drawer, "Profile").trigger("click");
    expect(mocks.router.push).toHaveBeenLastCalledWith("/bob");
    wrapper.unmount();
  });

  it.each([
    ["Login", "/login"],
    ["Sign Up", "/register"],
  ])(
    "routes anonymous %s from the mobile drawer and closes it",
    async (label, to) => {
      const wrapper = mountHeader();
      const drawer = await openMobileMenu(wrapper);
      expect(drawer.text()).not.toContain("CREATE NEW");
      const button = drawer
        .findAll("button")
        .find((item) => item.text() === label);
      expect(button.classes()).toContain("w-full");
      await button.trigger("click");
      expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(to);
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it("opens the mobile menu and uses the shared avatar fallback without changing its stable source", async () => {
    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };
    authStore.logout = vi.fn().mockResolvedValue(undefined);

    const wrapper = mountHeader();

    const menuButton = wrapper
      .findAll("button")
      .find((button) => button.find(".i-carbon-menu").exists());
    await menuButton.trigger("click");
    await nextTick();

    expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(true);

    const avatar = wrapper.get('img[alt="alice avatar"]');
    expect(avatar.attributes("src")).toBe("/api/users/alice/avatar");
    await avatar.trigger("error");
    await nextTick();

    expect(wrapper.findAllComponents({ name: "EntityAvatar" })[0].text()).toBe(
      "AL",
    );
    const mobileAvatar = wrapper.get(
      '[data-el-drawer="true"] img[alt="alice avatar"]',
    );
    expect(mobileAvatar.attributes("src")).toBe("/api/users/alice/avatar");
  });

  it("shows an error message when logout fails", async () => {
    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };
    authStore.logout = vi.fn().mockRejectedValue(new Error("network"));

    const wrapper = mountHeader();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Logout"))
      .trigger("click");
    await flushPromises();

    expect(authStore.logout).toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalledWith("/");
    expect(mocks.elMessage.error).toHaveBeenCalledWith("Logout failed");
  });

  it("closes the mobile drawer immediately even when logout fails", async () => {
    const authStore = authenticate();
    authStore.logout = vi.fn().mockRejectedValue(new Error("network"));
    const wrapper = mountHeader();
    const drawer = await openMobileMenu(wrapper);
    await mobileAction(drawer, "Logout").trigger("click");
    expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
    await flushPromises();
    expect(authStore.logout).toHaveBeenCalledOnce();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.elMessage.error).toHaveBeenCalledWith("Logout failed");
    wrapper.unmount();
  });

  it("reacts to branding updates, exposes full names, and falls back on image errors", async () => {
    const store = useSiteBrandingStore();
    const name = "A long community hub name ".repeat(3);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    store.apply({ ...store.branding, site_name: name, header_logo: png });
    const wrapper = mountHeader();
    const home = wrapper
      .findAll("a")
      .find((link) => link.attributes("href") === "/");
    expect(home.attributes("aria-label")).toBe(name.trim());
    expect(home.attributes("title")).toBe(name.trim());
    expect(home.get("span").classes()).toContain("truncate");
    expect(home.get("img").attributes("src")).toBe(png);

    await home.get("img").trigger("error");
    expect(home.get("img").attributes("src")).toBe("/images/logo-square.svg");
    store.apply({
      ...store.branding,
      site_name: "Renamed Hub",
      header_logo: null,
    });
    await nextTick();
    expect(home.text()).toBe("Renamed Hub");
    expect(home.get("img").attributes("alt")).toBe("Renamed Hub");
  });
});
