import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "@/testing/msw";
import { server } from "../setup/msw-server";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import RepositoryFileTree from "@/components/repo/RepositoryFileTree.vue";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router/auto", () => ({ useRouter: () => router }));
const BASE = "/api/datasets/acme/demo";
const wrappers = [];
const calls = [];
const file = (path) => ({ type: "file", path, size: 1 });
const folder = (path) => ({ type: "directory", path });
const page = (entries, next) =>
  HttpResponse.json(entries, {
    headers: next
      ? { Link: `<${BASE}/tree/main?cursor=${next}>; rel="next"` }
      : {},
  });
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function mountTree(props = {}) {
  const wrapper = mount(RepositoryFileTree, {
    props: {
      repoType: "dataset",
      namespace: "acme",
      name: "demo",
      branch: "main",
      currentPath: "README.md",
      ...props,
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        RouterLink: RouterLinkStub,
        ElTable: true,
        ElTableColumn: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const openFolder = (wrapper, path) =>
  wrapper.get(`button[aria-label='Expand ${path}']`).trigger("click");

describe("RepositoryFileTree", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    calls.length = 0;
    router.push.mockClear();
    server.use(
      http.get(`${BASE}/refs`, () =>
        HttpResponse.json({
          branches: [{ name: "main" }, { name: "release/v2" }],
        }),
      ),
      http.get(`${BASE}/tree/:branch`, ({ params, request }) => {
        calls.push({
          branch: params.branch,
          path: "",
          cursor: new URL(request.url).searchParams.get("cursor"),
        });
        return page([file("README.md"), folder("docs"), file("a #?.txt")]);
      }),
      http.get(`${BASE}/tree/:branch/docs`, ({ params }) => {
        calls.push({ branch: params.branch, path: "docs" });
        return page([file("guide.md")]);
      }),
      http.post(`${BASE}/paths-info/:branch`, () => HttpResponse.json([])),
    );
  });
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it("loads the root only, expands a folder lazily, and keeps file navigation as real encoded links", async () => {
    const wrapper = mountTree();
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-current='page']").text()).toBe("README.md"),
    );
    expect(calls).toEqual([{ branch: "main", path: "", cursor: null }]);
    expect(
      wrapper.get("a[aria-label='Open a #?.txt']").attributes("href"),
    ).toBe("/datasets/acme/demo/blob/main/a%20%23%3F.txt");
    await openFolder(wrapper, "docs");
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-label='Open docs/guide.md']").exists()).toBe(
        true,
      ),
    );
    expect(
      wrapper.get("a[aria-label='Open docs/guide.md']").attributes("href"),
    ).toBe("/datasets/acme/demo/blob/main/docs/guide.md");
    await wrapper.get("button[aria-label='Collapse docs']").trigger("click");
    await openFolder(wrapper, "docs");
    expect(calls.filter((call) => call.path === "docs")).toHaveLength(1);
  });

  it("opens current-file ancestors on a direct nested-file route", async () => {
    const wrapper = mountTree({ currentPath: "docs/guide.md" });
    await vi.waitFor(() =>
      expect(wrapper.get("a[aria-current='page']").text()).toBe("guide.md"),
    );
    expect(
      wrapper
        .get("button[aria-label='Collapse docs']")
        .attributes("aria-expanded"),
    ).toBe("true");
    expect(calls.filter((call) => call.path === "docs")).toHaveLength(1);
  });

  it("loads another page only on demand and does not duplicate rows", async () => {
    server.use(
      http.get(`${BASE}/tree/:branch`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        calls.push(cursor);
        return cursor
          ? page([file("README.md"), file("weights.bin")])
          : page([file("README.md")], "next-1");
      }),
    );
    const wrapper = mountTree();
    await vi.waitFor(() =>
      expect(
        wrapper.find("button[aria-label='Load more files in root']").exists(),
      ).toBe(true),
    );
    expect(calls).toEqual([null]);
    await wrapper
      .get("button[aria-label='Load more files in root']")
      .trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-label='Open weights.bin']").exists()).toBe(
        true,
      ),
    );
    expect(calls).toEqual([null, "next-1"]);
    expect(wrapper.findAll("a[aria-label='Open README.md']")).toHaveLength(1);
    expect(
      wrapper.find("button[aria-label='Load more files in root']").exists(),
    ).toBe(false);
  });

  it("locates the current file and its ancestors beyond a folder's first page", async () => {
    const lookups = [];
    server.use(
      http.get(`${BASE}/tree/:branch`, () =>
        page([file("README.md")], "root-next"),
      ),
      http.get(`${BASE}/tree/:branch/docs`, () =>
        page([file("other.md")], "docs-next"),
      ),
      http.post(`${BASE}/paths-info/:branch`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        lookups.push(body.getAll("paths"));
        return HttpResponse.json([folder("docs"), file("docs/guide.md")]);
      }),
    );
    const wrapper = mountTree({ currentPath: "docs/guide.md" });
    await vi.waitFor(() =>
      expect(wrapper.get("a[aria-current='page']").text()).toBe("guide.md"),
    );
    expect(lookups).toEqual([["docs", "docs/guide.md"]]);
    expect(wrapper.find("button[aria-label='Collapse docs']").exists()).toBe(
      true,
    );
    expect(
      wrapper.find("button[aria-label='Load more files in root']").exists(),
    ).toBe(true);
    expect(
      wrapper.find("button[aria-label='Load more files in docs']").exists(),
    ).toBe(true);
  });

  it("retries an individual folder without hiding other loaded files", async () => {
    let failed = true;
    server.use(
      http.get(`${BASE}/tree/:branch/docs`, () =>
        failed
          ? new HttpResponse("unavailable", { status: 503 })
          : page([file("guide.md")]),
      ),
    );
    const wrapper = mountTree();
    await vi.waitFor(() =>
      expect(wrapper.find("button[aria-label='Expand docs']").exists()).toBe(
        true,
      ),
    );
    await openFolder(wrapper, "docs");
    await vi.waitFor(() =>
      expect(wrapper.find("[data-testid='error-action-retry']").exists()).toBe(
        true,
      ),
    );
    expect(wrapper.find("a[aria-label='Open README.md']").exists()).toBe(true);
    failed = false;
    await wrapper.get("[data-testid='error-action-retry']").trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-label='Open docs/guide.md']").exists()).toBe(
        true,
      ),
    );
    expect(wrapper.find("[data-testid='error-state']").exists()).toBe(false);
  });

  it("ignores responses from a previous branch", async () => {
    const gate = deferred();
    server.use(
      http.get(`${BASE}/tree/:branch`, async ({ params }) => {
        if (params.branch === "main") await gate.promise;
        return page([file(params.branch === "main" ? "old.md" : "new.md")]);
      }),
    );
    const wrapper = mountTree({ currentPath: "" });
    await flushPromises();
    await wrapper.setProps({ branch: "dev" });
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-label='Open new.md']").exists()).toBe(true),
    );
    gate.resolve();
    await flushPromises();
    expect(wrapper.find("a[aria-label='Open old.md']").exists()).toBe(false);
    expect(wrapper.get("a[aria-label='Open new.md']").attributes("href")).toBe(
      "/datasets/acme/demo/blob/dev/new.md",
    );
  });

  it("uses real refs and changes the same file to an encoded branch", async () => {
    const wrapper = mountTree({ currentPath: "docs/guide.md" });
    await vi.waitFor(() =>
      expect(wrapper.find("option[value='release/v2']").exists()).toBe(true),
    );
    await wrapper.get("select").setValue("release/v2");
    expect(router.push).toHaveBeenCalledWith(
      "/datasets/acme/demo/blob/release%2Fv2/docs/guide.md",
    );
  });

  it("keeps files usable when refs fail, preserves the current branch and offers retry", async () => {
    let failed = true;
    server.use(
      http.get(`${BASE}/refs`, () =>
        failed
          ? new HttpResponse("unavailable", { status: 503 })
          : HttpResponse.json({ branches: [{ name: "dev" }] }),
      ),
    );
    const wrapper = mountTree();
    await vi.waitFor(() =>
      expect(wrapper.find("button[aria-label='Retry branches']").exists()).toBe(
        true,
      ),
    );
    expect(wrapper.get("option[value='main']").text()).toBe("main");
    expect(wrapper.find("a[aria-label='Open README.md']").exists()).toBe(true);
    failed = false;
    await wrapper.get("button[aria-label='Retry branches']").trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.find("option[value='dev']").exists()).toBe(true),
    );
  });

  it("filters loaded visible files and retains their parent folder", async () => {
    const wrapper = mountTree({ currentPath: "docs/guide.md" });
    await vi.waitFor(() =>
      expect(wrapper.find("a[aria-label='Open docs/guide.md']").exists()).toBe(
        true,
      ),
    );
    await wrapper.get("input[aria-label='Filter files']").setValue("guide");
    expect(wrapper.find("a[aria-label='Open README.md']").exists()).toBe(false);
    expect(wrapper.find("button[aria-label='Collapse docs']").exists()).toBe(
      true,
    );
    expect(wrapper.find("a[aria-label='Open docs/guide.md']").exists()).toBe(
      true,
    );
    await wrapper.get("button[aria-label='Hide file tree']").trigger("click");
    expect(wrapper.emitted("collapse")).toHaveLength(1);
  });
});
