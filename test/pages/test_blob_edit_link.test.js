// The Edit button of the file page is a link to the editor, so it opens in a new tab.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  file: "notes/a.md",
  auth: { isAuthenticated: true, canWriteToNamespace: () => true },
  push: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => ({
    path: `/datasets/acme/demo/blob/main/${mocks.file}`,
    params: {
      namespace: "acme",
      name: "demo",
      branch: "main",
      file: mocks.file,
    },
    query: {},
  }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/api", () => ({
  repoAPI: {
    listTree: vi.fn(async () => ({ data: [] })),
    fileExists: vi.fn(async () => false),
  },
}));

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";

const serve = (file, body) =>
  server.use(
    http.get(
      `/datasets/acme/demo/resolve/main/${file}`,
      () =>
        new HttpResponse(body, {
          status: 200,
          headers: { "Content-Length": String(body.length) },
        }),
    ),
  );

async function mountBlob(file) {
  mocks.file = file;
  const wrapper = mount(BlobPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: { template: "<div data-stub=MarkdownViewer />" },
        CodeViewer: { template: "<div data-stub=CodeViewer />" },
      },
    },
  });
  for (let i = 0; i < 5; i++) await flushPromises();
  return wrapper;
}

const editLinks = (wrapper) =>
  wrapper.findAll("a").filter((link) => link.text().startsWith("Edit"));

describe("file page Edit link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { isAuthenticated: true, canWriteToNamespace: () => true };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("links a text file to its editor", async () => {
    serve("notes/a.txt", "hello\n");
    const wrapper = await mountBlob("notes/a.txt");
    expect(editLinks(wrapper).map((link) => link.attributes("href"))).toEqual([
      "/datasets/acme/demo/edit/main/notes/a.txt",
    ]);
    expect(wrapper.findAll("button").map((b) => b.text())).not.toContain(
      "Edit",
    );
  });

  it("links a Markdown file to its editor from the header and from the preview toolbar", async () => {
    serve("notes/a.md", "# Title\n");
    const wrapper = await mountBlob("notes/a.md");
    expect(editLinks(wrapper).map((link) => link.attributes("href"))).toEqual([
      "/datasets/acme/demo/edit/main/notes/a.md",
      "/datasets/acme/demo/edit/main/notes/a.md",
    ]);
  });

  it("shows no Edit to someone who cannot write here", async () => {
    mocks.auth = { isAuthenticated: false, canWriteToNamespace: () => false };
    serve("notes/a.txt", "hello\n");
    const wrapper = await mountBlob("notes/a.txt");
    expect(editLinks(wrapper)).toHaveLength(0);
  });
});
