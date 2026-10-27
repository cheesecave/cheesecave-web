import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

enableAutoUnmount(afterEach);

const mountCounts = {
  repoViewer: 0,
};

const routeState = ref({
  path: "/models/mai_lin/lineart-caption-base",
});

vi.mock("vue-router/auto", () => ({
  useRoute: () => ({
    get path() {
      return routeState.value.path;
    },
    get name() {
      return routeState.value.name;
    },
    get params() {
      return routeState.value.params || {};
    },
  }),
}));

// Render functions, not `template:` strings: vitest.config.js aliases `vue` to
// the runtime-only build, which cannot compile templates at runtime. A
// `template` stub silently renders nothing there, so the assertions below would
// fail on the stub rather than on App.vue. Matches RepoViewerStub below.
vi.mock("@/components/layout/TheHeader.vue", () => ({
  default: defineComponent({
    name: "TheHeader",
    props: { expanded: Boolean, repository: Boolean },
    setup(props) {
      return () =>
        h(
          "header",
          {
            "data-header": "true",
            "data-expanded": String(props.expanded),
            "data-repository": String(props.repository),
          },
          "Header",
        );
    },
  }),
}));

vi.mock("@/components/layout/TheFooter.vue", () => ({
  default: defineComponent({
    name: "TheFooter",
    setup() {
      return () => h("footer", { "data-footer": "true" }, "Footer");
    },
  }),
}));

const RepoViewerStub = defineComponent({
  name: "RepoViewer",
  setup() {
    mountCounts.repoViewer += 1;
    return () =>
      h("div", { "data-repo-viewer": "true" }, routeState.value.path);
  },
});

const RouterViewStub = defineComponent({
  name: "RouterView",
  setup(_, { slots }) {
    return () =>
      slots.default({
        Component: RepoViewerStub,
        route: routeState.value,
      });
  },
});

import App from "@/App.vue";
import { useAuthStore } from "@/stores/auth";

describe("App shell", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("scrolls one site header with model and dataset views, leaving Spaces and other pages in the existing shell", async () => {
    const prefix = "/[type]s/[namespace]/[name]";
    const cases = [
      ["/models/team/demo", `${prefix}/`, "model", true],
      ["/models/team/demo/tree/dev", `${prefix}/tree/[branch]/`, "model", true],
      [
        "/datasets/team/demo/tree/dev/data",
        `${prefix}/tree/[branch]/[...path]`,
        "dataset",
        true,
      ],
      [
        "/datasets/team/demo/commits/dev",
        `${prefix}/commits/[branch]/`,
        "dataset",
        true,
      ],
      ["/spaces/team/demo", `${prefix}/`, "space", false],
      [
        "/spaces/team/demo/tree/main",
        `${prefix}/tree/[branch]/`,
        "space",
        false,
      ],
      [
        "/models/team/demo/blob/main/README.md",
        `${prefix}/blob/[branch]/[...file]`,
        "model",
        false,
      ],
      ["/datasets/team/demo/settings", `${prefix}/settings`, "dataset", false],
      ["/models", "/models", undefined, false],
      ["/new?type=model", "/new", undefined, false],
      ["/team", "/[username]/", undefined, false],
    ];
    const wrapper = mount(App, {
      global: { components: { RouterView: RouterViewStub } },
    });
    for (const [path, name, type, composite] of cases) {
      routeState.value = { path, name, params: { type } };
      await nextTick();
      const headers = wrapper.findAll('[data-header="true"]');
      expect(headers, path).toHaveLength(1);
      const header = headers[0];
      expect(header.attributes("data-repository"), path).toBe(
        String(composite),
      );
      expect(
        wrapper.get(".page-scroll-area").element.contains(header.element),
        path,
      ).toBe(composite);
    }
    wrapper.unmount();
  });

  it("hides the footer on every model or dataset repository route while keeping discovery and Spaces unchanged", async () => {
    const wrapper = mount(App, {
      global: { components: { RouterView: RouterViewStub } },
    });
    for (const type of ["model", "dataset"]) {
      for (const suffix of [
        "",
        "/tree/main",
        "/commits/main",
        "/blob/main/README.md",
        "/commit/abc123",
        "/settings",
        "/upload/main",
        "/edit/main/README.md",
      ]) {
        routeState.value = { path: `/${type}s/team/demo${suffix}` };
        await nextTick();
        expect(
          wrapper.find('[data-footer="true"]').exists(),
          routeState.value.path,
        ).toBe(false);
      }
    }
    for (const path of [
      "/models",
      "/datasets",
      "/models/new",
      "/datasets/new",
      "/spaces/team/demo",
      "/spaces/team/demo/tree/main",
      "/spaces/team/demo/settings",
      "/organizations/team",
    ]) {
      routeState.value = { path };
      await nextTick();
      expect(wrapper.find('[data-footer="true"]').exists(), path).toBe(true);
    }
    wrapper.unmount();
  });

  it("renders the layout and reuses repo views for the same repository", async () => {
    mountCounts.repoViewer = 0;
    routeState.value = {
      path: "/models/mai_lin/lineart-caption-base",
    };

    const wrapper = mount(App, {
      global: {
        components: {
          RouterView: RouterViewStub,
        },
      },
    });

    expect(wrapper.find('[data-header="true"]').exists()).toBe(true);
    expect(wrapper.find('[data-footer="true"]').exists()).toBe(false);
    expect(mountCounts.repoViewer).toBe(1);

    routeState.value = {
      path: "/models/mai_lin/lineart-caption-base/tree/main",
    };
    await nextTick();
    expect(mountCounts.repoViewer).toBe(1);

    routeState.value = {
      path: "/models/mai_lin/another-repo",
    };
    await nextTick();
    expect(mountCounts.repoViewer).toBe(2);

    wrapper.unmount();
  });

  it("uses the raw path as the route key for non-repository pages", async () => {
    mountCounts.repoViewer = 0;
    routeState.value = {
      path: "/login",
    };

    const wrapper = mount(App, {
      global: {
        components: {
          RouterView: RouterViewStub,
        },
      },
    });

    expect(mountCounts.repoViewer).toBe(1);

    routeState.value = {
      path: "/register",
    };
    await nextTick();

    expect(mountCounts.repoViewer).toBe(2);

    wrapper.unmount();
  });

  it("separates hyphenated repository identities and restores each cached instance", async () => {
    mountCounts.repoViewer = 0;
    routeState.value = { path: "/models/a-b/c" };
    const wrapper = mount(App, {
      global: { components: { RouterView: RouterViewStub } },
    });
    expect(mountCounts.repoViewer).toBe(1);
    routeState.value = { path: "/models/a/b-c" };
    await nextTick();
    expect(mountCounts.repoViewer).toBe(2);
    routeState.value = { path: "/models/a-b/c/tree/main" };
    await nextTick();
    expect(mountCounts.repoViewer).toBe(2);
    wrapper.unmount();
  });

  it("uses the workspace header on every authenticated page and hides the footer at home and repository pages", async () => {
    routeState.value = { path: "/" };
    const auth = useAuthStore();
    auth.user = { username: "mai_lin" };
    const wrapper = mount(App, {
      global: { components: { RouterView: RouterViewStub } },
    });
    expect(
      wrapper.get('[data-header="true"]').attributes("data-expanded"),
    ).toBe("true");
    expect(wrapper.find('[data-footer="true"]').exists()).toBe(false);

    for (const [path, footerVisible] of [
      ["/models", true],
      ["/datasets", true],
      ["/spaces", true],
      ["/organizations", true],
      ["/settings", true],
      ["/models/mai_lin/lineart-caption-base/tree/main", false],
    ]) {
      routeState.value = { path };
      await nextTick();
      expect(
        wrapper.get('[data-header="true"]').attributes("data-expanded"),
      ).toBe("true");
      expect(wrapper.find('[data-footer="true"]').exists()).toBe(footerVisible);
    }

    auth.user = null;
    await nextTick();
    expect(
      wrapper.get('[data-header="true"]').attributes("data-expanded"),
    ).toBe("false");
    expect(wrapper.find('[data-footer="true"]').exists()).toBe(false);

    auth.user = { username: "mai_lin" };
    await nextTick();
    expect(
      wrapper.get('[data-header="true"]').attributes("data-expanded"),
    ).toBe("true");

    routeState.value = { path: "/" };
    await nextTick();
    expect(wrapper.find('[data-footer="true"]').exists()).toBe(false);
    auth.user = null;
    await nextTick();
    expect(
      wrapper.get('[data-header="true"]').attributes("data-expanded"),
    ).toBe("false");
    expect(wrapper.find('[data-footer="true"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
