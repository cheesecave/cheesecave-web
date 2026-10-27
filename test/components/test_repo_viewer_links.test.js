import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { ElMessage } from "element-plus";

import { http } from "@/testing/msw";
import { useAuthStore } from "@/stores/auth";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn() },
  copy: vi.fn(),
}));
vi.mock("vue-router/auto", () => ({ useRouter: () => mocks.router }));
vi.mock("@/utils/clipboard", () => ({ copyToClipboard: mocks.copy }));

import RepoViewer from "@/components/repo/RepoViewer.vue";

const BASE = "/api/datasets/open-media-lab/big-repo";
const PAGE = "/datasets/open-media-lab/big-repo";

function commit(id, title, author) {
  return {
    id,
    title,
    message: title,
    date: "2026-04-21T10:00:00.000000Z",
    authors: [{ user: author }],
  };
}

function installHandlers(extraInfo = {}, repoType = "dataset") {
  const base = `/api/${repoType}s/open-media-lab/big-repo`;
  const commitRequests = [];
  server.use(
    http.get("/api/users/open-media-lab/type", () =>
      jsonResponse({ type: "org" }),
    ),
    http.get(base, () => {
      const { siblings, ...info } = cloneFixture(uiApiFixtures.repo.info);
      return jsonResponse({
        ...info,
        id: "open-media-lab/big-repo",
        ...extraInfo,
      });
    }),
    http.get(`${base}/tree/:branch`, () => jsonResponse([])),
    http.post(`${base}/paths-info/:branch`, () => jsonResponse([])),
    http.get(`${base}/commits/:branch`, ({ request, params }) => {
      commitRequests.push({
        branch: params.branch,
        limit: new URL(request.url).searchParams.get("limit"),
      });
      return jsonResponse([
        commit("c1", "First change", "alice"),
        commit("c2", "Second change", "bob"),
      ]);
    }),
    http.get("/api/site-config", () =>
      jsonResponse({ capabilities: { repository_operations: {} } }),
    ),
    http.post(`${base}/commits/unavailable-files`, () =>
      jsonResponse({ commits: {} }),
    ),
    http.post(`${base}/commits/:branch/operations`, () =>
      jsonResponse({ can_write: false, commits: {} }),
    ),
  );
  return commitRequests;
}

function mountViewer(tab = "card", props = {}) {
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

async function ready(wrapper) {
  await vi.waitFor(() =>
    expect(wrapper.find('[aria-label="Repository actions"]').exists()).toBe(
      true,
    ),
  );
  await flushPromises();
}

function expectHistoryAboveSummary(wrapper, history) {
  const summary = wrapper.get('section[aria-label="Latest commit"]');
  expect(history).toBeDefined();
  expect(history.text()).toBe("History");
  expect(summary.element.contains(history.element)).toBe(false);
  expect(
    history.element.compareDocumentPosition(summary.element) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe("RepoViewer real links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.copy.mockResolvedValue(true);
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
    installHandlers();
  });

  it("makes the card, Files and Metadata tabs links to their own URLs", async () => {
    const wrapper = mountViewer();
    await ready(wrapper);
    const tabs = wrapper
      .get('nav[aria-label="Repository sections"]')
      .findAll("a");
    expect(tabs.map((tab) => tab.text())).toEqual([
      "Dataset Card",
      "Files",
      "Metadata",
    ]);
    expect(tabs.map((tab) => tab.attributes("href"))).toEqual([
      PAGE,
      `${PAGE}/tree/main`,
      `${PAGE}?tab=metadata`,
    ]);
    expect(wrapper.find(".repo-tabs button").exists()).toBe(false);
  });

  it.each([
    ["card", "Dataset Card"],
    ["files", "Files"],
    ["commits", "Files"],
    ["metadata", "Metadata"],
  ])("marks only the open tab (%s) as current", async (tab, label) => {
    const wrapper = mountViewer(tab);
    await ready(wrapper);
    const current = wrapper
      .findAll(".repo-tabs a")
      .filter((link) => link.attributes("aria-current") === "page");
    expect(current.map((link) => link.text())).toEqual([label]);
  });

  it("keeps unavailable external history in Files rather than a top-level tab", async () => {
    const commitRequests = installHandlers({ _source: "huggingface" });
    const wrapper = mountViewer("files");
    await ready(wrapper);
    const history = wrapper
      .findAll('[aria-disabled="true"]')
      .find((item) => item.text() === "History");
    expectHistoryAboveSummary(wrapper, history);
    expect(history.element.tagName).not.toBe("A");
    expect(wrapper.get(".repo-tabs").text()).not.toContain("Commits");
    expect(wrapper.findAll(".repo-tabs a").map((tab) => tab.text())).toEqual([
      "Dataset Card",
      "Files",
      "Metadata",
    ]);
    expect(commitRequests).toEqual([]);
  });

  it.each([
    [
      "model",
      "huggingface",
      "https://huggingface.co",
      "https://huggingface.co/open-media-lab/big-repo",
    ],
    [
      "dataset",
      "huggingface",
      "https://huggingface.co",
      "https://huggingface.co/datasets/open-media-lab/big-repo",
    ],
    [
      "model",
      "partner-hub",
      "https://hub.example.test",
      "https://hub.example.test/models/open-media-lab/big-repo",
    ],
    [
      "dataset",
      "partner-hub",
      "https://hub.example.test",
      "https://hub.example.test/datasets/open-media-lab/big-repo",
    ],
  ])(
    "links a %s from %s to its repository on that source",
    async (repoType, source, sourceUrl, expectedUrl) => {
      const commitRequests = installHandlers(
        { _source: source, _source_url: sourceUrl },
        repoType,
      );
      const wrapper = mountViewer("files", { repoType });
      await ready(wrapper);
      const link = wrapper.get(
        '[aria-label="Repository header"] a.repository-source',
      );
      expect(link.text()).toBe(`View on ${source}`);
      expect(link.attributes("href")).toBe(expectedUrl);
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel").split(/\s+/)).toEqual(
        expect.arrayContaining(["noopener", "noreferrer"]),
      );
      const history = wrapper.get(`a[href='${expectedUrl}/commits/main']`);
      expectHistoryAboveSummary(wrapper, history);
      expect(history.attributes("href")).toBe(`${expectedUrl}/commits/main`);
      expect(history.attributes("target")).toBe("_blank");
      expect(commitRequests).toEqual([]);
      wrapper.unmount();
    },
  );

  it.each([
    ["model", 1776765600],
    ["dataset", "2026-04-21T10:00:00.000000Z"],
  ])(
    "links the latest %s commit title, author and SHA while keeping the date plain text",
    async (repoType, date) => {
      const commitRequests = [];
      const operations = vi.fn(() => jsonResponse({}));
      installHandlers({}, repoType);
      const base = `/api/${repoType}s/open-media-lab/big-repo`;
      const page = `/${repoType}s/open-media-lab/big-repo`;
      const commitId = "abcdef1234567890";
      server.use(
        http.get(`${base}/commits/:branch`, ({ request, params }) => {
          commitRequests.push({
            branch: params.branch,
            limit: new URL(request.url).searchParams.get("limit"),
          });
          return jsonResponse([
            { ...commit(commitId, "Improve metadata", "alice"), date },
          ]);
        }),
        http.post(`${base}/commits/unavailable-files`, operations),
        http.post(`${base}/commits/:branch/operations`, operations),
      );
      const wrapper = mountViewer("files", { repoType, branch: "dev" });
      await vi.waitFor(() =>
        expect(
          wrapper.find('section[aria-label="Latest commit"]').text(),
        ).toContain("Improve metadata"),
      );
      const summary = wrapper.get('section[aria-label="Latest commit"]');
      expect(summary.get('a[href="/alice"]').text()).toBe("alice");
      const detailLinks = summary.findAll(
        `a[href='${page}/commit/${commitId}?branch=dev']`,
      );
      expect(detailLinks).toHaveLength(2);
      expect(detailLinks.map((link) => link.text())).toEqual(
        expect.arrayContaining(["Improve metadata", "abcdef1"]),
      );
      const dateText = summary.get(".latest-commit-date");
      expect(dateText.text()).toMatch(/ago$/);
      expect(dateText.element.closest("a")).toBeNull();
      const history = wrapper.get(`a[href='${page}/commits/dev']`);
      expectHistoryAboveSummary(wrapper, history);
      expect(commitRequests).toEqual([{ branch: "dev", limit: "1" }]);
      expect(operations).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it("still moves to a tab from code, for the metadata header's own link", async () => {
    const wrapper = mountViewer("card");
    await ready(wrapper);
    for (const [tab, target] of [
      ["metadata", `${PAGE}?tab=metadata`],
      ["files", `${PAGE}/tree/main`],
      ["commits", `${PAGE}/commits/main`],
      ["card", PAGE],
    ]) {
      mocks.router.push.mockClear();
      wrapper.vm.navigateToTab(tab);
      expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(target);
    }
  });

  it("links Settings and Upload Files for someone who can write, and for nobody else", async () => {
    const anonymous = mountViewer("files");
    await ready(anonymous);
    expect(anonymous.text()).not.toContain("Settings");
    expect(anonymous.text()).not.toContain("Upload Files");

    const auth = useAuthStore();
    auth.user = { username: "open-media-lab", id: 1 };
    const owner = mountViewer("files");
    await ready(owner);
    const link = (text) =>
      owner.findAll("a").find((item) => item.text() === text);
    expect(link("Settings").attributes("href")).toBe(`${PAGE}/settings`);
    expect(link("Upload Files").attributes("href")).toBe(`${PAGE}/upload/main`);
    expect(owner.findAll("button").map((b) => b.text())).not.toEqual(
      expect.arrayContaining(["Settings", "Upload Files"]),
    );
  });

  it("keeps branch-aware section and upload links after changing branches", async () => {
    useAuthStore().user = { username: "open-media-lab", id: 1 };
    const wrapper = mountViewer("files");
    await ready(wrapper);
    await wrapper.setProps({ branch: "dev" });
    await flushPromises();
    const tabs = wrapper.get('nav[aria-label="Repository sections"]');
    expect(tabs.get(`a[href='${PAGE}/tree/dev']`).text()).toBe("Files");
    expectHistoryAboveSummary(
      wrapper,
      wrapper.get(`a[href='${PAGE}/commits/dev']`),
    );
    expect(wrapper.get(`a[href='${PAGE}/upload/dev']`).text()).toBe(
      "Upload Files",
    );
    wrapper.unmount();
  });

  it("keeps Files active while viewing history and links back to the current branch", async () => {
    const wrapper = mountViewer("commits", { branch: "dev" });
    await ready(wrapper);
    expect(wrapper.get('.repo-tabs a[aria-current="page"]').text()).toBe(
      "Files",
    );
    const back = wrapper
      .findAll("a")
      .find((link) => link.text() === "Back to Files");
    expect(back).toBeDefined();
    expect(back.attributes("href")).toBe(`${PAGE}/tree/dev`);
    expect(wrapper.findAll('[data-testid="repo-commit-row"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it("updates real like state and counts through the header without refetching on tab changes", async () => {
    useAuthStore().user = { username: "alice", id: 1 };
    const requests = [];
    let infoCount = 0;
    server.use(
      http.get(BASE, () => {
        infoCount += 1;
        return jsonResponse({
          id: "open-media-lab/big-repo",
          likes: 4,
          tags: [],
        });
      }),
      http.get(`${BASE}/like`, () => {
        requests.push("GET");
        return jsonResponse({ liked: false });
      }),
      http.post(`${BASE}/like`, () => {
        requests.push("POST");
        return jsonResponse({ success: true, likes_count: 5 });
      }),
      http.delete(`${BASE}/like`, () => {
        requests.push("DELETE");
        return jsonResponse({ success: true, likes_count: 4 });
      }),
    );
    const wrapper = mountViewer("card");
    await ready(wrapper);
    const header = wrapper.get('[aria-label="Repository header"]');
    const like = header.get('button[aria-label="Like repository"]');
    expect(like.attributes("aria-pressed")).toBe("false");
    expect(like.text()).toContain("4");
    await like.trigger("click");
    await vi.waitFor(() =>
      expect(
        header.get('button[aria-label="Unlike repository"]').text(),
      ).toContain("5"),
    );
    await wrapper.setProps({ tab: "files" });
    await flushPromises();
    expect(
      header
        .get('button[aria-label="Unlike repository"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    await header.get('button[aria-label="Unlike repository"]').trigger("click");
    await vi.waitFor(() =>
      expect(
        header.get('button[aria-label="Like repository"]').text(),
      ).toContain("4"),
    );
    expect(requests).toEqual(["GET", "POST", "DELETE"]);
    expect(infoCount).toBe(1);
    wrapper.unmount();
  });

  it("keeps copy, clone and the existing download action connected to the repository", async () => {
    const info = vi.spyOn(ElMessage, "info").mockImplementation(() => {});
    const wrapper = mountViewer();
    await ready(wrapper);
    const header = wrapper.get('[aria-label="Repository header"]');
    expect(header.find('button[aria-label="Like repository"]').exists()).toBe(
      false,
    );
    expect(header.find('[aria-label="Repository likes"]').exists()).toBe(true);
    await header
      .get('button[aria-label="Copy repository ID"]')
      .trigger("click");
    expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(
      "open-media-lab/big-repo",
    );
    await header
      .findAll("button")
      .find((button) => button.text() === "Clone")
      .trigger("click");
    const dialog = wrapper.get('[data-el-dialog="Clone Repository"]');
    expect(dialog.get("pre").text()).toMatch(
      /^git clone https?:\/\/\S+\/open-media-lab\/big-repo\.git$/,
    );
    await header
      .findAll("button")
      .find((button) => button.text() === "Download")
      .trigger("click");
    expect(info).toHaveBeenCalledExactlyOnceWith(
      "Download functionality coming soon",
    );
    wrapper.unmount();
    info.mockRestore();
  });

  it("makes each commit row one link: the title stretches over the row, the author stays its own link", async () => {
    const wrapper = mountViewer("commits");
    await ready(wrapper);
    const rows = wrapper.findAll("[data-testid='repo-commit-row']");
    expect(rows).toHaveLength(2);
    const stretched = rows.map((row) => row.get("a.stretched-link"));
    expect(stretched.map((link) => link.attributes("href"))).toEqual([
      `${PAGE}/commit/c1`,
      `${PAGE}/commit/c2`,
    ]);
    expect(stretched.map((link) => link.text())).toEqual([
      "First change",
      "Second change",
    ]);
    for (const row of rows) {
      expect(row.classes()).toContain("relative");
      const author = row.get("a[href='/alice'], a[href='/bob']");
      expect(author.classes()).toContain("stretched-link-above");
    }
    await rows[0].trigger("click");
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
