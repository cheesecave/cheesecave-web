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

const headerTags = (wrapper) =>
  wrapper
    .findAll('[aria-label="Repository header"] [data-el-tag="true"]')
    .map((tag) => tag.text());

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
  expect(history.text()).toMatch(/^History(?:\: \d+ commits?)?$/);
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
        MetadataHeader: false,
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

describe("repository header metadata on a direct route load", () => {
  let requests;
  let readmeGate;
  let failReadme;
  let treeGate;

  const install = (repoType) => {
    const base = `/api/${repoType}s/open-media-lab/big-repo`;
    server.use(
      http.get(base, () =>
        jsonResponse({
          id: "open-media-lab/big-repo",
          tags: [],
          private: false,
        }),
      ),
      http.get("/api/users/open-media-lab/type", () =>
        jsonResponse({ type: "org" }),
      ),
      http.get("/api/site-config", () => jsonResponse({})),
      http.get(`${base}/tree/:branch`, async () => {
        requests.push("tree");
        if (treeGate) await treeGate.promise;
        return jsonResponse([
          { type: "file", path: "data.csv", size: 9, oid: "f" },
        ]);
      }),
      http.get(`${base}/tree/:branch/nested`, () => {
        requests.push("nested-tree");
        return jsonResponse([
          { type: "file", path: "nested/README.md", size: 9, oid: "nested" },
        ]);
      }),
      http.post(`${base}/paths-info/:branch`, async ({ request }) => {
        const form = new URLSearchParams(await request.text());
        const paths = form.getAll("paths");
        if (form.get("expand") === "false" && paths.includes("README.md")) {
          requests.push("readme-probe");
          return jsonResponse([
            { type: "file", path: "README.md", size: 99, oid: "root" },
          ]);
        }
        return jsonResponse([]);
      }),
      http.get(
        `/${repoType}s/open-media-lab/big-repo/resolve/:branch/README.md`,
        async ({ params }) => {
          requests.push(`readme:${params.branch}`);
          if (readmeGate) await readmeGate.promise;
          if (failReadme)
            return new HttpResponse("Unavailable", { status: 503 });
          return new HttpResponse(
            `---\nlicense: cc-by-4.0\nlanguage: en\ntask_categories:\n- token-classification\n---\n# Root ${params.branch}\n`,
          );
        },
      ),
      http.get(
        `/${repoType}s/open-media-lab/big-repo/resolve/:branch/nested/README.md`,
        () => {
          requests.push("nested-readme");
          return new HttpResponse("---\nlicense: mit\n---\n# Nested\n");
        },
      ),
      http.get(`${base}/commits/:branch`, () => {
        requests.push("commits");
        return jsonResponse({
          commits: [
            { id: "abc123", title: "Latest change", author: "alice", date: 1 },
          ],
          hasMore: false,
        });
      }),
      http.get(`${base}/commit-count/:branch`, () =>
        jsonResponse({ count: 1, head: "abc123" }),
      ),
      http.post(`${base}/commits/unavailable-files`, () =>
        jsonResponse({ commits: {} }),
      ),
    );
  };

  beforeEach(() => {
    requests = [];
    readmeGate = null;
    treeGate = null;
    failReadme = false;
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(
    ["model", "dataset"].flatMap((repoType) =>
      ["files", "commits", "blob", "commit"].map((view) => [repoType, view]),
    ),
  )(
    "loads README tags when opening %s %s directly, without a prior Card visit",
    async (repoType, view) => {
      install(repoType);
      const detail = ["blob", "commit"].includes(view);
      const wrapper = mountViewer(detail ? "files" : view, {
        repoType,
        detailView: detail ? view : null,
        detailKey: view,
      });
      try {
        await vi.waitFor(() =>
          expect(headerTags(wrapper)).toContain("CC BY 4.0"),
        );
        expect(headerTags(wrapper)).toContain("English");
        if (repoType === "dataset")
          expect(headerTags(wrapper)).toContain("token-classification");
        expect(
          requests.filter((request) => request === "readme:main"),
        ).toHaveLength(1);
        if (detail) {
          expect(wrapper.get(`[data-detail-probe='${view}']`).text()).toContain(
            "detail content",
          );
          expect(requests).not.toContain("tree");
          expect(requests).not.toContain("commits");
        }
      } finally {
        wrapper.unmount();
      }
    },
  );

  it.each(["model", "dataset"])(
    "uses the root README for a direct %s subfolder load",
    async (repoType) => {
      install(repoType);
      const wrapper = mountViewer("files", { repoType, currentPath: "nested" });
      try {
        await vi.waitFor(() =>
          expect(headerTags(wrapper)).toContain("CC BY 4.0"),
        );
        expect(headerTags(wrapper)).not.toContain("MIT License");
        expect(requests).toContain("nested-tree");
        expect(requests).not.toContain("nested-readme");
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("loads header tags without waiting for a slow file list", async () => {
    install("dataset");
    treeGate = deferred();
    const wrapper = mountViewer("files");
    try {
      await vi.waitFor(() =>
        expect(headerTags(wrapper)).toContain("CC BY 4.0"),
      );
      expect(wrapper.text()).not.toContain("data.csv");
    } finally {
      treeGate.resolve();
      await flushPromises();
      wrapper.unmount();
    }
  });

  it.each(["files", "blob", "commit"])(
    "keeps %s content visible while README is slow and after it fails",
    async (view) => {
      install("dataset");
      readmeGate = deferred();
      failReadme = true;
      const detail = view !== "files";
      const wrapper = mountViewer("files", {
        detailView: detail ? view : null,
        detailKey: view,
      });
      const assertContent = () => {
        if (detail)
          expect(wrapper.get(`[data-detail-probe='${view}']`).text()).toContain(
            "detail content",
          );
        else expect(wrapper.text()).toContain("data.csv");
      };
      try {
        await vi.waitFor(() => expect(requests).toContain("readme:main"));
        await vi.waitFor(assertContent);
        readmeGate.resolve();
        await flushPromises();
        await flushPromises();
        assertContent();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      } finally {
        readmeGate.resolve();
        await flushPromises();
        wrapper.unmount();
      }
    },
  );

  it("keeps the metadata row mounted before README tags arrive and fills the same row", async () => {
    install("dataset");
    readmeGate = deferred();
    const wrapper = mountViewer("files");
    try {
      const metadataRow = wrapper.get(".repository-metadata").element;
      await vi.waitFor(() => expect(requests).toContain("readme:main"));
      expect(headerTags(wrapper)).toEqual([]);
      expect(wrapper.get(".repository-metadata").element).toBe(metadataRow);
      readmeGate.resolve();
      await vi.waitFor(() =>
        expect(headerTags(wrapper)).toContain("CC BY 4.0"),
      );
      expect(wrapper.get(".repository-metadata").element).toBe(metadataRow);
    } finally {
      readmeGate.resolve();
      await flushPromises();
      wrapper.unmount();
    }
  });

  it.each(["failed", "empty"])(
    "retains the metadata row when README metadata is %s",
    async (result) => {
      install("dataset");
      if (result === "failed") failReadme = true;
      else {
        server.use(
          http.get(
            "/datasets/open-media-lab/big-repo/resolve/:branch/README.md",
            () => new HttpResponse("# Repository without metadata\n"),
          ),
        );
      }
      const wrapper = mountViewer("files");
      try {
        const metadataRow = wrapper.get(".repository-metadata").element;
        await vi.waitFor(() => expect(wrapper.vm.readmeLoading).toBe(false));
        expect(headerTags(wrapper)).toEqual([]);
        expect(wrapper.get(".repository-metadata").element).toBe(metadataRow);
        expect(wrapper.text()).toContain("data.csv");
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("shares a pending README across tab, path and detail navigation", async () => {
    install("dataset");
    readmeGate = deferred();
    const wrapper = mountViewer("files");
    try {
      await vi.waitFor(() => expect(requests).toContain("readme:main"));
      await wrapper.setProps({ currentPath: "nested" });
      await wrapper.setProps({ currentPath: "", tab: "commits" });
      await wrapper.setProps({
        tab: "files",
        detailView: "blob",
        detailKey: "blob",
      });
      readmeGate.resolve();
      await vi.waitFor(() =>
        expect(headerTags(wrapper)).toContain("CC BY 4.0"),
      );
      await wrapper.setProps({ detailView: null, detailKey: "", tab: "card" });
      await vi.waitFor(() =>
        expect(wrapper.find("article").text()).toContain("Root main"),
      );
      expect(
        requests.filter((request) => request === "readme:main"),
      ).toHaveLength(1);
      expect(
        requests.filter((request) => request === "readme-probe"),
      ).toHaveLength(1);
    } finally {
      readmeGate.resolve();
      await flushPromises();
      wrapper.unmount();
    }
  });

  it("does not fetch README for a Space Files page", async () => {
    install("space");
    const wrapper = mountViewer("files", { repoType: "space" });
    try {
      await vi.waitFor(() => expect(wrapper.text()).toContain("data.csv"));
      expect(requests).not.toContain("readme-probe");
      expect(requests).not.toContain("readme:main");
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["files", "blob"])(
    "ignores stale branch tags while opening %s on another branch",
    async (view) => {
      install("dataset");
      const oldGate = deferred();
      server.use(
        http.get(
          "/datasets/open-media-lab/big-repo/resolve/:branch/README.md",
          async ({ params }) => {
            requests.push(`readme:${params.branch}`);
            if (params.branch === "old") await oldGate.promise;
            const license = params.branch === "old" ? "cc-by-4.0" : "mit";
            return new HttpResponse(
              `---\nlicense: ${license}\n---\n# ${params.branch}\n`,
            );
          },
        ),
      );
      const wrapper = mountViewer("files", {
        branch: "old",
        detailView: view === "blob" ? "blob" : null,
        detailKey: view,
      });
      try {
        await vi.waitFor(() => expect(requests).toContain("readme:old"));
        await wrapper.setProps({ branch: "new" });
        await vi.waitFor(() =>
          expect(headerTags(wrapper)).toContain("MIT License"),
        );
        oldGate.resolve();
        await flushPromises();
        await flushPromises();
        expect(headerTags(wrapper)).toContain("MIT License");
        expect(headerTags(wrapper)).not.toContain("CC BY 4.0");
        expect(
          requests.filter((request) => request === "readme:new"),
        ).toHaveLength(1);
      } finally {
        oldGate.resolve();
        await flushPromises();
        wrapper.unmount();
      }
    },
  );

  it("keeps Files usable after a README probe fails and retries the error on Card", async () => {
    install("dataset");
    let failProbe = true;
    server.use(
      http.post(`${BASE}/paths-info/:branch`, async ({ request }) => {
        const form = new URLSearchParams(await request.text());
        if (
          form.get("expand") !== "false" ||
          !form.getAll("paths").includes("README.md")
        )
          return jsonResponse([]);
        requests.push("readme-probe");
        if (failProbe) return new HttpResponse("Unavailable", { status: 503 });
        return jsonResponse([
          { type: "file", path: "README.md", size: 99, oid: "root" },
        ]);
      }),
    );
    const wrapper = mountViewer("files");
    try {
      await vi.waitFor(() => expect(wrapper.text()).toContain("data.csv"));
      await vi.waitFor(() => expect(requests).toContain("readme-probe"));
      await wrapper.setProps({ tab: "card" });
      await vi.waitFor(() =>
        expect(wrapper.find('[role="alert"]').exists()).toBe(true),
      );
      expect(wrapper.text()).not.toContain("No README.md found");
      failProbe = false;
      const retry = wrapper
        .findAll("button")
        .find((button) => /retry/i.test(button.text()));
      expect(retry).toBeDefined();
      await retry.trigger("click");
      await vi.waitFor(() =>
        expect(headerTags(wrapper)).toContain("CC BY 4.0"),
      );
      expect(wrapper.find("article").text()).toContain("Root main");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(
        requests.filter((request) => request === "readme-probe"),
      ).toHaveLength(2);
    } finally {
      wrapper.unmount();
    }
  });
});

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
      http.post(`${BASE}/paths-info/:branch`, async ({ request }) => {
        const form = new URLSearchParams(await request.text());
        return jsonResponse(
          form.get("expand") === "false" &&
            form.getAll("paths").includes("README.md")
            ? [{ type: "file", path: "README.md", size: 9, oid: "r" }]
            : [],
        );
      }),
      http.get(`${BASE}/commit-count/:branch`, ({ params }) =>
        jsonResponse({ count: 3, head: `commit-${params.branch}` }),
      ),
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
        "usedStorage",
      ]),
    );
    expect(info.expand).not.toContain("siblings");
  });

  it("starts the file list without waiting for repo info", async () => {
    infoGate = deferred();
    const wrapper = mountViewer("files");
    await flushPromises();

    expect(seen.filter((s) => s.what === "info")).toHaveLength(1);
    expect(seen.filter((s) => s.what === "tree")).toHaveLength(1);
    const header = wrapper.get('[aria-label="Repository header"]');
    expect(header.get("h1").text().replace(/\s+/g, "")).toBe(
      "Dataset:open-media-lab/big-repo",
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
    "renders %s %s details independently of header data without loading Files or history",
    async (repoType, detailView) => {
      const gate = deferred();
      let infoRequests = 0;
      const tabRequests = vi.fn(() => jsonResponse([]));
      const readmeRequests = vi.fn(
        () => new HttpResponse("---\nlicense: cc-by-4.0\n---\n# Repo\n"),
      );
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
        http.get(`${base}/commit-count/:branch`, tabRequests),
        http.post(`${base}/paths-info/:branch`, () =>
          jsonResponse([
            { type: "file", path: "README.md", size: 9, oid: "r" },
          ]),
        ),
        http.get(
          `/${repoType}s/open-media-lab/big-repo/resolve/:branch/README.md`,
          readmeRequests,
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
      await vi.waitFor(() =>
        expect(
          wrapper.get('[aria-label="Repository header"]').text(),
        ).toContain("CC BY 4.0"),
      );
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
      expect(readmeRequests).toHaveBeenCalledTimes(1);
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
        http.get(`${base}/commit-count/:branch`, unused),
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
        http.get(
          `/api/${repoType}s/open-media-lab/big-repo/commit-count/main`,
          () => jsonResponse({ count: 0, head: null }),
        ),
        http.post(
          `/api/${repoType}s/open-media-lab/big-repo/paths-info/main`,
          () => jsonResponse([]),
        ),
      );
      const wrapper = mountViewer("files", { repoType });
      await vi.waitFor(() =>
        expect(
          wrapper
            .get(".repo-composite-header h1 .repository-owner")
            .attributes("href"),
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
        ).toBe(
          `${repoType === "model" ? "Model" : "Dataset"}:open-media-lab/big-repo`,
        );
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
      http.get(
        "/api/spaces/open-media-lab/big-repo/commit-count/:branch",
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
    expect(wrapper.get('[data-testid="file-list-count"]').text()).toBe(
      "0 files",
    );
    expect(wrapper.find('[data-testid="repository-size"]').exists()).toBe(
      false,
    );
    expect(wrapper.find(".repository-history-link").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps files and the latest summary available while the independent commit count is pending", async () => {
    const gate = deferred();
    let requests = 0;
    server.use(
      http.get(`${BASE}/commit-count/main`, async () => {
        requests += 1;
        await gate.promise;
        return jsonResponse({ count: 37, head: "commit-main" });
      }),
    );
    const wrapper = mountViewer("files");
    try {
      await vi.waitFor(() => expect(requests).toBe(1));
      await vi.waitFor(() =>
        expect(
          wrapper.get('section[aria-label="Latest commit"]').text(),
        ).toContain("Commit on main"),
      );
      expect(
        wrapper
          .find(
            "a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']",
          )
          .exists(),
      ).toBe(true);
      expect(wrapper.get("a.repository-history-link").text()).toBe("History");
      expect(wrapper.get("a.repository-history-link").attributes("href")).toBe(
        "/datasets/open-media-lab/big-repo/commits/main",
      );
      gate.resolve();
      await vi.waitFor(() =>
        expect(wrapper.get("a.repository-history-link").text()).toBe(
          "History: 37 commits",
        ),
      );
      expect(seen.filter((request) => request.what === "tree")).toHaveLength(1);
      expect(
        seen.filter((request) => request.what === "latest-commit"),
      ).toHaveLength(1);
    } finally {
      gate.resolve();
      wrapper.unmount();
    }
  });

  it("retries only a failed commit count while keeping History, the latest summary and files usable", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/commit-count/main`, () => {
        attempts += 1;
        return attempts === 1
          ? new HttpResponse("Count temporarily unavailable", { status: 503 })
          : jsonResponse({ count: 18, head: "commit-main" });
      }),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() =>
      expect(
        wrapper.find('button[aria-label="Retry commit count"]').exists(),
      ).toBe(true),
    );
    await vi.waitFor(() =>
      expect(
        wrapper.get('section[aria-label="Latest commit"]').text(),
      ).toContain("Commit on main"),
    );
    expect(
      wrapper
        .find("a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']")
        .exists(),
    ).toBe(true);
    expect(wrapper.get("a.repository-history-link").text()).toBe("History");
    const retry = wrapper.get('button[aria-label="Retry commit count"]');
    expect(retry.attributes("title")).toBeTruthy();
    await retry.trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.get("a.repository-history-link").text()).toBe(
        "History: 18 commits",
      ),
    );
    expect(attempts).toBe(2);
    expect(
      wrapper.find('button[aria-label="Retry commit count"]').exists(),
    ).toBe(false);
    expect(seen.filter((request) => request.what === "tree")).toHaveLength(1);
    expect(
      seen.filter((request) => request.what === "latest-commit"),
    ).toHaveLength(1);
    wrapper.unmount();
  });

  it("clears the displayed commit count immediately when switching to a pending branch", async () => {
    const gate = deferred();
    server.use(
      http.get(`${BASE}/commit-count/dev`, async () => {
        await gate.promise;
        return jsonResponse({ count: 8, head: "commit-dev" });
      }),
    );
    const wrapper = mountViewer("files");
    try {
      await vi.waitFor(() =>
        expect(wrapper.get("a.repository-history-link").text()).toBe(
          "History: 3 commits",
        ),
      );
      await wrapper.setProps({ branch: "dev" });
      expect(wrapper.get("a.repository-history-link").text()).toBe("History");
      expect(wrapper.get("a.repository-history-link").attributes("href")).toBe(
        "/datasets/open-media-lab/big-repo/commits/dev",
      );
      gate.resolve();
      await vi.waitFor(() =>
        expect(wrapper.get("a.repository-history-link").text()).toBe(
          "History: 8 commits",
        ),
      );
    } finally {
      gate.resolve();
      wrapper.unmount();
    }
  });

  it.each([200, 503])(
    "ignores an old branch's late commit count response (%s)",
    async (status) => {
      const gate = deferred();
      const requested = [];
      server.use(
        http.get(`${BASE}/commit-count/:branch`, async ({ params }) => {
          requested.push(params.branch);
          if (params.branch === "main") {
            await gate.promise;
            return status === 200
              ? jsonResponse({ count: 99, head: "old-main" })
              : new HttpResponse("Old branch unavailable", { status });
          }
          return jsonResponse({ count: 8, head: "commit-dev" });
        }),
      );
      const wrapper = mountViewer("files");
      try {
        await vi.waitFor(() => expect(requested).toEqual(["main"]));
        await wrapper.setProps({ branch: "dev" });
        await vi.waitFor(() =>
          expect(wrapper.get("a.repository-history-link").text()).toBe(
            "History: 8 commits",
          ),
        );
        gate.resolve();
        await flushPromises();
        await flushPromises();
        expect(wrapper.get("a.repository-history-link").text()).toBe(
          "History: 8 commits",
        );
        expect(
          wrapper.find('button[aria-label="Retry commit count"]').exists(),
        ).toBe(false);
        expect(requested).toEqual(["main", "dev"]);
      } finally {
        gate.resolve();
        wrapper.unmount();
      }
    },
  );

  it("shows an empty repository's confirmed zero commits instead of treating it as unavailable", async () => {
    server.use(
      http.get(`${BASE}/commit-count/main`, () =>
        jsonResponse({ count: 0, head: null }),
      ),
      http.get(`${BASE}/commits/main`, () =>
        jsonResponse({ commits: [], hasMore: false }),
      ),
      http.get(`${BASE}/tree/main`, () => jsonResponse([])),
    );
    const wrapper = mountViewer("files");
    await vi.waitFor(() =>
      expect(wrapper.get("a.repository-history-link").text()).toBe(
        "History: 0 commits",
      ),
    );
    await vi.waitFor(() =>
      expect(
        wrapper.get('section[aria-label="Latest commit"]').text(),
      ).toContain("No commits yet"),
    );
    expect(
      wrapper.find('button[aria-label="Retry commit count"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it.each([null, -1, 1.5, "3"])(
    "does not present an invalid commit count (%j) as a real total",
    async (count) => {
      server.use(
        http.get(`${BASE}/commit-count/main`, () =>
          jsonResponse({ count, head: "commit-main" }),
        ),
      );
      const wrapper = mountViewer("files");
      await vi.waitFor(() =>
        expect(
          wrapper.find('button[aria-label="Retry commit count"]').exists(),
        ).toBe(true),
      );
      expect(wrapper.get("a.repository-history-link").text()).toBe("History");
      expect(
        wrapper
          .find(
            "a[href='/datasets/open-media-lab/big-repo/blob/main/README.md']",
          )
          .exists(),
      ).toBe(true);
      wrapper.unmount();
    },
  );

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
