import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { http } from "@/testing/msw";
import {
  ElementPlusStubs,
  InvalidElFormStub,
  RouterLinkStub,
} from "../helpers/vue";
import {
  cloneFixture,
  jsonResponse,
  readJsonBody,
  uiApiFixtures,
} from "../helpers/api-fixtures";
import { server } from "../setup/msw-server";
import { CreationFormStub } from "../helpers/creation-form";

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  route: {
    params: {},
    query: {},
  },
  repoSortPreference: {
    getRepoSortPreference: vi.fn(),
    setRepoSortPreference: vi.fn(),
  },
  elMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("vue-router/auto", async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => mocks.router,
  useRoute: () => mocks.route,
}));

vi.mock("@/utils/repoSortPreference", () => ({
  getRepoSortPreference: mocks.repoSortPreference.getRepoSortPreference,
  setRepoSortPreference: mocks.repoSortPreference.setRepoSortPreference,
}));

vi.mock("element-plus", () => ({
  ElMessage: mocks.elMessage,
}));

import RepoListPage from "@/components/pages/RepoListPage.vue";
import RepoDiscoveryCard from "@/components/discovery/RepoDiscoveryCard.vue";
import { useAuthStore } from "@/stores/auth";

// Match ElSkeleton's named-template behavior so replacing results with a
// loading placeholder cannot accidentally pass through the generic stub.
const RepoSkeletonStub = defineComponent({
  name: "ElSkeleton",
  props: { loading: Boolean },
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        { "data-el-skeleton": "true" },
        props.loading ? slots.template?.() : slots.default?.(),
      );
  },
});
const SkeletonItemStub = defineComponent({
  name: "ElSkeletonItem",
  setup() {
    return () => h("span");
  },
});

const DiscoveryPaginationStub = defineComponent({
  name: "ElPagination",
  props: ElementPlusStubs.ElPagination.props,
  emits: ["update:currentPage", "current-change"],
  setup(props, { emit }) {
    return ElementPlusStubs.ElPagination.setup(
      new Proxy(props, {
        get(target, key) {
          return key === "pageCount"
            ? Math.max(1, Math.ceil(target.total / target.pageSize))
            : target[key];
        },
      }),
      { emit },
    );
  },
});

function deferResponse() {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

function discoveryResponse(items, overrides = {}) {
  return {
    items,
    total: items.length,
    facets: [],
    has_more: false,
    indexing: { pending: 0, total: items.length },
    ...overrides,
  };
}

describe("RepoListPage", () => {
  const wrappers = [];
  const requests = {
    create: [],
    listRepos: [],
    userOrgs: [],
  };

  function defaultModelRepos() {
    return [
      cloneFixture(uiApiFixtures.repo.info),
      {
        ...cloneFixture(uiApiFixtures.repo.info),
        id: "alice/other-model",
        author: "alice",
      },
    ];
  }

  function installHandlers({
    modelRepos = defaultModelRepos(),
    datasetRepos = cloneFixture(uiApiFixtures.userOverview.datasets),
    spaceRepos = cloneFixture(uiApiFixtures.userOverview.spaces),
    createStatus = 200,
    createResponse = cloneFixture(uiApiFixtures.repo.create),
    userOrgsStatus = 200,
    userOrgsResponse = cloneFixture(uiApiFixtures.organizations.userOrgs),
  } = {}) {
    requests.create.length = 0;
    requests.listRepos.length = 0;
    requests.userOrgs.length = 0;

    server.use(
      http.get("/api/models/discover", ({ request }) => {
        const url = new URL(request.url);
        requests.listRepos.push({
          type: "model",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        const search = url.searchParams.get("search")?.toLowerCase() || "";
        const items = modelRepos.filter((repo) =>
          `${repo.id} ${repo.author}`.toLowerCase().includes(search),
        );
        return jsonResponse(discoveryResponse(items));
      }),
      http.get("/api/datasets/discover", ({ request }) => {
        const url = new URL(request.url);
        requests.listRepos.push({
          type: "dataset",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(discoveryResponse(datasetRepos));
      }),
      http.get("/api/spaces/discover", ({ request }) => {
        const url = new URL(request.url);
        requests.listRepos.push({
          type: "space",
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(discoveryResponse(spaceRepos));
      }),
      http.get("/org/users/:username/orgs", ({ request, params }) => {
        const url = new URL(request.url);
        requests.userOrgs.push({
          username: params.username,
          params: Object.fromEntries(url.searchParams.entries()),
        });
        return jsonResponse(userOrgsResponse, { status: userOrgsStatus });
      }),
      http.post("/api/repos/create", async ({ request }) => {
        requests.create.push(await readJsonBody(request));
        return jsonResponse(createResponse, { status: createStatus });
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route = reactive({ params: {}, query: {} });
    mocks.router.replace.mockImplementation(({ query }) => {
      mocks.route.query = { ...query };
      return Promise.resolve();
    });
    setActivePinia(createPinia());
    mocks.repoSortPreference.getRepoSortPreference.mockReturnValue("likes");
    installHandlers();
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  function mountPage(repoType = "model", extraStubs = {}) {
    const wrapper = mount(RepoListPage, {
      props: {
        repoType,
      },
      global: {
        stubs: {
          ...ElementPlusStubs,
          ElSkeleton: RepoSkeletonStub,
          ElSkeletonItem: SkeletonItemStub,
          ElPagination: DiscoveryPaginationStub,
          ElScrollbar: defineComponent({
            setup:
              (_, { slots }) =>
              () =>
                h("div", slots.default?.()),
          }),
          ...extraStubs,
          RouterLink: RouterLinkStub,
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  }

  it.each(["model", "dataset", "space"])(
    "keeps all %s sorting options connected to URL, preference and API state",
    async (repoType) => {
      const wrapper = mountPage(repoType);
      await flushPromises();
      const select = wrapper.get('select[data-el-select="true"]');
      const options = [
        ["trending", "Trending"],
        ["recent", "Recently Created"],
        ["updated", "Recently Updated"],
        ["downloads", "Most Downloads"],
        ["likes", "Most Likes"],
      ];
      expect(
        select
          .findAll("option")
          .map((option) => [option.attributes("value"), option.text()]),
      ).toEqual(options);
      for (const [sort] of options) {
        await select.setValue(sort);
        await vi.waitFor(() =>
          expect(requests.listRepos.at(-1)).toEqual({
            type: repoType,
            params: { limit: "24", offset: "0", sort },
          }),
        );
        expect(mocks.route.query.sort).toBe(sort);
        expect(
          mocks.repoSortPreference.setRepoSortPreference,
        ).toHaveBeenCalledWith({ scope: "repo", repoType, value: sort });
      }
    },
  );

  it.each(["model", "dataset", "space"])(
    "replaces full-card initial placeholders with loaded %s repositories",
    async (repoType) => {
      const gate = deferResponse();
      const requestStarted = vi.fn();
      server.use(
        http.get(`/api/${repoType}s/discover`, async () => {
          requestStarted();
          await gate.pending;
          return jsonResponse(discoveryResponse(defaultModelRepos()));
        }),
      );

      const wrapper = mountPage(repoType);
      try {
        await vi.waitFor(() => expect(requestStarted).toHaveBeenCalledOnce());
        expect(
          wrapper.get("section.repo-results").attributes("aria-busy"),
        ).toBe("true");
        expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(12);
        expect(wrapper.findComponent(RepoDiscoveryCard).exists()).toBe(false);
        expect(wrapper.text()).not.toContain("No repositories found");

        gate.release();
        await vi.waitFor(() => {
          expect(
            wrapper.get("section.repo-results").attributes("aria-busy"),
          ).toBe("false");
          expect(wrapper.text()).toContain("alice/other-model");
        });
        expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(0);
        expect(wrapper.findComponent(RepoDiscoveryCard).exists()).toBe(true);
      } finally {
        gate.release();
        wrapper.unmount();
      }
    },
  );

  it.each([200, 500])(
    "keeps the existing repository list mounted while sorting, including a %s response",
    async (status) => {
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.text()).toContain("alice/other-model");
      const initialCard = wrapper
        .findAll(".repo-discovery-card")
        .find((card) => card.text().includes("alice/other-model")).element;
      const gate = deferResponse();
      const requestStarted = vi.fn();
      const updatedRepos = [
        {
          ...cloneFixture(uiApiFixtures.repo.info),
          id: "alice/updated-model",
          author: "alice",
        },
      ];
      server.use(
        http.get("/api/models/discover", async ({ request }) => {
          requestStarted(new URL(request.url).searchParams.get("sort"));
          await gate.pending;
          return jsonResponse(
            status === 200
              ? discoveryResponse(updatedRepos)
              : { detail: "boom" },
            {
              status,
            },
          );
        }),
      );

      try {
        await wrapper.get('select[data-el-select="true"]').setValue("recent");
        await vi.waitFor(() =>
          expect(requestStarted).toHaveBeenCalledWith("recent"),
        );
        expect(
          wrapper.get("section.repo-results").attributes("aria-busy"),
        ).toBe("true");
        expect(wrapper.get(".repo-refreshing").attributes("role")).toBe(
          "status",
        );
        expect(wrapper.get(".repo-refreshing").text()).toBe(
          "Updating repositories",
        );
        expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(0);
        expect(wrapper.getComponent(RepoDiscoveryCard).isVisible()).toBe(true);
        expect(wrapper.text()).toContain("alice/other-model");
        expect(
          wrapper
            .findAll(".repo-discovery-card")
            .some((card) => card.element === initialCard),
        ).toBe(true);

        gate.release();
        await vi.waitFor(() =>
          expect(
            wrapper.get("section.repo-results").attributes("aria-busy"),
          ).toBe("false"),
        );
        expect(wrapper.find(".repo-refreshing").exists()).toBe(false);
        expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(0);
        if (status === 200) {
          expect(wrapper.text()).toContain("alice/updated-model");
          expect(wrapper.text()).not.toContain("alice/other-model");
        } else {
          expect(wrapper.text()).toContain("alice/other-model");
          expect(mocks.elMessage.error).toHaveBeenCalledWith(
            "Failed to load models",
          );
        }
      } finally {
        gate.release();
        wrapper.unmount();
      }
    },
  );

  it("loads and searches repos through discovery, persists sort preference, and creates a new repo", async () => {
    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };

    const wrapper = mountPage();
    await flushPromises();

    expect(requests.listRepos).toEqual([
      {
        type: "model",
        params: {
          limit: "24",
          sort: "likes",
          offset: "0",
        },
      },
    ]);
    expect(wrapper.text()).toContain("mai_lin/lineart-caption-base");
    expect(wrapper.text()).toContain("alice/other-model");
    expect(wrapper.text()).toContain("New Model");

    const searchInput = wrapper.get('input[placeholder="Search models..."]');
    await searchInput.setValue("other");
    await vi.waitFor(() => {
      expect(requests.listRepos.at(-1).params.search).toBe("other");
      expect(wrapper.text()).toContain("alice/other-model");
      expect(wrapper.text()).not.toContain("mai_lin/lineart-caption-base");
    });

    const sortSelect = wrapper.get('select[data-el-select="true"]');
    await sortSelect.setValue("recent");
    await flushPromises();

    expect(mocks.repoSortPreference.setRepoSortPreference).toHaveBeenCalledWith(
      {
        scope: "repo",
        repoType: "model",
        value: "recent",
      },
    );
    expect(requests.listRepos.at(-1)).toEqual({
      type: "model",
      params: {
        limit: "24",
        sort: "recent",
        offset: "0",
        search: "other",
      },
    });

    const createButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Model"));
    await createButton.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-el-dialog="Create New Model"]').exists()).toBe(
      true,
    );

    await wrapper.get('input[placeholder="my-model"]').setValue("fresh-model");
    await wrapper.get('select[aria-label="Select owner"]').setValue("acme");
    await wrapper.get('input[type="checkbox"]').setValue(true);

    const createDialogButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Create Model"));
    await createDialogButton.trigger("click");
    await flushPromises();

    expect(requests.userOrgs).toEqual([
      {
        username: "alice",
        params: {},
      },
    ]);
    expect(requests.create).toEqual([
      {
        type: "model",
        name: "fresh-model",
        organization: "acme",
        private: true,
      },
    ]);
    expect(mocks.router.push).toHaveBeenCalledWith("/models/acme/fresh-model");
  });

  it("handles list loading failures and hides creation controls for visitors", async () => {
    installHandlers();
    server.use(
      http.get("/api/models/discover", () =>
        jsonResponse({ detail: "boom" }, { status: 500 }),
      ),
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("New Model");
    expect(mocks.elMessage.error).toHaveBeenCalledWith("Failed to load models");
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Failed to load models. Please try again.",
    );
    server.use(
      http.get("/api/models/discover", () =>
        jsonResponse(discoveryResponse(defaultModelRepos())),
      ),
    );
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("alice/other-model");
  });

  it("falls back to the current user when the backend omits repo_id", async () => {
    installHandlers({
      createResponse: cloneFixture(uiApiFixtures.repo.createWithoutId),
    });

    const authStore = useAuthStore();
    authStore.user = { username: "mai_lin" };
    authStore.userOrganizations = [];

    const wrapper = mountPage();
    await flushPromises();

    const createButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Model"));
    await createButton.trigger("click");
    await flushPromises();

    await wrapper.get('input[placeholder="my-model"]').setValue("fresh-model");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Create Model"))
      .trigger("click");
    await flushPromises();

    expect(requests.create).toEqual([
      {
        type: "model",
        name: "fresh-model",
        organization: null,
        private: false,
      },
    ]);
    expect(mocks.router.push).toHaveBeenCalledWith(
      "/models/mai_lin/fresh-model",
    );
  });

  it("renders alternate repository type labels for non-model pages", async () => {
    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };

    const wrapper = mountPage("space");
    await flushPromises();

    expect(requests.listRepos).toEqual([
      {
        type: "space",
        params: {
          limit: "24",
          sort: "likes",
          offset: "0",
        },
      },
    ]);
    expect(wrapper.text()).toContain("Spaces");
    expect(wrapper.text()).toContain("Discover ML demos and applications");
    expect(wrapper.text()).toContain("New Space");
  });

  it("searches by author through the API and reports organization or creation failures", async () => {
    installHandlers({
      modelRepos: [
        {
          ...cloneFixture(uiApiFixtures.repo.info),
          id: "team/project",
          author: "alice",
        },
      ],
      userOrgsStatus: 500,
      userOrgsResponse: {},
      createStatus: 500,
      createResponse: { detail: "boom" },
    });

    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };

    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get('input[placeholder="Search models..."]')
      .setValue("alice");
    await vi.waitFor(() => {
      expect(requests.listRepos.at(-1).params.search).toBe("alice");
      expect(wrapper.text()).toContain("team/project");
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Model"))
      .trigger("click");
    await flushPromises();

    expect(requests.userOrgs).toEqual([
      {
        username: "alice",
        params: {},
      },
    ]);

    await wrapper.get('input[placeholder="my-model"]').setValue("broken-model");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Create Model"))
      .trigger("click");
    await flushPromises();

    expect(requests.create).toEqual([
      {
        type: "model",
        name: "broken-model",
        organization: null,
        private: false,
      },
    ]);
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      "/models/alice/broken-model",
    );
  });

  it("surfaces the backend 409 conflict message when the repo already exists", async () => {
    // Backend PR #18 changed the exist-ok path from 400 `{detail}` to 409
    // `{url, repo_id, error}`. RepoListPage's inline "New Model" dialog
    // uses the same create call as the standalone /new page; pin the
    // same error-surfacing contract here so the two paths stay aligned.
    installHandlers({
      createStatus: 409,
      createResponse: {
        url: "http://testserver/models/alice/fresh-model",
        repo_id: "alice/fresh-model",
        error: "Repository alice/fresh-model already exists",
      },
      userOrgsResponse: cloneFixture(uiApiFixtures.organizations.userOrgs),
    });

    const authStore = useAuthStore();
    authStore.user = { username: "alice" };

    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Model"))
      .trigger("click");
    await flushPromises();

    await wrapper.get('input[placeholder="my-model"]').setValue("fresh-model");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Create Model"))
      .trigger("click");
    await flushPromises();

    expect(mocks.elMessage.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Repository alice/fresh-model already exists") }),
    );
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      "/models/alice/fresh-model",
    );
  });

  it("defaults missing organization payloads and stops invalid create submissions", async () => {
    installHandlers({
      userOrgsResponse: {},
    });

    const authStore = useAuthStore();
    authStore.user = {
      username: "alice",
    };

    const wrapper = mountPage("model", {
      ElForm: InvalidElFormStub,
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("New Model"))
      .trigger("click");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Create Model"))
      .trigger("click");
    await flushPromises();

    expect(requests.userOrgs).toEqual([
      {
        username: "alice",
        params: {},
      },
    ]);
    expect(requests.create).toEqual([]);
  });

  it.each(["a", "model.v1"])(
    "validates and creates %s through the modal's shared rules",
    async (name) => {
      useAuthStore().user = { username: "alice" };
      const wrapper = mountPage("model", { ElForm: CreationFormStub });
      await flushPromises();
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("New Model"))
        .trigger("click");
      await flushPromises();
      await wrapper.get('input[placeholder="my-model"]').setValue(name);
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("Create Model"))
        .trigger("click");
      await flushPromises();
      expect(requests.create).toEqual([
        { type: "model", name, organization: null, private: false },
      ]);
    },
  );

  it.each(["", "bad/name"])(
    "blocks %s through the modal's shared form rules",
    async (name) => {
      useAuthStore().user = { username: "alice" };
      const wrapper = mountPage("model", { ElForm: CreationFormStub });
      await flushPromises();
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("New Model"))
        .trigger("click");
      await flushPromises();
      await wrapper.get('input[placeholder="my-model"]').setValue(name);
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("Create Model"))
        .trigger("click");
      await flushPromises();
      expect(requests.create).toEqual([]);
      expect(wrapper.get("[data-validation-error]").text()).toBe(
        name
          ? "Only letters, numbers, hyphens, underscores, and dots allowed"
          : "Please enter repository name",
      );
    },
  );

  it.each([
    [{ detail: { error: "Quota exceeded" } }, "Quota exceeded"],
    [{ detail: [{ msg: "Invalid name" }] }, "Invalid name"],
    [{ detail: {} }, "Failed to create model"],
  ])(
    "renders a textual modal create error for %j",
    async (createResponse, message) => {
      installHandlers({ createStatus: 422, createResponse });
      useAuthStore().user = { username: "alice" };
      const wrapper = mountPage();
      await flushPromises();
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("New Model"))
        .trigger("click");
      await flushPromises();
      await wrapper.get('input[placeholder="my-model"]').setValue("model");
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("Create Model"))
        .trigger("click");
      await flushPromises();
      expect(mocks.elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining(message) }),
      );
    },
  );

  it("uses server facets across the full catalogue and paginates filtered results", async () => {
    const calls = [];
    const repo = (name) => ({
      ...cloneFixture(uiApiFixtures.repo.info),
      id: `catalogue/${name}`,
    });
    const facets = [
      {
        key: "task",
        label: "Tasks",
        options: [
          { value: "image-to-text", label: "Image to text", count: 31 },
          { value: "text-generation", label: "Text generation", count: 27 },
        ],
      },
    ];
    server.use(
      http.get("/api/models/discover", ({ request }) => {
        const params = new URL(request.url).searchParams;
        calls.push(params);
        const selected = params.getAll("task");
        const offset = Number(params.get("offset"));
        return jsonResponse(
          discoveryResponse(
            selected.length
              ? [repo(offset ? "filtered-page-two" : "outside-initial-page")]
              : [repo("initial-page")],
            {
              total: selected.length ? 31 : 120,
              facets,
              has_more: offset === 0,
              indexing: { pending: 0, total: 120 },
            },
          ),
        );
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("catalogue/initial-page");
    expect(wrapper.get('[aria-label="Tasks"]').text()).toContain("31");
    await wrapper.get('[aria-label="Tasks"] .facet-chip').trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("catalogue/outside-initial-page"),
    );
    expect(calls.at(-1).getAll("task")).toEqual(["image-to-text"]);
    expect(calls.at(-1).get("offset")).toBe("0");
    await wrapper.get('[data-el-pagination-page="2"]').trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("catalogue/filtered-page-two"),
    );
    expect(calls.at(-1).get("offset")).toBe("24");
    expect(calls.at(-1).getAll("task")).toEqual(["image-to-text"]);
    await wrapper
      .findAll('[aria-label="Tasks"] .facet-chip')[1]
      .trigger("click");
    await vi.waitFor(() =>
      expect(calls.at(-1).getAll("task")).toEqual([
        "image-to-text",
        "text-generation",
      ]),
    );
    expect(calls.at(-1).get("offset")).toBe("0");
    expect(
      wrapper
        .findAll('[aria-label="Tasks"] .facet-chip')
        .map((chip) => chip.attributes("aria-pressed")),
    ).toEqual(["true", "true"]);
    await wrapper.get(".clear-filters").trigger("click");
    await vi.waitFor(() => expect(calls.at(-1).getAll("task")).toEqual([]));
    expect(wrapper.text()).toContain("catalogue/initial-page");
  });

  it("restores repeated URL filters and follows history changes without dropping unrelated query parameters", async () => {
    mocks.route.query = {
      task: ["image-to-text", "text-generation"],
      language: "zh",
      search: "caption",
      sort: "updated",
      page: "2",
      campaign: "launch",
    };
    const calls = [];
    server.use(
      http.get("/api/models/discover", ({ request }) => {
        const params = new URL(request.url).searchParams;
        calls.push(params);
        return jsonResponse(
          discoveryResponse(defaultModelRepos(), { total: 40 }),
        );
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(calls[0].getAll("task")).toEqual([
      "image-to-text",
      "text-generation",
    ]);
    expect(calls[0].getAll("language")).toEqual(["zh"]);
    expect(calls[0].get("offset")).toBe("24");
    expect(calls[0].get("sort")).toBe("updated");
    expect(
      wrapper.get('input[placeholder="Search models..."]').element.value,
    ).toBe("caption");
    expect(wrapper.get('select[data-el-select="true"]').element.value).toBe(
      "updated",
    );
    await wrapper.get('select[data-el-select="true"]').setValue("downloads");
    await vi.waitFor(() => expect(calls.at(-1).get("sort")).toBe("downloads"));
    expect(mocks.route.query.campaign).toBe("launch");
    expect(calls.at(-1).get("offset")).toBe("0");
    const priorCalls = calls.length;
    mocks.route.query = { license: "mit", sort: "likes", campaign: "launch" };
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThan(priorCalls);
      expect(calls.at(-1).getAll("license")).toEqual(["mit"]);
      expect(calls.at(-1).getAll("task")).toEqual([]);
      expect(
        wrapper.get('input[placeholder="Search models..."]').element.value,
      ).toBe("");
      expect(wrapper.get('select[data-el-select="true"]').element.value).toBe(
        "likes",
      );
    });
  });

  it("uses the server's Unicode selection and deduplicates mixed-case URL filters", async () => {
    mocks.route.query = {
      tag: "Straße",
      library: ["Transformers", "transformers"],
      campaign: "launch",
    };
    const calls = [];
    server.use(
      http.get("/api/models/discover", ({ request }) => {
        const params = new URL(request.url).searchParams;
        calls.push(params);
        const selected = {};
        if (params.has("library")) selected.library = ["transformers"];
        if (params.has("tag")) selected.tag = ["strasse"];
        return jsonResponse(
          discoveryResponse(defaultModelRepos(), {
            selected,
            facets: [
              {
                key: "library",
                label: "Libraries",
                options: [{ value: "transformers", count: 2 }],
              },
              {
                key: "tag",
                label: "Tags",
                options: [{ value: "strasse", count: 2 }],
              },
            ],
          }),
        );
      }),
    );
    const wrapper = mountPage();
    await vi.waitFor(() => {
      expect(mocks.route.query.tag).toEqual(["strasse"]);
      expect(mocks.route.query.library).toEqual(["transformers"]);
      expect(
        wrapper
          .get('[aria-label="Libraries"] .facet-chip')
          .attributes("aria-pressed"),
      ).toBe("true");
      expect(
        wrapper
          .get('[aria-label="Tags"] .facet-chip')
          .attributes("aria-pressed"),
      ).toBe("true");
    });
    expect(calls[0].getAll("library")).toEqual(["transformers"]);
    expect(wrapper.get(".selection-count").text()).toBe("2");
    expect(
      wrapper.findAll(".selected-filters button[aria-label]"),
    ).toHaveLength(2);
    await wrapper.get('[aria-label="Libraries"] .facet-chip').trigger("click");
    await vi.waitFor(() => expect(calls.at(-1).has("library")).toBe(false));
    expect(
      wrapper
        .get('[aria-label="Libraries"] .facet-chip')
        .attributes("aria-pressed"),
    ).toBe("false");
    await wrapper
      .get('button[aria-label="Remove strasse filter"]')
      .trigger("click");
    await vi.waitFor(() => expect(calls.at(-1).has("tag")).toBe(false));
    expect(wrapper.find(".selected-filters").exists()).toBe(false);
    expect(mocks.route.query.campaign).toBe("launch");
  });

  it("ignores stale repository and facet responses after a newer search completes", async () => {
    const oldResponse = deferResponse();
    const oldStarted = vi.fn();
    server.use(
      http.get("/api/models/discover", async ({ request }) => {
        const search = new URL(request.url).searchParams.get("search");
        if (search === "old") {
          oldStarted();
          await oldResponse.pending;
          return jsonResponse(
            discoveryResponse(
              [{ ...cloneFixture(uiApiFixtures.repo.info), id: "alice/stale" }],
              {
                facets: [
                  {
                    key: "tag",
                    label: "Tags",
                    options: [
                      { value: "stale-tag", label: "Stale tag", count: 1 },
                    ],
                  },
                ],
              },
            ),
          );
        }
        return jsonResponse(
          discoveryResponse([
            {
              ...cloneFixture(uiApiFixtures.repo.info),
              id: search === "new" ? "alice/newest" : "alice/initial",
            },
          ]),
        );
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    try {
      await wrapper
        .get('input[placeholder="Search models..."]')
        .setValue("old");
      await vi.waitFor(() => expect(oldStarted).toHaveBeenCalledOnce());
      await wrapper
        .get('input[placeholder="Search models..."]')
        .setValue("new");
      await vi.waitFor(() => expect(wrapper.text()).toContain("alice/newest"));
      oldResponse.release();
      await flushPromises();
      expect(wrapper.text()).toContain("alice/newest");
      expect(wrapper.text()).not.toContain("alice/stale");
      expect(wrapper.text()).not.toContain("Stale tag");
      expect(wrapper.get(".repo-results").attributes("aria-busy")).toBe(
        "false",
      );
    } finally {
      oldResponse.release();
    }
  });

  it("opens a fresh shared creation form after cancelling a modal draft", async () => {
    useAuthStore().user = { username: "alice" };
    const wrapper = mountPage();
    await flushPromises();
    const clickButton = async (label) =>
      wrapper
        .findAll("button")
        .find((button) => button.text().includes(label))
        .trigger("click");
    await clickButton("New Model");
    await flushPromises();
    await wrapper.get('input[placeholder="my-model"]').setValue("draft");
    await wrapper.get('select[aria-label="Select owner"]').setValue("acme");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await clickButton("Cancel");
    expect(wrapper.find('input[placeholder="my-model"]').exists()).toBe(false);
    await clickButton("New Model");
    await flushPromises();
    expect(wrapper.get('input[placeholder="my-model"]').element.value).toBe("");
    expect(wrapper.get('select[aria-label="Select owner"]').element.value).toBe(
      "alice",
    );
    expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(false);
    expect(requests.create).toEqual([]);
  });

  it.each(["token", "id", "is_org", "is_active"])(
    "clears private discovery data synchronously when the same username changes %s",
    async (field) => {
      const auth = useAuthStore();
      auth.user = { username: "alice", id: 1, is_org: false, is_active: true };
      auth.token = "session-a";
      mocks.route.query = { page: "2", campaign: "keep" };
      const stale = deferResponse();
      const current = deferResponse();
      const oldStarted = vi.fn();
      const currentStarted = vi.fn();
      const privateRepo = {
        ...cloneFixture(uiApiFixtures.repo.info),
        id: "alice/private-session",
        private: true,
      };
      let count = 0;
      server.use(
        http.get("/api/models/discover", async ({ request }) => {
          const ordinal = ++count;
          if (ordinal === 2) {
            oldStarted();
            await stale.pending;
          }
          if (ordinal >= 3) {
            currentStarted(new URL(request.url).searchParams.get("offset"));
            await current.pending;
            return jsonResponse(
              discoveryResponse([
                {
                  ...privateRepo,
                  id: "public/current-session",
                  private: false,
                },
              ]),
            );
          }
          return jsonResponse(
            discoveryResponse([privateRepo], {
              total: 50,
              indexing: { pending: 2, total: 50 },
              facets: [
                {
                  key: "tag",
                  label: "Tags",
                  options: [{ value: "private-facet", count: 50 }],
                },
              ],
            }),
          );
        }),
      );
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.text()).toContain("alice/private-session");
      expect(wrapper.vm.facets).toHaveLength(1);
      try {
        await wrapper.get("[data-el-pagination-next]").trigger("click");
        await vi.waitFor(() => expect(oldStarted).toHaveBeenCalledOnce());
        expect(wrapper.vm.currentPage).toBe(3);
        if (field === "token") auth.token = "session-b";
        else
          auth.user = {
            ...auth.user,
            [field]: field === "id" ? 2 : !auth.user[field],
          };
        expect(wrapper.vm.repos).toEqual([]);
        expect(wrapper.vm.facets).toEqual([]);
        expect(wrapper.vm.total).toBe(0);
        expect(wrapper.vm.indexing).toEqual({ pending: 0, total: 0 });
        expect(wrapper.vm.currentPage).toBe(1);
        expect(wrapper.vm.hasLoaded).toBe(false);
        await vi.waitFor(() =>
          expect(currentStarted).toHaveBeenCalledWith("0"),
        );
        expect(wrapper.text()).not.toContain("alice/private-session");
        expect(wrapper.text()).not.toContain("private-facet");
        expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(12);
        expect(mocks.route.query.campaign).toBe("keep");
        current.release();
        await vi.waitFor(() =>
          expect(wrapper.text()).toContain("public/current-session"),
        );
        stale.release();
        await flushPromises();
        expect(wrapper.text()).not.toContain("alice/private-session");
        expect(wrapper.vm.facets).toEqual([]);
        expect(wrapper.get(".repo-results").attributes("aria-busy")).toBe(
          "false",
        );
      } finally {
        stale.release();
        current.release();
      }
    },
  );

  it.each([401, 403, 500])(
    "handles a discovery %s refresh failure without retaining revoked private data",
    async (status) => {
      useAuthStore().user = { username: "alice" };
      let attempts = 0;
      const privateRepo = {
        ...cloneFixture(uiApiFixtures.repo.info),
        id: "alice/private-project",
        private: true,
      };
      server.use(
        http.get("/api/models/discover", () => {
          attempts++;
          if (attempts === 2)
            return jsonResponse({ detail: "request failed" }, { status });
          return jsonResponse(
            discoveryResponse([privateRepo], {
              total: 31,
              facets: [
                {
                  key: "tag",
                  label: "Tags",
                  options: [{ value: "private-facet", count: 31 }],
                },
              ],
            }),
          );
        }),
      );
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.text()).toContain("alice/private-project");
      await wrapper
        .get('select[aria-label="Sort repositories"]')
        .setValue("recent");
      await flushPromises();
      expect(wrapper.text()).toContain(
        "Failed to load models. Please try again.",
      );
      if (status === 500) {
        expect(wrapper.text()).toContain("alice/private-project");
        expect(wrapper.vm.facets).toHaveLength(1);
        expect(wrapper.vm.total).toBe(31);
      } else {
        expect(wrapper.vm.repos).toEqual([]);
        expect(wrapper.vm.facets).toEqual([]);
        expect(wrapper.vm.total).toBe(0);
        expect(wrapper.vm.indexing).toEqual({ pending: 0, total: 0 });
        expect(wrapper.text()).not.toContain("alice/private-project");
        expect(wrapper.text()).not.toContain("private-facet");
        expect(wrapper.find(".discovery-pagination").exists()).toBe(false);
      }
      await wrapper.get(".discovery-error button").trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain("alice/private-project");
      expect(wrapper.find(".discovery-error").exists()).toBe(false);
    },
  );

  it("clears private cards on logout and ignores an in-flight authenticated discovery response", async () => {
    const auth = useAuthStore();
    auth.user = { username: "alice" };
    const oldResponse = deferResponse();
    const visitorResponse = deferResponse();
    const authenticatedStarted = vi.fn();
    const visitorStarted = vi.fn();
    const privateRepo = {
      ...cloneFixture(uiApiFixtures.repo.info),
      id: "alice/private-project",
      private: true,
    };
    let count = 0;
    server.use(
      http.get("/api/models/discover", async () => {
        count++;
        if (count === 1) return jsonResponse(discoveryResponse([privateRepo]));
        if (count === 2) {
          authenticatedStarted();
          await oldResponse.pending;
          return jsonResponse(
            discoveryResponse([privateRepo], {
              facets: [
                {
                  key: "tag",
                  label: "Tags",
                  options: [{ value: "private-tag", count: 1 }],
                },
              ],
            }),
          );
        }
        visitorStarted();
        await visitorResponse.pending;
        return jsonResponse(
          discoveryResponse([
            { ...privateRepo, id: "public/visible-project", private: false },
          ]),
        );
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("alice/private-project");
    try {
      await wrapper.get('select[data-el-select="true"]').setValue("recent");
      await vi.waitFor(() =>
        expect(authenticatedStarted).toHaveBeenCalledOnce(),
      );
      auth.user = null;
      expect(wrapper.vm.repos).toEqual([]);
      expect(wrapper.vm.facets).toEqual([]);
      await vi.waitFor(() => expect(visitorStarted).toHaveBeenCalledOnce());
      expect(wrapper.text()).not.toContain("alice/private-project");
      expect(wrapper.findAll(".repo-skeleton-card")).toHaveLength(12);
      visitorResponse.release();
      await vi.waitFor(() =>
        expect(wrapper.text()).toContain("public/visible-project"),
      );
      oldResponse.release();
      await flushPromises();
      expect(wrapper.text()).not.toContain("alice/private-project");
      expect(wrapper.text()).not.toContain("private-tag");
      expect(wrapper.find(".repo-private").exists()).toBe(false);
      expect(wrapper.get(".repo-results").attributes("aria-busy")).toBe(
        "false",
      );
    } finally {
      oldResponse.release();
      visitorResponse.release();
    }
  });
});
