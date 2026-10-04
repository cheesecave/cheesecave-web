import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRepoViewRoutes,
  getRouteViewKey,
} from "@/utils/repo-view-routes";

const lifecycle = vi.hoisted(() => ({ mounts: 0 }));

vi.mock("@/components/repo/RepoViewer.vue", async () => {
  const { defineComponent, getCurrentInstance, h } = await import("vue");
  return {
    default: defineComponent({
      name: "RepoViewer",
      props: ["repoType", "namespace", "name", "branch", "currentPath", "tab"],
      setup(props) {
        lifecycle.mounts += 1;
        const uid = getCurrentInstance().uid;
        return () =>
          h("section", { "data-repo-view": uid }, [
            h(
              "header",
              { "data-repo-header": uid },
              `${props.namespace}/${props.name}`,
            ),
            h("output", JSON.stringify(props)),
          ]);
      },
    }),
  };
});

const prefix = "/[type]s/[namespace]/[name]";
const rootPath = "/:type()s/:namespace/:name";
const suffixes = [
  ["/", ""],
  ["/tree/[branch]/", "/tree/:branch"],
  ["/tree/[branch]/[...path]", "/tree/:branch/:path(.*)"],
  ["/commits/[branch]/", "/commits/:branch"],
  ["/blob/[branch]/[...file]", "/blob/:branch/:file(.*)"],
  ["/settings", "/settings"],
];

function generatedRoutes() {
  return suffixes.map(([name, path], index) => ({
    name: prefix + name,
    path: rootPath + path,
    meta: { source: index },
    component: defineComponent({
      name: `GeneratedPage${index}`,
      setup: () => () => h("div", { "data-generated-page": index }, name),
    }),
  }));
}

async function mountRouter(path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createRepoViewRoutes(generatedRoutes()),
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(RouterView, null, {
          default: ({ Component, route }) =>
            h(KeepAlive, { include: ["RepoViewer"] }, () =>
              Component
                ? h(Component, {
                    key: getRouteViewKey(route),
                  })
                : null,
            ),
        }),
    }),
    { global: { plugins: [router] } },
  );
  await flushPromises();
  async function navigate(to) {
    await router.push(to);
    await flushPromises();
    await nextTick();
  }
  return { router, wrapper, navigate };
}

describe("repository view route normalization", () => {
  beforeEach(() => {
    lifecycle.mounts = 0;
  });

  it("retains the repository instance and header across tab route records", async () => {
    const { wrapper, navigate } = await mountRouter("/datasets/mai_lin/demo");
    const header = wrapper.get("header").element;
    const uid = wrapper.get("section").attributes("data-repo-view");
    for (const [path, tab] of [
      ["/datasets/mai_lin/demo/tree/main", "files"],
      ["/datasets/mai_lin/demo/tree/main/catalog/part", "files"],
      ["/datasets/mai_lin/demo/commits/main", "commits"],
      ["/datasets/mai_lin/demo?tab=metadata", "metadata"],
      ["/datasets/mai_lin/demo?tab=viewer", "viewer"],
      ["/datasets/mai_lin/demo", "card"],
    ]) {
      await navigate(path);
      expect(wrapper.get("header").element).toBe(header);
      expect(wrapper.get("section").attributes("data-repo-view")).toBe(uid);
      expect(JSON.parse(wrapper.get("output").text()).tab).toBe(tab);
      expect(lifecycle.mounts).toBe(1);
    }
    wrapper.unmount();
  });

  it("keeps repository and repository-type instances isolated", async () => {
    const { wrapper, navigate } = await mountRouter("/datasets/mai_lin/demo");
    const original = wrapper.get("header").element;
    await navigate("/datasets/mai_lin/other");
    expect(wrapper.get("header").element).not.toBe(original);
    expect(lifecycle.mounts).toBe(2);
    await navigate("/models/mai_lin/demo");
    expect(wrapper.get("header").element).not.toBe(original);
    expect(lifecycle.mounts).toBe(3);
    await navigate("/datasets/mai_lin/demo/tree/main");
    expect(wrapper.get("header").element).toBe(original);
    expect(lifecycle.mounts).toBe(3);
    wrapper.unmount();
  });

  it("leaves blob and settings pages independent and restores the cached repository", async () => {
    const { wrapper, navigate } = await mountRouter("/datasets/mai_lin/demo");
    const header = wrapper.get("header").element;
    for (const path of [
      "/datasets/mai_lin/demo/blob/main/README.md",
      "/datasets/mai_lin/demo/settings",
    ]) {
      await navigate(path);
      expect(wrapper.find("section").exists()).toBe(false);
      expect(wrapper.find("[data-generated-page]").exists()).toBe(true);
    }
    await navigate("/datasets/mai_lin/demo");
    expect(wrapper.get("header").element).toBe(header);
    expect(lifecycle.mounts).toBe(1);
    wrapper.unmount();
  });

  it("uses decoded route parameters and normalizes folder and branch props", async () => {
    const { wrapper, navigate } = await mountRouter(
      "/datasets/a%20team/my%20repo/tree/release%20candidate/a%20folder/part",
    );
    expect(JSON.parse(wrapper.get("output").text())).toEqual({
      repoType: "dataset",
      namespace: "a team",
      name: "my repo",
      branch: "release candidate",
      currentPath: "a folder/part",
      tab: "files",
    });
    await navigate("/datasets/a%20team/my%20repo/commits/dev");
    expect(JSON.parse(wrapper.get("output").text())).toMatchObject({
      branch: "dev",
      currentPath: "",
      tab: "commits",
    });
    await navigate("/datasets/a%20team/my%20repo?tab=unexpected");
    expect(JSON.parse(wrapper.get("output").text())).toMatchObject({
      branch: "main",
      currentPath: "",
      tab: "card",
    });
    wrapper.unmount();
  });

  it("preserves the same component during history traversal", async () => {
    const { router, wrapper, navigate } = await mountRouter(
      "/datasets/mai_lin/demo",
    );
    const header = wrapper.get("header").element;
    await navigate("/datasets/mai_lin/demo/tree/main");
    await navigate("/datasets/mai_lin/demo/commits/main");
    async function traverse(delta) {
      const completed = new Promise((resolve) => {
        const dispose = router.afterEach(() => {
          dispose();
          resolve();
        });
      });
      router.go(delta);
      await completed;
      await flushPromises();
    }
    await traverse(-1);
    expect(JSON.parse(wrapper.get("output").text()).tab).toBe("files");
    expect(wrapper.get("header").element).toBe(header);
    await traverse(-1);
    expect(JSON.parse(wrapper.get("output").text()).tab).toBe("card");
    await traverse(1);
    expect(JSON.parse(wrapper.get("output").text()).tab).toBe("files");
    expect(wrapper.get("header").element).toBe(header);
    expect(lifecycle.mounts).toBe(1);
    wrapper.unmount();
  });

  it("preserves generated route names, metadata and nested non-repository records", () => {
    const routes = generatedRoutes();
    const external = {
      path: "/settings",
      name: "globalSettings",
      meta: { auth: true },
      component: routes[5].component,
      props: true,
    };
    const result = createRepoViewRoutes([
      { path: "/", children: [...routes, external] },
    ]);
    const children = result[0].children;
    expect(
      children.map(({ name, path, meta }) => ({ name, path, meta })),
    ).toEqual(
      [...routes, external].map(({ name, path, meta }) => ({
        name,
        path,
        meta,
      })),
    );
    expect(children[4]).toEqual(routes[4]);
    expect(children[5]).toEqual(routes[5]);
    expect(children[6]).toEqual(external);
    expect(
      new Set(children.slice(0, 4).map(({ component }) => component)).size,
    ).toBe(1);
    const props = children[2].props({
      params: {
        type: "space",
        namespace: "team",
        name: "repo",
        path: ["folder", "part"],
      },
      query: {},
    });
    expect(props).toMatchObject({
      branch: "main",
      currentPath: "folder/part",
      tab: "files",
    });
    expect(routes[0].props).toBeUndefined();
  });
});
