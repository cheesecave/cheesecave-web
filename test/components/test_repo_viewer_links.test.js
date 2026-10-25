import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { http } from "@/testing/msw";
import { useAuthStore } from "@/stores/auth";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({ router: { push: vi.fn(), back: vi.fn() } }));
vi.mock("vue-router/auto", () => ({ useRouter: () => mocks.router }));

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

function installHandlers(extraInfo = {}) {
  server.use(
    http.get("/api/users/open-media-lab/type", () =>
      jsonResponse({ type: "org" }),
    ),
    http.get(BASE, () => {
      const { siblings, ...info } = cloneFixture(uiApiFixtures.repo.info);
      return jsonResponse({
        ...info,
        id: "open-media-lab/big-repo",
        ...extraInfo,
      });
    }),
    http.get(`${BASE}/tree/:branch`, () => jsonResponse([])),
    http.post(`${BASE}/paths-info/:branch`, () => jsonResponse([])),
    http.get(`${BASE}/commits/:branch`, () =>
      jsonResponse([
        commit("c1", "First change", "alice"),
        commit("c2", "Second change", "bob"),
      ]),
    ),
    http.get("/api/site-config", () =>
      jsonResponse({ capabilities: { repository_operations: {} } }),
    ),
    http.post(`${BASE}/commits/unavailable-files`, () =>
      jsonResponse({ commits: {} }),
    ),
    http.post(`${BASE}/commits/:branch/operations`, () =>
      jsonResponse({ can_write: false, commits: {} }),
    ),
  );
}

function mountViewer(tab = "card") {
  return mount(RepoViewer, {
    props: {
      repoType: "dataset",
      namespace: "open-media-lab",
      name: "big-repo",
      branch: "main",
      currentPath: "",
      tab,
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
  await vi.waitFor(() => expect(wrapper.find("h1").exists()).toBe(true));
  await flushPromises();
}

describe("RepoViewer real links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
    installHandlers();
  });

  it("makes the four tabs links to their own URLs", async () => {
    const wrapper = mountViewer();
    await ready(wrapper);
    const tabs = wrapper.findAll(".repo-tabs a");
    expect(tabs.map((tab) => tab.text())).toEqual([
      "Dataset Card",
      "Files",
      "Commits",
      "Metadata",
    ]);
    expect(tabs.map((tab) => tab.attributes("href"))).toEqual([
      PAGE,
      `${PAGE}/tree/main`,
      `${PAGE}/commits/main`,
      `${PAGE}?tab=metadata`,
    ]);
    expect(wrapper.find(".repo-tabs button").exists()).toBe(false);
  });

  it("keeps each tab's label centred in the row, as the buttons did: a link is top-aligned unless told otherwise", async () => {
    installHandlers({ _source: "huggingface" });
    const wrapper = mountViewer();
    await ready(wrapper);
    // the open tab has a bottom border, which makes the row taller than the other tabs
    for (const tab of wrapper.findAll(
      ".repo-tabs a, .repo-tabs [aria-disabled]",
    ))
      expect(tab.classes()).toEqual(
        expect.arrayContaining(["flex", "items-center"]),
      );
  });

  it.each([
    ["card", "Dataset Card"],
    ["files", "Files"],
    ["commits", "Commits"],
    ["metadata", "Metadata"],
  ])("marks only the open tab (%s) as current", async (tab, label) => {
    const wrapper = mountViewer(tab);
    await ready(wrapper);
    const current = wrapper
      .findAll(".repo-tabs a")
      .filter((link) => link.attributes("aria-current") === "page");
    expect(current.map((link) => link.text())).toEqual([label]);
  });

  it("shows Commits as unavailable, not as a link, for a repository from another source", async () => {
    installHandlers({ _source: "huggingface" });
    const wrapper = mountViewer();
    await ready(wrapper);
    const commits = wrapper
      .findAll(".repo-tabs [aria-disabled='true']")
      .filter((item) => item.text() === "Commits");
    expect(commits).toHaveLength(1);
    expect(commits[0].element.tagName).toBe("SPAN");
    expect(commits[0].attributes("title")).toContain("huggingface");
    expect(wrapper.findAll(".repo-tabs a").map((tab) => tab.text())).toEqual([
      "Dataset Card",
      "Files",
      "Metadata",
    ]);
  });

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
