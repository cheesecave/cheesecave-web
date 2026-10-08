import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

vi.mock("vue-router/auto", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import RepoViewer from "@/components/repo/RepoViewer.vue";

const BASE = "/api/datasets/open-media-lab/big-repo";

function deferred() {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
}

function mountViewer(tab, props = {}) {
  return mount(RepoViewer, {
    props: {
      repoType: "dataset",
      namespace: "open-media-lab",
      name: "big-repo",
      branch: "main",
      currentPath: "",
      tab,
      ...props,
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTooltip: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: defineComponent({
          props: ["content"],
          setup: (props) => () => h("article", props.content),
        }),
        MetadataHeader: true,
        DetailedMetadataPanel: true,
        ReferencedDatasetsCard: true,
        SidebarRelationshipsCard: true,
      },
    },
  });
}

// The repository page's file list comes from the paginated tree; the
// whole-repository sibling list in repo info grows with the repository
// (#101), so the page asks only for its own fields.
describe("RepoViewer loading on a big repository", () => {
  const seen = [];
  let infoGate;
  const gates = new Map();

  beforeEach(() => {
    seen.length = 0;
    infoGate = null;
    gates.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("/api/users/open-media-lab/type", () =>
        jsonResponse({ type: "org" }),
      ),
      http.get(BASE, async ({ request }) => {
        const url = new URL(request.url);
        seen.push({ what: "info", expand: url.searchParams.getAll("expand") });
        if (infoGate) await infoGate.promise;
        const { siblings, ...info } = cloneFixture(uiApiFixtures.repo.info);
        return jsonResponse({ ...info, id: "open-media-lab/big-repo" });
      }),
      http.get(`${BASE}/tree/:branch`, async ({ params }) => {
        seen.push({ what: "tree", branch: params.branch, path: "" });
        if (gates.has(`tree:${params.branch}`)) {
          await gates.get(`tree:${params.branch}`).promise;
        }
        return jsonResponse([
          { type: "file", path: "README.md", size: 9, oid: "r" },
          ...cloneFixture(uiApiFixtures.repo.tree),
        ]);
      }),
      http.get(`${BASE}/tree/:branch/nested`, ({ params }) => {
        seen.push({ what: "tree", branch: params.branch, path: "nested" });
        return jsonResponse([
          { type: "file", path: "nested/data.csv", size: 9, oid: "f" },
        ]);
      }),
      http.post(`${BASE}/paths-info/:branch`, () => jsonResponse([])),
      http.get(
        "/datasets/open-media-lab/big-repo/resolve/:branch/README.md",
        async ({ params }) => {
          seen.push({ what: "readme", branch: params.branch });
          if (gates.has(`readme:${params.branch}`)) {
            await gates.get(`readme:${params.branch}`).promise;
          }
          return new HttpResponse(`# Big repo ${params.branch}\n`, {
            status: 200,
          });
        },
      ),
      http.get(`${BASE}/commits/:branch`, async ({ params }) => {
        seen.push({ what: "commits", branch: params.branch });
        if (gates.has(`commits:${params.branch}`)) {
          await gates.get(`commits:${params.branch}`).promise;
        }
        return jsonResponse({
          commits: [
            {
              id: `commit-${params.branch}`,
              title: `Commit on ${params.branch}`,
              author: "alice",
              date: 1,
            },
          ],
          hasMore: false,
        });
      }),
      http.post(`${BASE}/commits/unavailable-files`, () =>
        jsonResponse({ commits: {} }),
      ),
      http.get("/api/site-config", () => jsonResponse({})),
    );
  });

  it("asks repo info for the page's fields only, never the file list", async () => {
    mountViewer("files");
    await flushPromises();

    const info = seen.find((s) => s.what === "info");
    expect(info.expand).toEqual(
      expect.arrayContaining([
        "sha",
        "lastModified",
        "private",
        "likes",
        "tags",
        "storage",
      ]),
    );
    expect(info.expand).not.toContain("siblings");
  });

  it("starts the file list without waiting for repo info", async () => {
    infoGate = deferred();
    const wrapper = mountViewer("files");
    await flushPromises();

    expect(seen.map((s) => s.what)).toEqual(["info", "tree"]);

    infoGate.resolve();
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("README.md");
  });

  it("fetches the README once on the card tab", async () => {
    mountViewer("card");
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(seen.filter((s) => s.what === "readme")).toHaveLength(1);
  });

  it("keeps the repository header, sidebar and tab buttons mounted while tab data loads", async () => {
    const wrapper = mountViewer("card");
    await vi.waitFor(() =>
      expect(wrapper.find("article").text()).toContain("Big repo main"),
    );
    const heading = wrapper.get("h1").element;
    const sidebar = wrapper.get("aside").element;
    const buttons = wrapper
      .findAll("button")
      .filter((button) =>
        ["Dataset Card", "Files", "Commits", "Metadata"].includes(
          button.text(),
        ),
      )
      .map((button) => button.element);
    const gate = deferred();
    gates.set("commits:main", gate);

    for (const tab of ["files", "commits", "metadata", "card"]) {
      await wrapper.setProps({ tab });
      await flushPromises();
      expect(wrapper.get("h1").element).toBe(heading);
      expect(wrapper.get("aside").element).toBe(sidebar);
      for (const button of buttons)
        expect(wrapper.element.contains(button)).toBe(true);
    }
    expect(seen.filter((request) => request.what === "info")).toHaveLength(1);
    gate.resolve();
    await flushPromises();
    wrapper.unmount();
  });

  it.each([
    ["dataset", "org", "/organizations/open-media-lab"],
    ["model", "user", "/open-media-lab"],
  ])(
    "shows a single linked %s repository title without a redundant page breadcrumb",
    async (repoType, ownerType, ownerHref) => {
      server.use(
        http.get("/api/users/open-media-lab/type", () =>
          jsonResponse({ type: ownerType }),
        ),
        http.get(`/api/${repoType}s/open-media-lab/big-repo`, () =>
          jsonResponse({
            ...cloneFixture(uiApiFixtures.repo.info),
            id: "open-media-lab/big-repo",
          }),
        ),
        http.get(`/api/${repoType}s/open-media-lab/big-repo/tree/main`, () =>
          jsonResponse([]),
        ),
        http.get(`/api/${repoType}s/open-media-lab/big-repo/commits/main`, () =>
          jsonResponse({ commits: [], hasMore: false }),
        ),
        http.post(
          `/api/${repoType}s/open-media-lab/big-repo/paths-info/main`,
          () => jsonResponse([]),
        ),
      );
      const wrapper = mountViewer("files", { repoType });
      await vi.waitFor(() =>
        expect(wrapper.get(".repo-header h1 a").attributes("href")).toBe(
          ownerHref,
        ),
      );
      const header = wrapper.get(".repo-header").element;
      for (const tab of ["files", "commits", "metadata", "card"]) {
        await wrapper.setProps({ tab });
        expect(wrapper.find(".repo-breadcrumb").exists()).toBe(false);
        expect(wrapper.get(".repo-header").element).toBe(header);
        expect(wrapper.get(".repo-header h1").text().replace(/\s+/g, " ")).toBe(
          "open-media-lab / big-repo",
        );
        expect(
          wrapper
            .get(".repo-header")
            .text()
            .match(/big-repo/g),
        ).toHaveLength(1);
        expect(
          wrapper.find('button[aria-label="Copy repository ID"]').exists(),
        ).toBe(true);
      }
      await flushPromises();
      wrapper.unmount();
    },
  );

  it("keeps directory breadcrumbs in Files and repository navigation in the full-width Viewer", async () => {
    const wrapper = mountViewer("files", { currentPath: "nested" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("data.csv"));
    expect(wrapper.find(".repo-breadcrumb").exists()).toBe(false);
    const rootLink = wrapper.get(".repo-file-breadcrumb a");
    expect(rootLink.text()).toBe("root");
    expect(rootLink.attributes("href")).toBe(
      "/datasets/open-media-lab/big-repo/tree/main",
    );
    await flushPromises();
    wrapper.unmount();
  });

  it("loads the root tree for the card after a populated folder listing", async () => {
    const wrapper = mountViewer("files", { currentPath: "nested" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("data.csv"));
    await wrapper.setProps({ tab: "card", currentPath: "" });
    await vi.waitFor(() =>
      expect(
        seen.filter((request) => request.what === "tree" && request.path === ""),
      ).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(wrapper.find("article").text()).toContain("Big repo main"),
    );
    wrapper.unmount();
  });

  it("does not let a previous branch's delayed README overwrite the current branch", async () => {
    const oldGate = deferred();
    gates.set("readme:old", oldGate);
    const wrapper = mountViewer("card", { branch: "old" });
    await vi.waitFor(() =>
      expect(seen).toContainEqual({ what: "readme", branch: "old" }),
    );
    await wrapper.setProps({ branch: "new" });
    await vi.waitFor(() =>
      expect(wrapper.find("article").text()).toContain("Big repo new"),
    );
    oldGate.resolve();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get("article").text()).toContain("Big repo new");
    expect(wrapper.get("article").text()).not.toContain("Big repo old");
    wrapper.unmount();
  });

  it("keeps the root listing after returning from a folder whose tree is still loading", async () => {
    const folderGate = deferred();
    let folderResponseReturned = false;
    server.use(
      http.get(`${BASE}/tree/main/nested`, async () => {
        seen.push({ what: "pending-folder-tree" });
        await folderGate.promise;
        folderResponseReturned = true;
        return jsonResponse([
          { type: "file", path: "nested/data.csv", size: 9, oid: "f" },
        ]);
      }),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() => expect(wrapper.text()).toContain("README.md"));
    await wrapper.setProps({ currentPath: "nested" });
    await vi.waitFor(() =>
      expect(seen).toContainEqual({ what: "pending-folder-tree" }),
    );
    await wrapper.setProps({ currentPath: "" });
    await vi.waitFor(() => {
      expect(
        seen.filter(
          (request) => request.what === "tree" && request.path === "",
        ),
      ).toHaveLength(2);
      expect(wrapper.text()).toContain("README.md");
    });

    folderGate.resolve();
    await vi.waitFor(() => expect(folderResponseReturned).toBe(true));
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("README.md");
    expect(wrapper.text()).not.toContain("data.csv");
    wrapper.unmount();
  });

  it("does not let a previous branch's delayed tree overwrite the current branch", async () => {
    const oldGate = deferred();
    let oldResponseReturned = false;
    server.use(
      http.get(`${BASE}/tree/:branch`, async ({ params }) => {
        seen.push({ what: "branch-tree", branch: params.branch });
        if (params.branch === "old") {
          await oldGate.promise;
          oldResponseReturned = true;
        }
        return jsonResponse([
          {
            type: "file",
            path: `${params.branch}.csv`,
            size: 9,
            oid: String(params.branch),
          },
        ]);
      }),
    );
    const wrapper = mountViewer("files", { branch: "old" });
    await vi.waitFor(() =>
      expect(seen).toContainEqual({ what: "branch-tree", branch: "old" }),
    );
    await wrapper.setProps({ branch: "new" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("new.csv"));

    oldGate.resolve();
    await vi.waitFor(() => expect(oldResponseReturned).toBe(true));
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("new.csv");
    expect(wrapper.text()).not.toContain("old.csv");
    wrapper.unmount();
  });

  it("does not let a previous branch's delayed commits overwrite the current branch", async () => {
    const oldGate = deferred();
    gates.set("commits:old", oldGate);
    const wrapper = mountViewer("commits", { branch: "old" });
    await vi.waitFor(() =>
      expect(seen).toContainEqual({ what: "commits", branch: "old" }),
    );
    await wrapper.setProps({ branch: "new" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("Commit on new"));
    oldGate.resolve();
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("Commit on new");
    expect(wrapper.text()).not.toContain("Commit on old");
    wrapper.unmount();
  });

  it("does not fetch successful empty trees or commit histories again when revisiting tabs", async () => {
    server.use(
      http.get(`${BASE}/tree/main`, () => {
        seen.push({ what: "empty-tree" });
        return jsonResponse([]);
      }),
      http.get(`${BASE}/commits/main`, () => {
        seen.push({ what: "empty-commits" });
        return jsonResponse({ commits: [], hasMore: false });
      }),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() =>
      expect(
        seen.filter((request) => request.what === "empty-tree"),
      ).toHaveLength(1),
    );
    await flushPromises();
    await wrapper.setProps({ tab: "commits" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("No commits yet"));
    await wrapper.setProps({ tab: "files" });
    await flushPromises();
    await wrapper.setProps({ tab: "commits" });
    await flushPromises();
    expect(
      seen.filter((request) => request.what === "empty-tree"),
    ).toHaveLength(1);
    expect(
      seen.filter((request) => request.what === "empty-commits"),
    ).toHaveLength(1);
    wrapper.unmount();
  });
});
