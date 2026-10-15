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

const CORE = ["sha", "lastModified", "createdAt", "private", "likes", "tags"];

function mountViewer(repoType) {
  return mount(RepoViewer, {
    props: {
      repoType,
      namespace: "acme",
      name: "thing",
      branch: "main",
      currentPath: "",
      tab: "files",
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

// What the page asks repo info for, per kind of repository. Spaces have no download
// counts, and the backend answers 400 for an `expand` it does not know for the kind
// (a Space page showed "Invalid option downloads in expand").
describe("RepoViewer asks repo info for the fields of its kind", () => {
  const infos = [];
  let answers;

  beforeEach(() => {
    infos.length = 0;
    answers = [];
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("/api/users/acme/type", () => jsonResponse({ type: "org" })),
      http.get("/api/:type/acme/thing", ({ request, params }) => {
        if (!["models", "datasets", "spaces"].includes(params.type)) return;
        infos.push(new URL(request.url).searchParams.getAll("expand"));
        const answer = answers.shift();
        if (answer) return answer;
        const { siblings, ...info } = cloneFixture(uiApiFixtures.repo.info);
        return jsonResponse({ ...info, id: "acme/thing", downloads: 7 });
      }),
      http.get("/api/:type/acme/thing/tree/:branch", () =>
        jsonResponse([{ type: "file", path: "README.md", size: 9, oid: "r" }]),
      ),
      http.post("/api/:type/acme/thing/paths-info/:branch", () =>
        jsonResponse([]),
      ),
      http.get(
        "/:type/acme/thing/resolve/:branch/README.md",
        () => new HttpResponse("# Thing\n", { status: 200 }),
      ),
      http.get("/api/:type/acme/thing/commits/:branch", () =>
        jsonResponse({ commits: [], hasMore: false }),
      ),
      http.get("/api/site-config", () => jsonResponse({})),
    );
  });

  it("does not ask a Space for downloads, which it does not have", async () => {
    mountViewer("space");
    await flushPromises();

    expect(infos).toHaveLength(1);
    expect(infos[0]).toEqual(expect.arrayContaining(CORE));
    expect(infos[0]).not.toContain("downloads");
  });

  it.each(["model", "dataset"])("still asks a %s for downloads", async (kind) => {
    mountViewer(kind);
    await flushPromises();

    expect(infos[0]).toContain("downloads");
  });

  it("says nothing about downloads on a Space page and shows them on a model page", async () => {
    const space = mountViewer("space");
    await flushPromises();
    const model = mountViewer("model");
    await flushPromises();

    expect(space.text()).not.toMatch(/downloads/);
    expect(model.text()).toMatch(/7 downloads/);
  });

  it("asks again with the fields every repository has when the backend refuses an option", async () => {
    answers = [jsonResponse({ error: "Invalid option" }, { status: 400 })];

    const wrapper = mountViewer("model");
    await flushPromises();

    expect(infos).toHaveLength(2);
    expect(infos[1]).toEqual(CORE);
    expect(wrapper.text()).toMatch(/acme\/thing|thing/);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("does not keep asking: a second refusal is the page's error", async () => {
    answers = [
      jsonResponse({ error: "Invalid option" }, { status: 400 }),
      jsonResponse({ error: "Invalid option" }, { status: 400 }),
    ];

    mountViewer("model");
    await flushPromises();

    expect(infos).toHaveLength(2);
  });

  it("does not retry a failure that is not a refusal of the fields", async () => {
    answers = [jsonResponse({ error: "gone" }, { status: 404 })];

    mountViewer("model");
    await flushPromises();

    expect(infos).toHaveLength(1);
  });
});
