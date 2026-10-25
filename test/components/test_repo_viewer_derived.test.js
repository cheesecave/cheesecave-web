import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { jsonResponse } from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";

vi.mock("vue-router/auto", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import RepoViewer from "@/components/repo/RepoViewer.vue";

// The header and the metadata panel report what they were given
const HeaderProbe = defineComponent({
  name: "MetadataHeader",
  props: ["metadata", "repoType", "libraries", "others", "arxiv"],
  setup: (props) => () =>
    h("div", {
      "data-header": JSON.stringify({
        metadata: props.metadata,
        libraries: (props.libraries || []).map((c) => c.id),
        others: (props.others || []).map((c) => c.id),
        arxiv: (props.arxiv || []).map((c) => c.id),
      }),
    }),
});
const PanelProbe = defineComponent({
  name: "DetailedMetadataPanel",
  props: ["metadata", "repoType"],
  setup: (props) => () =>
    h("div", { "data-panel": JSON.stringify(props.metadata) }),
});

const LLAMA = {
  tags: [
    "transformers",
    "safetensors",
    "pytorch",
    "llama",
    "text-generation",
    "en",
    "exbert",
    "region:us",
  ],
  pipeline_tag: "text-generation",
  library_name: "transformers",
  config: { architectures: ["LlamaForCausalLM"], model_type: "llama" },
  safetensors: { parameters: { BF16: 1235814400 }, total: 1235814400 },
};

describe("RepoViewer shows what the API knows next to what the README says", () => {
  const requests = [];
  let info;
  let readme;

  function mountViewer(repoType, tab = "card") {
    return mount(RepoViewer, {
      props: {
        repoType,
        namespace: "acme",
        name: "thing",
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
            props: ["content", "headingOffset"],
            setup: (props) => () =>
              h(
                "article",
                { "data-heading-offset": props.headingOffset },
                props.content,
              ),
          }),
          MetadataHeader: HeaderProbe,
          DetailedMetadataPanel: PanelProbe,
          ReferencedDatasetsCard: true,
          SidebarRelationshipsCard: true,
        },
      },
    });
  }
  // info, then the file list, then the README: each waits for the one before
  const settle = async (wrapper) => {
    await flushPromises();
    await vi.waitFor(
      () => expect(wrapper.text()).not.toContain("Loading README"),
      { timeout: 4000 },
    );
    await flushPromises();
  };
  const header = (wrapper) =>
    JSON.parse(wrapper.get("[data-header]").attributes("data-header"));

  beforeEach(() => {
    requests.length = 0;
    info = { ...LLAMA };
    readme = "---\nlicense: mit\nlanguage: en\ntags:\n- exbert\n---\n# Thing\n";
    setActivePinia(createPinia());
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("/api/users/acme/type", () => jsonResponse({ type: "org" })),
      http.get("/api/:type/acme/thing", ({ request, params }) => {
        if (!["models", "datasets", "spaces"].includes(params.type)) return;
        requests.push([
          "info",
          new URL(request.url).searchParams.getAll("expand"),
        ]);
        return jsonResponse({
          id: "acme/thing",
          downloads: 7,
          likes: 1,
          private: false,
          ...info,
        });
      }),
      http.get("/api/:type/acme/thing/tree/:branch", () => {
        requests.push(["tree"]);
        return jsonResponse(
          readme === null
            ? []
            : [{ type: "file", path: "README.md", size: 9, oid: "r" }],
        );
      }),
      http.post("/api/:type/acme/thing/paths-info/:branch", () =>
        jsonResponse([]),
      ),
      ...["models", "datasets", "spaces"].map((plural) =>
        http.get(`/${plural}/acme/thing/resolve/:branch/README.md`, () => {
          requests.push(["readme"]);
          return readme === null
            ? new HttpResponse("", { status: 404 })
            : new HttpResponse(readme, { status: 200 });
        }),
      ),
      http.get("/api/:type/acme/thing/commits/:branch", () =>
        jsonResponse({ commits: [], hasMore: false }),
      ),
      http.get("/api/site-config", () => jsonResponse({})),
    );
  });

  it("shows a model's library, frameworks and free tags, and the card of its size", async () => {
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(header(wrapper)).toMatchObject({
      libraries: ["transformers", "safetensors", "pytorch"],
      others: ["llama", "exbert"],
      arxiv: [],
      metadata: {
        license: "mit",
        library_name: "transformers",
        pipeline_tag: "text-generation",
      },
    });
    const card = wrapper.find(".card h3");
    expect(wrapper.text()).toContain("Model size:");
    expect(wrapper.text()).toContain("1.24B params");
    expect(wrapper.text()).toContain("BF16");
    expect(wrapper.text()).toContain("LlamaForCausalLM");
    expect(card.exists()).toBe(true);
  });

  it("keeps the four tabs on one line at phone width: tighter padding and text below the sm breakpoint", async () => {
    const wrapper = mountViewer("model");
    await settle(wrapper);

    const tabs = wrapper.findAll(".repo-tabs a");
    expect(tabs).toHaveLength(4);
    for (const tab of tabs) {
      expect(tab.classes()).toEqual(
        expect.arrayContaining([
          "px-2.5",
          "sm:px-4",
          "text-sm",
          "sm:text-base",
        ]),
      );
      expect(tab.classes()).not.toContain("px-4");
    }
  });

  it("renders the README one heading level down, under the page's own <h1>", async () => {
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(wrapper.findAll("h1")).toHaveLength(1);
    expect(wrapper.get("h1").text()).toContain("thing");
    expect(wrapper.get("article").attributes("data-heading-offset")).toBe("1");
  });

  it("leaves the languages and the card's own tags out of the free tags it did not already show", async () => {
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(header(wrapper).others).not.toContain("en");
    expect(header(wrapper).others).not.toContain("region:us");
  });

  it("takes the library and the task from the API when the README says another", async () => {
    readme = "---\nlibrary_name: timm\npipeline_tag: fill-mask\n---\n# x\n";
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(header(wrapper).metadata).toMatchObject({
      library_name: "transformers",
      pipeline_tag: "text-generation",
    });
  });

  it("shows a model with no README at all, from what the files say", async () => {
    readme = null;
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(header(wrapper)).toMatchObject({
      libraries: ["transformers", "safetensors", "pytorch"],
      metadata: { library_name: "transformers" },
    });
    expect(wrapper.text()).toContain("1.24B params");
  });

  it("is what it was on a backend that does not know the fields", async () => {
    info = { tags: [] };
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(header(wrapper)).toMatchObject({
      libraries: [],
      others: [],
      metadata: { license: "mit" },
    });
    expect(wrapper.text()).not.toContain("Model size:");
    expect(wrapper.text()).not.toContain("params");
  });

  it("falls back to the README for the library when the API has none", async () => {
    info = { tags: [] };
    readme = "---\nlibrary_name: timm\n---\n# x\n";
    const wrapper = mountViewer("model");
    await settle(wrapper);

    // the library the README names is the library of the page: it is a chip all the same
    expect(header(wrapper)).toMatchObject({
      libraries: ["timm"],
      others: [],
      metadata: { library_name: "timm" },
    });
  });

  it("shows no header for a model that has nothing to show", async () => {
    info = { tags: [] };
    readme = null;
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(wrapper.find("[data-header]").exists()).toBe(false);
  });

  it("shows the SDK of a Space and asks for it", async () => {
    info = { tags: ["gradio", "region:us"], sdk: "gradio" };
    readme = null;
    const wrapper = mountViewer("space");
    await settle(wrapper);

    expect(header(wrapper)).toMatchObject({
      libraries: [],
      others: [],
      metadata: { sdk: "gradio" },
    });
    expect(requests.find(([what]) => what === "info")[1]).toContain("sdk");
    expect(wrapper.text()).not.toContain("Model size:");
  });

  it("shows a dataset as its README says, with no groups of tags", async () => {
    info = {
      tags: ["task_categories:translation", "language:fr", "region:us"],
    };
    readme =
      "---\nlicense: cc-by-4.0\ntask_categories:\n- translation\n---\n# d\n";
    const wrapper = mountViewer("dataset");
    await settle(wrapper);

    expect(header(wrapper)).toMatchObject({
      libraries: [],
      others: [],
      arxiv: [],
      metadata: { license: "cc-by-4.0" },
    });
    expect(requests.find(([what]) => what === "info")[1]).not.toContain(
      "safetensors",
    );
  });

  it("keeps the Metadata tab as the README wrote it", async () => {
    readme = "---\nlicense: mit\n---\n# x\n";
    const wrapper = mountViewer("model", "metadata");
    await settle(wrapper);

    const panel = JSON.parse(
      wrapper.get("[data-panel]").attributes("data-panel"),
    );
    expect(panel).toEqual({ license: "mit" });
  });

  it("asks nothing more of the server for it: one request for the info, one for the README, one for the files", async () => {
    const wrapper = mountViewer("model");
    await settle(wrapper);

    expect(requests.map(([what]) => what).sort()).toEqual([
      "info",
      "readme",
      "tree",
    ]);
    expect(requests.find(([what]) => what === "info")[1]).not.toContain(
      "siblings",
    );
  });
});
