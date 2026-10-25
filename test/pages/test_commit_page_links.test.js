// On the commit page, the parent commit and every changed file are links, so they open in a new tab.

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import axios from "@/testing/axios";

const mocks = vi.hoisted(() => ({
  route: {
    params: {
      type: "model",
      namespace: "owner",
      name: "demo",
      commit_id: "commit-1",
    },
  },
  router: { push: vi.fn(), back: vi.fn() },
  settingsAPI: { getSiteConfig: vi.fn() },
  repoAPI: { getCommitOperations: vi.fn(), getCommitUnavailableFiles: vi.fn() },
}));

vi.mock("vue-router/auto", () => ({
  useRoute: () => mocks.route,
  useRouter: () => mocks.router,
}));
vi.mock("@/errors/notify", () => ({ notifyError: vi.fn() }));
vi.mock("@/utils/api", () => ({
  settingsAPI: mocks.settingsAPI,
  repoAPI: mocks.repoAPI,
}));

import CommitPage from "@/pages/[type]s/[namespace]/[name]/commit/[commit_id].vue";

// Show the body of every file, as if each were open
const CollapseItemStub = {
  template: '<div class="collapse-item"><slot name="title" /><slot /></div>',
};

// More than 5% control characters: the page will not show this as text
const NOT_TEXT = "\u0001\u0002\u0003\u0004\u0005\u0006 diff";

const FILES = [
  { path: "weights.zip", type: "changed", diff: null, size_bytes: 10 },
  { path: "added.txt", type: "added", diff: NOT_TEXT, size_bytes: 10 },
  { path: "huge.txt", type: "changed", diff: NOT_TEXT, size_bytes: 2000000 },
  { path: "gone.txt", type: "removed", diff: null, size_bytes: 0 },
];

function install({ parent = "1234567890abcdef", files = FILES } = {}) {
  vi.spyOn(axios, "get").mockImplementation((url) =>
    Promise.resolve({
      data: url.endsWith("/diff")
        ? { files }
        : {
            commit_id: "commit-1",
            message: "A commit",
            author: "owner",
            date: 1,
            parent_commit: parent,
          },
    }),
  );
}

async function mountPage() {
  const wrapper = mount(CommitPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTooltip: true,
        ElCollapseItem: CollapseItemStub,
        RouterLink: RouterLinkStub,
      },
    },
  });
  for (let i = 0; i < 5; i++) await flushPromises();
  return wrapper;
}

describe("commit page links", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
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

  it("links the parent commit to its own page", async () => {
    install();
    const wrapper = await mountPage();
    const parent = wrapper.get("[data-testid='parent-commit-link']");
    expect(parent.element.tagName).toBe("A");
    expect(parent.attributes("href")).toBe(
      "/models/owner/demo/commit/1234567890abcdef",
    );
    expect(parent.text()).toBe("12345678");
  });

  it("shows no parent link for the first commit", async () => {
    install({ parent: null });
    const wrapper = await mountPage();
    expect(wrapper.find("[data-testid='parent-commit-link']").exists()).toBe(
      false,
    );
    expect(wrapper.text()).not.toContain("Parent:");
  });

  it("links View File to the file page for every kind of changed file, and not for a deleted one", async () => {
    install();
    const wrapper = await mountPage();
    const links = wrapper
      .findAll("a")
      .filter((link) => link.text() === "View File");
    expect(links.map((link) => link.attributes("href"))).toEqual([
      "/models/owner/demo/blob/main/weights.zip",
      "/models/owner/demo/blob/main/added.txt",
      "/models/owner/demo/blob/main/huge.txt",
    ]);
    expect(
      wrapper.findAll("button").filter((b) => b.text() === "View File"),
    ).toHaveLength(0);
  });
});
