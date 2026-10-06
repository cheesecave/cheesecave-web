import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { useAuthStore } from "@/stores/auth";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("vue-router/auto", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import RepoViewer from "@/components/repo/RepoViewer.vue";

const BASE = "/api/datasets/open-media-lab/big-repo";
const info = () => ({
  ...cloneFixture(uiApiFixtures.repo.info),
  id: "open-media-lab/big-repo",
});

const mounted = [];
const mountViewer = (tab = "files") => {
  const wrapper = mountViewerRaw(tab);
  mounted.push(wrapper);
  return wrapper;
};
const mountViewerRaw = (tab) =>
  mount(RepoViewer, {
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
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: true,
        MetadataHeader: true,
        DetailedMetadataPanel: true,
        ReferencedDatasetsCard: true,
        SidebarRelationshipsCard: true,
        DatasetViewerTab: true,
      },
    },
  });

const settle = async () => {
  for (let i = 0; i < 4; i++) await flushPromises();
};
const title = (w) => w.get('[data-testid="error-title"]').text();

afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.notify.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(
    http.get("/api/users/open-media-lab/type", () =>
      jsonResponse({ type: "org" }),
    ),
    http.get(`${BASE}/tree/:branch`, () => jsonResponse([])),
    http.post(`${BASE}/paths-info/:branch`, () => jsonResponse([])),
    http.get(`${BASE}/commits/main`, () => jsonResponse({ commits: [] })),
  );
});

describe("RepoViewer failure states", () => {
  it("says a missing repository is missing", async () => {
    server.use(
      http.get(
        BASE,
        () =>
          new HttpResponse(null, {
            status: 404,
            headers: {
              "X-Error-Code": "RepoNotFound",
              "X-Error-Message": "Repository not found",
            },
          }),
      ),
    );
    const wrapper = mountViewer();
    await settle();
    expect(title(wrapper)).toBe("Repository not found");
  });

  it("does not call a server failure 'not found', and a retry recovers", async () => {
    let up = false;
    server.use(
      http.get(BASE, () =>
        up ? jsonResponse(info()) : new HttpResponse("oops", { status: 503 }),
      ),
    );
    const wrapper = mountViewer();
    await settle();
    expect(title(wrapper)).toBe("Service unavailable");
    expect(wrapper.text()).not.toContain("Repository not found");
    up = true;
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await settle();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("retries a transient failure by itself, showing the countdown", async () => {
    let calls = 0;
    server.use(
      http.get(BASE, () =>
        ++calls === 1
          ? new HttpResponse("oops", { status: 503 })
          : jsonResponse(info()),
      ),
    );
    const wrapper = mountViewer();
    await settle();
    expect(wrapper.get('[data-testid="error-autoretry"]').text()).toContain(
      "Retrying in 1 s",
    );
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await settle();
    expect(calls).toBe(2);
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("stops retrying by itself when the user cancels the countdown", async () => {
    let calls = 0;
    server.use(
      http.get(BASE, () => {
        calls += 1;
        return new HttpResponse("oops", { status: 503 });
      }),
    );
    const wrapper = mountViewer();
    await settle();
    await wrapper
      .get('[data-testid="error-autoretry-cancel"]')
      .trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await settle();
    expect(calls).toBe(1);
    expect(wrapper.find('[data-testid="error-autoretry"]').exists()).toBe(
      false,
    );
  });

  it("learns whether a signed-in user has liked the repository, and shrugs when it cannot", async () => {
    useAuthStore().user = { username: "alice" };
    server.use(
      http.get(BASE, () => jsonResponse({ ...info(), likes: undefined })),
      http.get(`${BASE}/like`, () => jsonResponse({ liked: true })),
    );
    const liked = mountViewer();
    await settle();
    expect(liked.vm.isLiked).toBe(true);
    expect(liked.vm.likesCount).toBe(0);

    server.use(
      http.get(`${BASE}/like`, () => new HttpResponse("x", { status: 500 })),
    );
    const unknown = mountViewer();
    await settle();
    expect(unknown.vm.isLiked).toBe(false);
    expect(unknown.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("tells a dropped connection from a missing repository", async () => {
    server.use(http.get(BASE, () => HttpResponse.error()));
    const wrapper = mountViewer();
    await settle();
    expect(title(wrapper)).not.toBe("Repository not found");
    expect(wrapper.find('[data-testid="error-action-retry"]').exists()).toBe(
      true,
    );
  });

  it("shows a README that could not be read, and ignores one that was abandoned", async () => {
    server.use(
      http.get(BASE, () => jsonResponse(info())),
      http.get(`${BASE}/tree/:branch`, () =>
        jsonResponse([{ type: "file", path: "README.md", size: 9, oid: "r" }]),
      ),
      http.get(
        "/datasets/open-media-lab/big-repo/resolve/main/README.md",
        () => new HttpResponse("bad gateway", { status: 502 }),
      ),
    );
    const wrapper = mountViewer("card");
    await settle();
    expect(wrapper.text()).toContain("Service unavailable");
    expect(wrapper.text()).not.toContain("No README.md found");
  });

  it("shows the commit history failure instead of 'No commits yet'", async () => {
    server.use(
      http.get(BASE, () => jsonResponse(info())),
      http.get(
        `${BASE}/commits/main`,
        () => new HttpResponse("x", { status: 500 }),
      ),
    );
    const wrapper = mountViewer("commits");
    await settle();
    expect(wrapper.text()).toContain("Something went wrong on the server");
    expect(wrapper.text()).not.toContain("No commits yet");
  });

  it("keeps a README that is only front matter readable, as a blank page", async () => {
    server.use(
      http.get(BASE, () => jsonResponse(info())),
      http.get(`${BASE}/tree/:branch`, () =>
        jsonResponse([{ type: "file", path: "README.md", size: 9, oid: "r" }]),
      ),
      http.get(
        "/datasets/open-media-lab/big-repo/resolve/main/README.md",
        () => new HttpResponse("---\ntitle: x\n---\n", { status: 200 }),
      ),
    );
    const wrapper = mountViewer("card");
    await settle();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(wrapper.vm.readmeContent).toBe(" ");
  });

  it("stays silent about a README fetch that was cancelled", async () => {
    server.use(
      http.get(BASE, () => jsonResponse(info())),
      http.get(`${BASE}/tree/:branch`, () =>
        jsonResponse([{ type: "file", path: "README.md", size: 9, oid: "r" }]),
      ),
    );
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
      String(input).includes("/resolve/")
        ? Promise.reject(new DOMException("gone", "AbortError"))
        : real(input, init),
    );
    const wrapper = mountViewer("card");
    await settle();
    expect(wrapper.vm.readmeError).toBeNull();
  });

  describe("actions report why they failed, in a toast", () => {
    const fails = (method, path) =>
      server.use(
        http[method](
          `${BASE}${path}`,
          () => new HttpResponse("x", { status: 500 }),
        ),
      );

    it("liking", async () => {
      server.use(http.get(BASE, () => jsonResponse(info())));
      fails("post", "/like");
      useAuthStore().user = { username: "alice" };
      const wrapper = mountViewer();
      await settle();
      await wrapper.vm.toggleLike();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
        fallback: "Failed to update like status",
      });
    });

    it("loading more commits", async () => {
      server.use(
        http.get(BASE, () => jsonResponse(info())),
        http.get(`${BASE}/commits/main`, ({ request }) =>
          new URL(request.url).searchParams.has("after")
            ? new HttpResponse("x", { status: 500 })
            : HttpResponse.json(
                cloneFixture(uiApiFixtures.repo.commitsHf.page1),
                {
                  headers: {
                    Link: `<${BASE}/commits/main?after=c2>; rel="next"`,
                  },
                },
              ),
        ),
      );
      const wrapper = mountViewer("commits");
      await settle();
      await wrapper.vm.loadMoreCommits();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
        fallback: "Failed to load more commits",
      });
    });

    it("creating a README", async () => {
      server.use(http.get(BASE, () => jsonResponse(info())));
      fails("post", "/commit/main");
      const wrapper = mountViewer("card");
      await settle();
      await wrapper.vm.createReadme();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
        fallback: "Failed to create README.md",
      });
    });

    it("deleting a folder", async () => {
      server.use(http.get(BASE, () => jsonResponse(info())));
      fails("post", "/commit/main");
      const wrapper = mountViewer();
      await settle();
      await wrapper.vm.deleteFolder();
      expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
        fallback: "Failed to delete folder",
      });
    });
  });
});
