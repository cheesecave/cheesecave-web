import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: { path: "", params: {}, query: {} },
  auth: { isAuthenticated: true, canWriteToNamespace: () => true },
  copy: vi.fn(async () => true),
  push: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/clipboard", () => ({ copyToClipboard: mocks.copy }));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";
import CodeViewer from "@/components/common/CodeViewer.vue";

const metadataProps = {
  repoType: String,
  namespace: String,
  name: String,
  branch: String,
  currentPath: String,
  path: String,
};
const treeStub = defineComponent({
  name: "RepositoryFileTree",
  props: metadataProps,
  emits: ["collapse"],
  setup: () => () => h("nav", { "data-stub": "RepositoryFileTree" }, "Files"),
});

const commitStub = defineComponent({
  name: "RepositoryFileCommit",
  props: metadataProps,
  setup: () => () => h("section", { "data-stub": "RepositoryFileCommit" }),
});
const markdownStub = defineComponent({
  props: ["content"],
  setup: (props) => () =>
    h("article", { "data-stub": "MarkdownViewer" }, props.content),
});
const codeStub = defineComponent({
  name: "CodeViewer",
  props: { code: String, language: String, bare: Boolean },
  setup: (props) => () => h("pre", { "data-stub": "CodeViewer" }, props.code),
});
const wrappers = [];
const hosts = [];
const pending = [];

function gate() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  pending.push(resolve);
  return { promise, resolve };
}

function mountFile({
  file = "docs/README.md",
  type = "dataset",
  body = "# Title\n\nA paragraph.\n",
  wait,
  attachTo,
} = {}) {
  mocks.route = {
    path: `/${type}s/acme/demo/blob/main/${file}`,
    params: { type, namespace: "acme", name: "demo", branch: "main", file },
    query: {},
  };
  server.use(
    http.get(`/${type}s/acme/demo/resolve/main/${file}`, async () => {
      if (wait) await wait.promise;
      return new HttpResponse(body, {
        headers: { "Content-Length": String(body.length) },
      });
    }),
  );
  const wrapper = mount(BlobPage, {
    props: { embedded: true },
    ...(attachTo ? { attachTo } : {}),
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        RepositoryFileTree: treeStub,
        RepositoryFileCommit: commitStub,
        MarkdownViewer: markdownStub,
        CodeViewer: codeStub,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

const button = (wrapper, label) =>
  wrapper
    .findAll("button")
    .find((el) => el.attributes("aria-label") === label || el.text() === label);
const ready = (wrapper) =>
  vi.waitFor(() =>
    expect(wrapper.find('[data-stub="MarkdownViewer"]').exists()).toBe(true),
  );

describe("embedded file workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { isAuthenticated: true, canWriteToNamespace: () => true };
  });
  afterEach(async () => {
    for (const resolve of pending.splice(0)) resolve();
    await flushPromises();
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    for (const host of hosts.splice(0)) host.remove();
  });

  it("renders file navigation and actions while the file content is still loading", async () => {
    const wait = gate();
    const wrapper = mountFile({ wait });
    expect(wrapper.find(".repository-file-workbench").exists()).toBe(true);
    expect(wrapper.get(".file-detail-pathbar h2").text()).toBe("README.md");
    expect(wrapper.find(".file-detail-toolbar").exists()).toBe(true);
    expect(wrapper.getComponent(treeStub).props()).toMatchObject({
      repoType: "dataset",
      namespace: "acme",
      name: "demo",
      branch: "main",
      currentPath: "docs/README.md",
    });
    expect(wrapper.getComponent(commitStub).props()).toMatchObject({
      path: "docs/README.md",
      branch: "main",
    });
    expect(wrapper.find('[data-stub="MarkdownViewer"]').exists()).toBe(false);
    expect(
      wrapper
        .get('a[href="/datasets/acme/demo/resolve/main/docs/README.md"]')
        .text(),
    ).toBe("Raw");
    wait.resolve();
    await ready(wrapper);
  });

  it("switches Markdown between preview and numbered code without duplicating toolbars", async () => {
    const body = "# Title\n\nA paragraph.\n";
    const wrapper = mountFile({ body });
    await ready(wrapper);
    expect(wrapper.findAll(".file-detail-toolbar")).toHaveLength(1);
    await button(wrapper.get(".file-detail-toolbar"), "Code").trigger("click");
    expect(wrapper.find('[data-stub="MarkdownViewer"]').exists()).toBe(false);
    expect(wrapper.getComponent(codeStub).props()).toMatchObject({
      code: body,
      bare: true,
    });
    await button(wrapper.get(".file-detail-toolbar"), "Preview").trigger(
      "click",
    );
    expect(wrapper.find('[data-stub="MarkdownViewer"]').exists()).toBe(true);
    expect(wrapper.find('[data-stub="CodeViewer"]').exists()).toBe(false);
  });

  it("keeps repository, folder, Raw and Edit destinations as real links", async () => {
    const wrapper = mountFile();
    await ready(wrapper);
    const path = wrapper.get(".file-detail-pathbar");
    expect(path.get('a[href="/datasets/acme/demo/tree/main"]').text()).toBe(
      "demo",
    );
    expect(
      path.get('a[href="/datasets/acme/demo/tree/main/docs"]').text(),
    ).toBe("docs");
    expect(
      wrapper
        .get('a[href="/datasets/acme/demo/edit/main/docs/README.md"]')
        .text(),
    ).toBe("Edit");
    expect(button(wrapper, "Delete file")).toBeDefined();
    expect(wrapper.find("h1").exists()).toBe(false);
  });

  it("copies the path, raw URL and file contents from distinct controls", async () => {
    const body = "# Title\n\nA paragraph.\n";
    const wrapper = mountFile({ body });
    await ready(wrapper);
    await button(wrapper, "Copy path").trigger("click");
    expect(mocks.copy).toHaveBeenLastCalledWith("docs/README.md");
    await button(wrapper, "Copy URL").trigger("click");
    expect(mocks.copy).toHaveBeenLastCalledWith(
      `${window.location.origin}/datasets/acme/demo/resolve/main/docs/README.md`,
    );
    await button(wrapper, "Copy file content").trigger("click");
    expect(mocks.copy).toHaveBeenLastCalledWith(body);
  });

  it("hides write actions for viewers while keeping reading controls available", async () => {
    mocks.auth = { isAuthenticated: false, canWriteToNamespace: () => false };
    const wrapper = mountFile();
    await ready(wrapper);
    expect(wrapper.find('a[href*="/edit/"]').exists()).toBe(false);
    expect(button(wrapper, "Delete file")).toBeUndefined();
    expect(button(wrapper, "Download")).toBeDefined();
    expect(wrapper.get('a[href*="/resolve/"]').text()).toBe("Raw");
  });

  it("returns the owning page scroll region to the top", async () => {
    const host = document.createElement("div");
    host.className = "page-scroll-wrap";
    const scrollTo = vi.fn();
    host.scrollTo = scrollTo;
    document.body.append(host);
    hosts.push(host);
    const wrapper = mountFile({ attachTo: host });
    await ready(wrapper);
    await button(wrapper, "Top").trigger("click");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("collapses and reopens the file tree without replacing the file preview", async () => {
    const wrapper = mountFile();
    await ready(wrapper);
    const preview = wrapper.get('[data-stub="MarkdownViewer"]').element;
    wrapper.getComponent(treeStub).vm.$emit("collapse");
    await flushPromises();
    expect(wrapper.findComponent(treeStub).exists()).toBe(false);
    expect(wrapper.get('[data-stub="MarkdownViewer"]').element).toBe(preview);
    await button(wrapper, "Show file tree").trigger("click");
    expect(wrapper.getComponent(treeStub).props("currentPath")).toBe(
      "docs/README.md",
    );
    expect(wrapper.get('[data-stub="MarkdownViewer"]').element).toBe(preview);
  });
});

describe("CodeViewer embedded under a shared toolbar", () => {
  it("retains its own copy control by default", () => {
    const wrapper = mount(CodeViewer, {
      props: { code: "first\nsecond", language: "text" },
      global: { stubs: ElementPlusStubs },
    });
    expect(wrapper.text()).toContain("2 lines");
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    wrapper.unmount();
  });

  it("omits duplicate controls in bare mode while keeping numbered source lines", () => {
    const wrapper = mount(CodeViewer, {
      props: { code: "first\nsecond", language: "text", bare: true },
      global: { stubs: ElementPlusStubs },
    });
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(wrapper.findAll("tbody tr").map((row) => row.text())).toEqual([
      "1first",
      "2second",
    ]);
    wrapper.unmount();
  });
});
