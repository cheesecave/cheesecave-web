import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  route: { path: "", params: {}, query: {} },
  router: { push: vi.fn(), back: vi.fn() },
  auth: { isAuthenticated: true, canWriteToNamespace: () => true },
  repoAPI: {
    listTree: vi.fn(),
    fileExists: vi.fn(),
    getCommitOperations: vi.fn(),
    getCommitUnavailableFiles: vi.fn(),
  },
  settingsAPI: { getSiteConfig: vi.fn() },
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repoAPI: mocks.repoAPI,
  settingsAPI: mocks.settingsAPI,
}));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";
import CommitPage from "@/pages/[type]s/[namespace]/[name]/commit/[commit_id].vue";

const wrappers = [];
const stubs = {
  ...ElementPlusStubs,
  ElTable: true,
  ElTableColumn: true,
  ElCollapse: { template: "<div><slot /></div>" },
  ElCollapseItem: { template: "<div><slot name='title' /><slot /></div>" },
  ElTooltip: { template: "<span><slot /></span>" },
  RouterLink: RouterLinkStub,
  MarkdownViewer: { template: "<div data-stub=MarkdownViewer />" },
  CodeViewer: { template: "<div data-stub=CodeViewer />" },
};

async function mountBlob({
  type = "dataset",
  branch = "main",
  file = "notes/a.txt",
  embedded,
} = {}) {
  mocks.route = {
    path: `/${type}s/acme/demo/blob/${branch}/${file}`,
    params: { type, namespace: "acme", name: "demo", branch, file },
    query: {},
  };
  server.use(
    http.get(
      `/${type}s/acme/demo/resolve/${branch}/${file}`,
      () => new HttpResponse("hello\n", { headers: { "Content-Length": "6" } }),
    ),
  );
  const wrapper = mount(BlobPage, {
    props: embedded === undefined ? {} : { embedded },
    global: { stubs },
  });
  wrappers.push(wrapper);
  await vi.waitFor(() =>
    expect(wrapper.find("[data-stub=CodeViewer]").exists()).toBe(true),
  );
  return wrapper;
}

async function mountCommit({ type = "model", query = {}, embedded } = {}) {
  mocks.route = {
    path: `/${type}s/acme/demo/commit/commit-1`,
    params: { type, namespace: "acme", name: "demo", commit_id: "commit-1" },
    query,
  };
  server.use(
    http.get(`/api/${type}s/acme/demo/commit/commit-1`, () =>
      HttpResponse.json({
        commit_id: "commit-1",
        message: "Update weights",
        author: "alice",
        date: 1,
        parent_commit: "parent-1",
      }),
    ),
    http.get(`/api/${type}s/acme/demo/commit/commit-1/diff`, () =>
      HttpResponse.json({ files: [] }),
    ),
  );
  const wrapper = mount(CommitPage, {
    props: embedded === undefined ? {} : { embedded },
    global: { stubs },
  });
  wrappers.push(wrapper);
  await vi.waitFor(() => expect(wrapper.text()).toContain("Update weights"));
  await flushPromises();
  return wrapper;
}

const namedLinks = (wrapper, text) =>
  wrapper.findAll("a").filter((link) => link.text() === text);

describe("repository details embedded in the repository shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repoAPI.listTree.mockResolvedValue({ data: [] });
    mocks.repoAPI.fileExists.mockResolvedValue(false);
    mocks.repoAPI.getCommitOperations.mockResolvedValue({
      data: { can_write: false, operations: {} },
    });
    mocks.repoAPI.getCommitUnavailableFiles.mockResolvedValue({
      data: { files: [] },
    });
    mocks.settingsAPI.getSiteConfig.mockResolvedValue({
      data: { capabilities: { repository_operations: {} } },
    });
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it("embeds a file with its own heading, path and a real link back to the parent folder", async () => {
    const wrapper = await mountBlob({ embedded: true, branch: "develop" });
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.get("h2").text()).toBe("a.txt");
    expect(namedLinks(wrapper, "Home")).toHaveLength(0);
    expect(namedLinks(wrapper, "Datasets")).toHaveLength(0);
    expect(
      namedLinks(wrapper, "Back to Files").map((link) =>
        link.attributes("href"),
      ),
    ).toEqual(["/datasets/acme/demo/tree/develop/notes"]);
    expect(namedLinks(wrapper, "notes")[0].attributes("href")).toBe(
      "/datasets/acme/demo/tree/develop/notes",
    );
    expect(wrapper.text()).toContain("develop");
    expect(
      wrapper.findAll("a").filter((link) => link.text().startsWith("Edit")),
    ).toHaveLength(1);
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === "Back to Files"),
    ).toBe(false);
  });

  it("embeds a commit with its own heading and returns to the branch selected by its URL", async () => {
    const wrapper = await mountCommit({
      embedded: true,
      query: { branch: "develop" },
    });
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.get("h2").text()).toBe("Update weights");
    expect(namedLinks(wrapper, "Home")).toHaveLength(0);
    expect(namedLinks(wrapper, "Models")).toHaveLength(0);
    expect(
      namedLinks(wrapper, "Back to Files").map((link) =>
        link.attributes("href"),
      ),
    ).toEqual(["/models/acme/demo/tree/develop"]);
    expect(
      wrapper.get("[data-testid=parent-commit-link]").attributes("href"),
    ).toBe("/models/acme/demo/commit/parent-1?branch=develop");
    expect(namedLinks(wrapper, "alice")[0].attributes("href")).toBe("/alice");
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === "Back to Files"),
    ).toBe(false);
  });

  it("returns a root-level file to the current repository tree", async () => {
    const wrapper = await mountBlob({
      type: "model",
      file: "a.txt",
      embedded: true,
    });
    expect(namedLinks(wrapper, "Back to Files")[0].attributes("href")).toBe(
      "/models/acme/demo/tree/main",
    );
  });

  it.each([
    [{}, "main"],
    [{ branch: "main" }, "main"],
    [{ branch: "release/v2" }, "release%2Fv2"],
  ])(
    "returns a commit to the default or encoded query branch: %j",
    async (query, branch) => {
      const wrapper = await mountCommit({
        type: "dataset",
        query,
        embedded: true,
      });
      expect(namedLinks(wrapper, "Back to Files")[0].attributes("href")).toBe(
        `/datasets/acme/demo/tree/${branch}`,
      );
      expect(
        wrapper.get("[data-testid=parent-commit-link]").attributes("href"),
      ).toBe(
        `/datasets/acme/demo/commit/parent-1${branch === "main" ? "" : `?branch=${branch}`}`,
      );
    },
  );

  it.each(["model", "dataset", "space"])(
    "preserves the standalone %s file page",
    async (type) => {
      const wrapper = await mountBlob({
        type,
        embedded: type === "space" ? false : undefined,
      });
      expect(wrapper.get("h1").text()).toBe("a.txt");
      expect(namedLinks(wrapper, "Home")[0].attributes("href")).toBe("/");
      expect(namedLinks(wrapper, "demo")[0].attributes("href")).toBe(
        `/${type}s/acme/demo`,
      );
      expect(namedLinks(wrapper, "Back to Files")).toHaveLength(0);
    },
  );

  it.each(["model", "dataset", "space"])(
    "preserves the standalone %s commit page",
    async (type) => {
      const wrapper = await mountCommit({
        type,
        query: { branch: "develop" },
        embedded: type === "space" ? false : undefined,
      });
      expect(wrapper.get("h1").text()).toBe("Update weights");
      expect(namedLinks(wrapper, "Home")[0].attributes("href")).toBe("/");
      expect(namedLinks(wrapper, "demo")[0].attributes("href")).toBe(
        `/${type}s/acme/demo`,
      );
      expect(namedLinks(wrapper, "Back to Files")).toHaveLength(0);
      expect(
        wrapper.get("[data-testid=parent-commit-link]").attributes("href"),
      ).toBe(`/${type}s/acme/demo/commit/parent-1`);
    },
  );
});
