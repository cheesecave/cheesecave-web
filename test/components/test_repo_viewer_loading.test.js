import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from "vue";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";
import { repoAPI } from "@/utils/api";

const detailLifecycle = vi.hoisted(() => ({
  mounted: vi.fn(),
  unmounted: vi.fn(),
}));

vi.mock("vue-router/auto", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock(
  "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue",
  () => ({
    __esModule: true,
    default: defineComponent({
      props: { embedded: Boolean },
      setup(props) {
        onMounted(detailLifecycle.mounted);
        onUnmounted(detailLifecycle.unmounted);
        return () =>
          h(
            "article",
            {
              "data-detail-probe": "blob",
              "data-embedded": String(props.embedded),
            },
            "File detail content",
          );
      },
    }),
  }),
);
vi.mock("@/pages/[type]s/[namespace]/[name]/commit/[commit_id].vue", () => ({
  __esModule: true,
  default: defineComponent({
    props: { embedded: Boolean },
    setup: (props) => () =>
      h(
        "article",
        {
          "data-detail-probe": "commit",
          "data-embedded": String(props.embedded),
        },
        "Commit detail content",
      ),
  }),
}));

import RepoViewer from "@/components/repo/RepoViewer.vue";

const BASE = "/api/datasets/open-media-lab/big-repo";

function deferred() {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
}

function expectHistoryAboveSummary(wrapper, branch) {
  const history = wrapper.get(
    `a[href='/datasets/open-media-lab/big-repo/commits/${branch}']`,
  );
  const summary = wrapper.get('section[aria-label="Latest commit"]');
  expect(history.text()).toBe("History");
  expect(summary.element.contains(history.element)).toBe(false);
  expect(
    history.element.compareDocumentPosition(summary.element) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
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

function mountCachedDetail(visible, branch = ref("main")) {
  return mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, null, () =>
          visible.value
            ? h(RepoViewer, {
                repoType: "dataset",
                namespace: "open-media-lab",
                name: "big-repo",
                tab: "files",
                branch: branch.value,
                currentPath: "",
                detailView: "blob",
                detailKey:
                  "/datasets/open-media-lab/big-repo/blob/main/README.md",
              })
            : null,
        ),
    }),
    {
      global: {
        stubs: {
          ...ElementPlusStubs,
          ElTooltip: true,
          RouterLink: RouterLinkStub,
          MetadataHeader: true,
        },
      },
    },
  );
}

// The repository page's file list comes from the paginated tree; the
// whole-repository sibling list in repo info grows with the repository
// (#101), so the page asks only for its own fields.
describe("RepoViewer loading on a big repository", () => {
  const seen = [];
  let infoGate;
  const gates = new Map();

  beforeEach(() => {
    detailLifecycle.mounted.mockClear();
    detailLifecycle.unmounted.mockClear();
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
      http.get(`${BASE}/commits/:branch`, async ({ params, request }) => {
        const latest = new URL(request.url).searchParams.get("limit") === "1";
        seen.push({
          what: latest ? "latest-commit" : "commits",
          branch: params.branch,
        });
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
    const header = wrapper.get('[aria-label="Repository header"]');
    expect(header.get("h1").text().replace(/\s+/g, "")).toBe(
      "open-media-lab/big-repo",
    );
    expect(
      header.get('nav[aria-label="Repository sections"]').findAll("a"),
    ).toHaveLength(3);

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

  it("unmounts cached repository details while away and remounts them under the same header on return", async () => {
    const visible = ref(true);
    const wrapper = mountCachedDetail(visible);
    try {
      await vi.waitFor(() => {
        expect(detailLifecycle.mounted).toHaveBeenCalledTimes(1);
        expect(wrapper.find('[aria-label="Repository actions"]').exists()).toBe(
          true,
        );
      });
      const header = wrapper.get('[aria-label="Repository header"]').element;
      const detail = wrapper.get('[data-detail-probe="blob"]').element;
      visible.value = false;
      await nextTick();
      await vi.waitFor(() =>
        expect(detailLifecycle.unmounted).toHaveBeenCalledTimes(1),
      );
      visible.value = true;
      await nextTick();
      await vi.waitFor(() =>
        expect(detailLifecycle.mounted).toHaveBeenCalledTimes(2),
      );
      expect(wrapper.get('[data-detail-probe="blob"]').element).not.toBe(
        detail,
      );
      expect(wrapper.get('[aria-label="Repository header"]').element).toBe(
        header,
      );
      expect(seen.filter(({ what }) => what === "info")).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  it("restarts pending header metadata only once when a cached repository returns on another branch", async () => {
    infoGate = deferred();
    const visible = ref(true);
    const branch = ref("main");
    const getInfo = vi.spyOn(repoAPI, "getInfo");
    const wrapper = mountCachedDetail(visible, branch);
    try {
      await vi.waitFor(() => expect(getInfo).toHaveBeenCalledTimes(1));
      visible.value = false;
      await nextTick();
      branch.value = "dev";
      visible.value = true;
      await nextTick();
      await flushPromises();
      expect(getInfo).toHaveBeenCalledTimes(2);
    } finally {
      infoGate.resolve();
      await flushPromises();
      wrapper.unmount();
      getInfo.mockRestore();
    }
  });

  it.each([
    ["model", "blob"],
    ["dataset", "commit"],
  ])(
    "renders %s %s details before header metadata without loading Files, README or history",
    async (repoType, detailView) => {
      const gate = deferred();
      let infoRequests = 0;
      const tabRequests = vi.fn(() => jsonResponse([]));
      const base = `/api/${repoType}s/open-media-lab/big-repo`;
      server.use(
        http.get(base, async () => {
          infoRequests += 1;
          await gate.promise;
          return jsonResponse({
            id: "open-media-lab/big-repo",
            tags: [],
            private: false,
          });
        }),
        http.get(`${base}/tree/:branch`, tabRequests),
        http.get(`${base}/commits/:branch`, tabRequests),
        http.post(`${base}/paths-info/:branch`, tabRequests),
        http.get(
          `/${repoType}s/open-media-lab/big-repo/resolve/:branch/README.md`,
          tabRequests,
        ),
      );
      const wrapper = mountViewer("files", {
        repoType,
        detailView,
        detailKey: `${detailView}-first`,
        branch: "dev",
      });
      await vi.waitFor(() => {
        expect(infoRequests).toBe(1);
        expect(
          wrapper.find(`[data-detail-probe='${detailView}']`).exists(),
        ).toBe(true);
      });
      expect(
        wrapper
          .get(`[data-detail-probe='${detailView}']`)
          .attributes("data-embedded"),
      ).toBe("true");
      const header = wrapper.get('[aria-label="Repository header"]').element;
      expect(wrapper.get('.repo-tabs a[aria-current="page"]').text()).toBe(
        "Files",
      );
      expect(
        wrapper.get('.repo-tabs a[aria-current="page"]').attributes("href"),
      ).toBe(`/${repoType}s/open-media-lab/big-repo/tree/dev`);
      expect(wrapper.find('[aria-label="Repository actions"]').exists()).toBe(
        false,
      );
      expect(tabRequests).not.toHaveBeenCalled();
      gate.resolve();
      await vi.waitFor(() =>
        expect(wrapper.find('[aria-label="Repository actions"]').exists()).toBe(
          true,
        ),
      );
      const otherDetail = detailView === "blob" ? "commit" : "blob";
      await wrapper.setProps({
        detailView: otherDetail,
        detailKey: `${otherDetail}-second`,
      });
      await vi.waitFor(() =>
        expect(
          wrapper.find(`[data-detail-probe='${otherDetail}']`).exists(),
        ).toBe(true),
      );
      expect(wrapper.get('[aria-label="Repository header"]').element).toBe(
        header,
      );
      expect(infoRequests).toBe(1);
      expect(tabRequests).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it.each(["blob", "commit"])(
    "leaves Space %s details unembedded without fetching wrapper repository data",
    async (detailView) => {
      const unused = vi.fn(() => jsonResponse([]));
      const base = "/api/spaces/open-media-lab/big-repo";
      server.use(
        http.get(base, unused),
        http.get(`${base}/tree/:branch`, unused),
        http.get(`${base}/commits/:branch`, unused),
        http.post(`${base}/paths-info/:branch`, unused),
        http.get(
          "/spaces/open-media-lab/big-repo/resolve/:branch/README.md",
          unused,
        ),
      );
      const wrapper = mountViewer("files", {
        repoType: "space",
        detailView,
        detailKey: detailView,
      });
      await vi.waitFor(() =>
        expect(
          wrapper.find(`[data-detail-probe='${detailView}']`).exists(),
        ).toBe(true),
      );
      await flushPromises();
      expect(
        wrapper
          .get(`[data-detail-probe='${detailView}']`)
          .attributes("data-embedded"),
      ).toBe("false");
      expect(wrapper.find('[aria-label="Repository header"]').exists()).toBe(
        false,
      );
      expect(wrapper.find(".repo-tabs").exists()).toBe(false);
      expect(unused).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it("keeps the repository header, sidebar and tab links mounted while tab data loads", async () => {
    const wrapper = mountViewer("card");
    await vi.waitFor(() =>
      expect(wrapper.find("article").text()).toContain("Big repo main"),
    );
    const heading = wrapper.get("h1").element;
    const sidebar = wrapper.get("aside").element;
    const tabs = wrapper.findAll(".repo-tabs a").map((link) => link.element);
    expect(tabs).toHaveLength(3);
    const gate = deferred();
    gates.set("commits:main", gate);

    for (const tab of ["files", "commits", "metadata", "card"]) {
      await wrapper.setProps({ tab });
      await flushPromises();
      expect(wrapper.get("h1").element).toBe(heading);
      expect(wrapper.get("aside").element).toBe(sidebar);
      for (const link of tabs)
        expect(wrapper.element.contains(link)).toBe(true);
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
        expect(
          wrapper.get(".repo-composite-header h1 a").attributes("href"),
        ).toBe(ownerHref),
      );
      const header = wrapper.get(".repo-composite-header").element;
      for (const tab of ["files", "commits", "metadata", "card"]) {
        await wrapper.setProps({ tab });
        expect(wrapper.find(".repo-breadcrumb").exists()).toBe(false);
        expect(wrapper.get(".repo-composite-header").element).toBe(header);
        expect(wrapper.find(".card.repo-header").exists()).toBe(false);
        expect(
          wrapper.get(".repo-composite-header h1").text().replace(/\s+/g, ""),
        ).toBe("open-media-lab/big-repo");
        expect(
          wrapper
            .get(".repo-composite-header h1")
            .text()
            .match(/big-repo/g),
        ).toHaveLength(1);
        expect(
          wrapper
            .get(`h1 a[href='/${repoType}s/open-media-lab/big-repo']`)
            .text(),
        ).toBe("big-repo");
        expect(wrapper.findAll("h1")).toHaveLength(1);
        expect(
          wrapper.find('button[aria-label="Copy repository ID"]').exists(),
        ).toBe(true);
      }
      await flushPromises();
      wrapper.unmount();
    },
  );

  it("retains the separate repository card and tabs for Spaces", async () => {
    const spaceCommits = vi.fn(() => jsonResponse([]));
    server.use(
      http.get("/api/spaces/open-media-lab/big-repo", () =>
        jsonResponse({
          id: "open-media-lab/big-repo",
          sdk: "gradio",
          tags: [],
        }),
      ),
      http.get("/api/spaces/open-media-lab/big-repo/tree/main", () =>
        jsonResponse([]),
      ),
      http.post("/api/spaces/open-media-lab/big-repo/paths-info/main", () =>
        jsonResponse([]),
      ),
      http.get(
        "/api/spaces/open-media-lab/big-repo/commits/:branch",
        spaceCommits,
      ),
    );
    const wrapper = mountViewer("files", { repoType: "space" });
    await flushPromises();
    expect(wrapper.find(".repo-composite-header").exists()).toBe(false);
    expect(wrapper.get(".card.repo-header h1").text()).toContain("big-repo");
    expect(wrapper.findAll(".repo-tabs a")).toHaveLength(4);
    expect(wrapper.get(".card.repo-header").find(".repo-tabs").exists()).toBe(
      false,
    );
    expect(wrapper.find('section[aria-label="Latest commit"]').exists()).toBe(
      false,
    );
    expect(spaceCommits).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps files and the History link available while the latest commit is pending", async () => {
    const gate = deferred();
    let requested = false;
    server.use(
      http.get(`${BASE}/commits/:branch`, async () => {
        requested = true;
        await gate.promise;
        return jsonResponse({
          commits: [
            {
              id: "ready123",
              title: "Summary ready",
              author: "alice",
              date: 1,
            },
          ],
          hasMore: false,
        });
      }),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() => expect(requested).toBe(true));
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(
            "a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']",
          )
          .exists(),
      ).toBe(true),
    );
    const summary = wrapper.get('section[aria-label="Latest commit"]');
    expect(summary.find('[role="status"]').exists()).toBe(true);
    expectHistoryAboveSummary(wrapper, "main");
    gate.resolve();
    await vi.waitFor(() => expect(summary.text()).toContain("Summary ready"));
    expect(
      wrapper
        .find("a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']")
        .exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it("retries a failed latest-commit summary locally without hiding or reloading the files", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/commits/:branch`, () => {
        attempts += 1;
        return attempts === 1
          ? new HttpResponse("Summary temporarily unavailable", { status: 503 })
          : jsonResponse({
              commits: [
                {
                  id: "retry123",
                  title: "Recovered summary",
                  author: "alice",
                  date: 1,
                },
              ],
              hasMore: false,
            });
      }),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() =>
      expect(
        wrapper
          .find('section[aria-label="Latest commit"] [role="alert"]')
          .exists(),
      ).toBe(true),
    );
    const summary = wrapper.get('section[aria-label="Latest commit"]');
    expectHistoryAboveSummary(wrapper, "main");
    expect(
      wrapper
        .find("a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']")
        .exists(),
    ).toBe(true);
    await summary.get('[data-testid="error-action-retry"]').trigger("click");
    await vi.waitFor(() =>
      expect(summary.text()).toContain("Recovered summary"),
    );
    expect(summary.find('[role="alert"]').exists()).toBe(false);
    expect(attempts).toBe(2);
    expect(seen.filter(({ what }) => what === "tree")).toHaveLength(1);
    wrapper.unmount();
  });

  it.each([200, 503])(
    "ignores a previous branch's delayed latest-commit response (%s)",
    async (oldStatus) => {
      const oldGate = deferred();
      const requested = [];
      let oldReturned = false;
      server.use(
        http.get(`${BASE}/commits/:branch`, async ({ params }) => {
          requested.push(params.branch);
          if (params.branch === "old") {
            await oldGate.promise;
            oldReturned = true;
            if (oldStatus !== 200)
              return new HttpResponse("Old branch unavailable", {
                status: oldStatus,
              });
          }
          return jsonResponse({
            commits: [
              {
                id: `${params.branch}1234`,
                title: `Latest on ${params.branch}`,
                author: "alice",
                date: 1,
              },
            ],
            hasMore: false,
          });
        }),
      );
      const wrapper = mountViewer("files", { branch: "old" });
      await vi.waitFor(() => expect(requested).toEqual(["old"]));
      await wrapper.setProps({ branch: "new" });
      await vi.waitFor(() =>
        expect(
          wrapper.find('section[aria-label="Latest commit"]').text(),
        ).toContain("Latest on new"),
      );
      const summary = wrapper.get('section[aria-label="Latest commit"]');
      expectHistoryAboveSummary(wrapper, "new");
      oldGate.resolve();
      await vi.waitFor(() => expect(oldReturned).toBe(true));
      await flushPromises();
      await flushPromises();
      expect(summary.text()).toContain("Latest on new");
      expect(summary.text()).not.toContain("Latest on old");
      expect(summary.find('[role="alert"]').exists()).toBe(false);
      expect(requested).toEqual(["old", "new"]);
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
        seen.filter(
          (request) => request.what === "tree" && request.path === "",
        ),
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
      http.get(`${BASE}/commits/main`, ({ request }) => {
        const latest = new URL(request.url).searchParams.get("limit") === "1";
        seen.push({ what: latest ? "empty-latest-commit" : "empty-commits" });
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
    await vi.waitFor(() =>
      expect(
        wrapper.find('section[aria-label="Latest commit"]').text(),
      ).toContain("No commits yet"),
    );
    expectHistoryAboveSummary(wrapper, "main");
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
