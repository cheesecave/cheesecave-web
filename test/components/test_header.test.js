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
import { clearMissingEntityAvatars } from "@/utils/entity-avatar";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useSiteBrandingStore } from "@/stores/siteBranding";

describe("TheHeader", () => {
  beforeEach(() => {
    clearMissingEntityAvatars();
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
          HeaderSearch: {
            template:
              '<input data-testid="header-search" aria-label="Search the Hub" />',
          },
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
    ["New Model", "/new?type=model"],
    ["New Dataset", "/new?type=dataset"],
    ["New Space", "/new?type=space"],
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

    // Login and Sign Up are links styled as buttons, so they open in a new tab
    const links = Object.fromEntries(
      wrapper
        .findAll("a")
        .map((link) => [link.text(), link.attributes("href")]),
    );
    expect(links.Login).toBe("/login");
    expect(links["Sign Up"]).toBe("/register");
    expect(
      buttons.filter((button) => ["Login", "Sign Up"].includes(button.text())),
    ).toHaveLength(0);
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("keeps site navigation usable in the scrolling repository header", async () => {
    authenticate();
    const wrapper = mountHeader({ repository: true, expanded: true });
    expect(wrapper.get("header").classes()).toContain("repository-site-header");
    expect(
      wrapper
        .get('nav[aria-label="Main navigation"]')
        .findAll("a")
        .map((link) => [link.text(), link.attributes("href")]),
    ).toEqual(navigationEntries.map(([label, to]) => [label, to]));
    const drawer = await openMobileMenu(wrapper);
    expect(
      drawer
        .get("nav")
        .findAll("a")
        .map((link) => link.attributes("href")),
    ).toEqual(navigationEntries.map(([, to]) => to));
    await wrapper.setProps({ repository: false });
    expect(wrapper.get("header").classes()).not.toContain(
      "repository-site-header",
    );
    expect(wrapper.get("header").classes()).toContain("sticky");
    wrapper.unmount();
  });

  it("adds search immediately after the brand only in the repository header", async () => {
    const wrapper = mountHeader();
    expect(wrapper.find('[data-testid="header-search"]').exists()).toBe(false);
    await wrapper.setProps({ repository: true });
    const container = wrapper.get(".container-main");
    const search = container.get('[data-testid="header-search"]');
    expect(container.element.children[0].tagName).toBe("A");
    expect(container.element.children[1]).toBe(search.element);
    expect(
      search.element.compareDocumentPosition(container.get("nav").element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await wrapper.setProps({ repository: false });
    expect(wrapper.find('[data-testid="header-search"]').exists()).toBe(false);
    wrapper.unmount();
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
    "links %s to the same destination on desktop and mobile",
    async (label, to) => {
      authenticate();
      const wrapper = mountHeader();
      const desktop = wrapper
        .get('[data-el-dropdown-menu="true"]')
        .findAll("button")
        .find((item) => item.text() === label)
        .get("a");
      expect(desktop.attributes("href")).toBe(to);
      // the menu item is the one keyboard stop; the link inside it is not a second one
      expect(desktop.attributes("tabindex")).toBe("-1");

      const drawer = await openMobileMenu(wrapper);
      const mobile = mobileAction(drawer, label);
      expect(mobile.element.tagName).toBe("A");
      expect(mobile.attributes("href")).toBe(to);
      mobile.element.addEventListener("click", (e) => e.preventDefault(), {
        once: true,
      });
      await mobile.trigger("click");
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      expect(mocks.router.push).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it.each([
    ["Profile", "/alice"],
    ["Settings", "/settings"],
  ])("links %s to the same page on desktop and mobile", async (label, to) => {
    authenticate();
    const wrapper = mountHeader();
    const desktop = wrapper
      .findAll('[data-el-dropdown-menu="true"]')[1]
      .findAll("button")
      .find((item) => item.text() === label)
      .get("a");
    expect(desktop.attributes("href")).toBe(to);
    expect(desktop.attributes("tabindex")).toBe("-1");

    const drawer = await openMobileMenu(wrapper);
    const mobile = mobileAction(drawer, label);
    expect(mobile.element.tagName).toBe("A");
    expect(mobile.attributes("href")).toBe(to);
    mobile.element.addEventListener("click", (e) => e.preventDefault(), {
      once: true,
    });
    await mobile.trigger("click");
    expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
    expect(mocks.router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps Logout an action, not a link, on desktop and mobile", async () => {
    const authStore = authenticate();
    const wrapper = mountHeader();
    const desktop = wrapper
      .findAll('[data-el-dropdown-menu="true"]')[1]
      .findAll("button")
      .find((item) => item.text() === "Logout");
    expect(desktop.find("a").exists()).toBe(false);
    await desktop.trigger("click");
    await flushPromises();
    expect(authStore.logout).toHaveBeenCalledTimes(1);
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith("/");
    expect(mocks.elMessage.success).toHaveBeenCalledWith(
      "Logged out successfully",
    );
    mocks.router.push.mockClear();
    authStore.logout.mockClear();

    const drawer = await openMobileMenu(wrapper);
    const mobile = mobileAction(drawer, "Logout");
    expect(mobile.element.tagName).not.toBe("A");
    await mobile.trigger("click");
    expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
    await flushPromises();
    expect(authStore.logout).toHaveBeenCalledTimes(1);
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith("/");
    wrapper.unmount();
  });

  it("follows a menu link when Enter or Space reaches the item, which Element Plus reports as a click carrying the key event", async () => {
    authenticate();
    const wrapper = mountHeader();
    const items = wrapper
      .get('[data-el-dropdown-menu="true"]')
      .findAll("button");
    const item = items.find((entry) => entry.text() === "New Dataset");
    const anchor = item.get("a").element;
    const follow = vi.spyOn(anchor, "click").mockImplementation(() => {});
    const dropdownItem = wrapper
      .findAllComponents({ name: "ElDropdownItem" })
      .find((entry) => entry.text() === "New Dataset");

    // a mouse click lands on the link itself, which navigates by itself
    dropdownItem.vm.$emit("click", new MouseEvent("click"));
    expect(follow).not.toHaveBeenCalled();

    const key = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(key, "target", { value: item.element });
    dropdownItem.vm.$emit("click", key);
    expect(follow).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("updates both profile actions when the authenticated username changes", async () => {
    const authStore = authenticate();
    const wrapper = mountHeader();
    authStore.user = { username: "bob" };
    await nextTick();
    const desktop = wrapper
      .findAll('[data-el-dropdown-menu="true"]')[1]
      .findAll("button")
      .find((item) => item.text() === "Profile")
      .get("a");
    expect(desktop.attributes("href")).toBe("/bob");
    const drawer = await openMobileMenu(wrapper);
    expect(mobileAction(drawer, "Profile").attributes("href")).toBe("/bob");
    wrapper.unmount();
  });

  it.each([
    ["Login", "/login"],
    ["Sign Up", "/register"],
  ])(
    "links anonymous %s from the mobile drawer and closes it",
    async (label, to) => {
      const wrapper = mountHeader();
      const drawer = await openMobileMenu(wrapper);
      expect(drawer.text()).not.toContain("CREATE NEW");
      const link = drawer.findAll("a").find((item) => item.text() === label);
      expect(link.attributes("href")).toBe(to);
      expect(link.classes()).toContain("w-full");
      expect(drawer.findAll("button").map((b) => b.text())).not.toContain(
        label,
      );
      link.element.addEventListener("click", (e) => e.preventDefault(), {
        once: true,
      });
      await link.trigger("click");
      expect(wrapper.find('[data-el-drawer="true"]').exists()).toBe(false);
      expect(mocks.router.push).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it("opens the mobile menu and uses the shared avatar fallback; once the avatar failed, the account's other avatars do not ask again", async () => {
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
    // the other avatar of the same account does not ask for what has just failed to load
    expect(
      wrapper.find('[data-el-drawer="true"] img[alt="alice avatar"]').exists(),
    ).toBe(false);
    expect(wrapper.get('[data-el-drawer="true"]').text()).toContain("AL");
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

  describe("accessible names", () => {
    const nameOf = (button) =>
      button.attributes("aria-label") ||
      button.attributes("title") ||
      button.text().trim();

    it("names every button, signed in or not", async () => {
      for (const signedIn of [false, true]) {
        localStorage.clear();
        setActivePinia(createPinia());
        if (signedIn) useAuthStore().user = { username: "alice" };
        const wrapper = mountHeader();
        await flushPromises();
        const buttons = wrapper.findAll("button");
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons)
          expect(nameOf(button), button.html()).not.toBe("");
        wrapper.unmount();
      }
    });

    it("says what the theme switch will do, and follows the theme", async () => {
      const wrapper = mountHeader();
      const switchLabels = () =>
        wrapper
          .findAll("button")
          .map(nameOf)
          .filter((name) => /theme/.test(name));
      const before = switchLabels();
      expect(before.length).toBeGreaterThan(0);
      for (const name of before) expect(name).toBe("Switch to dark theme");

      useThemeStore().toggle();
      await nextTick();

      for (const name of switchLabels())
        expect(name).toBe("Switch to light theme");
    });

    it("names the create menu and the mobile menu button", async () => {
      useAuthStore().user = { username: "alice" };
      const wrapper = mountHeader();
      await flushPromises();
      const names = wrapper.findAll("button").map(nameOf);
      expect(names).toContain("Create new");
      expect(names).toContain("Open menu");
    });
  });
});
