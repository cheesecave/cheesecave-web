import { mount } from "@vue/test-utils";
import { ElButton } from "element-plus";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import LinkButton from "@/components/common/LinkButton.vue";

// Real Element Plus and a real router: this is the one test that proves the combination works.
let wrappers = [];
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers = [];
});

// Clicks the link and reports whether the page's own handlers (RouterLink) took the click over.
// A listener on the document records that and then cancels the click, so jsdom does not try to
// navigate the way a browser would for a Ctrl-click.
function click(link, init = {}) {
  let handledByPage;
  const record = (event) => {
    handledByPage = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", record);
  link.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
  );
  document.removeEventListener("click", record);
  return handledByPage;
}

async function mountButton(props = {}, slot = "Settings") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/repo/settings", component: { template: "<div />" } },
    ],
  });
  router.push("/");
  await router.isReady();
  const wrapper = mount(LinkButton, {
    props,
    slots: { default: slot },
    global: { plugins: [router], components: { ElButton } },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, router };
}

describe("LinkButton", () => {
  it("is a real link that looks like an Element Plus button", async () => {
    const { wrapper } = await mountButton({
      to: "/repo/settings",
      type: "primary",
      size: "small",
    });
    const link = wrapper.get("a");
    expect(link.attributes("href")).toBe("/repo/settings");
    expect(link.classes()).toEqual(
      expect.arrayContaining(["el-button", "el-button--primary"]),
    );
    expect(link.classes()).toContain("el-button--small");
    expect(link.text()).toBe("Settings");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("keeps the client-side navigation on a plain click", async () => {
    const { wrapper, router } = await mountButton({ to: "/repo/settings" });
    expect(click(wrapper.get("a").element)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.currentRoute.value.fullPath).toBe("/repo/settings");
  });

  it("leaves Ctrl-click, Cmd-click and middle-click to the browser, so a new tab opens", async () => {
    const { wrapper, router } = await mountButton({ to: "/repo/settings" });
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { button: 1 }])
      expect(click(wrapper.get("a").element, init)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("passes classes and the plain style through to the link", async () => {
    const { wrapper } = await mountButton(
      { to: "/repo/settings", plain: true, class: "w-full" },
      "Login",
    );
    expect(wrapper.get("a").classes()).toEqual(
      expect.arrayContaining(["el-button", "is-plain", "w-full"]),
    );
  });
});
