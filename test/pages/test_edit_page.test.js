// The edit page must say why a file did not load, and must refuse to commit
// over a file it never read.

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  commit: vi.fn(),
  notify: vi.fn(),
  error: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: "/datasets/acme/demo/edit/main/notes/a.md",
    params: {
      namespace: "acme",
      name: "demo",
      branch: "main",
      file: ["notes", "a.md"],
    },
  }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("vue-router/auto", () => ({
  useRoute: () => ({
    path: "/datasets/acme/demo/edit/main/notes/a.md",
    params: {
      namespace: "acme",
      name: "demo",
      branch: "main",
      file: ["notes", "a.md"],
    },
  }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { username: "alice" },
    canWriteToNamespace: () => true,
  }),
}));
vi.mock("@/utils/api", () => ({ repoAPI: { commitFiles: mocks.commit } }));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: { error: mocks.error, success: vi.fn(), warning: vi.fn() },
}));

import EditPage from "@/pages/[type]s/[namespace]/[name]/edit/[branch]/[...file].vue";

const CodeEditor = defineComponent({
  props: ["modelValue"],
  emits: ["save", "update:modelValue"],
  setup: (props) => () =>
    h("textarea", { "data-testid": "editor", value: props.modelValue }),
});

const mountPage = () =>
  mount(EditPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        CodeEditor,
      },
    },
  });

const FILE = "/datasets/acme/demo/resolve/main/notes/a.md";
const settle = async () => {
  for (let i = 0; i < 3; i++) await flushPromises();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("edit page", () => {
  it("loads the file into the editor", async () => {
    server.use(
      http.get(FILE, () => new HttpResponse("# hello", { status: 200 })),
    );
    const wrapper = mountPage();
    await settle();
    expect(wrapper.get('[data-testid="editor"]').element.value).toBe("# hello");
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("says a missing file is missing, and does not offer an empty editor", async () => {
    server.use(http.get(FILE, () => new HttpResponse(null, { status: 404 })));
    const wrapper = mountPage();
    await settle();
    expect(wrapper.get('[data-testid="error-title"]').text()).toBe(
      "File not found",
    );
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
  });

  it("says an unreachable server is unreachable, and retries", async () => {
    let up = false;
    server.use(
      http.get(FILE, () =>
        up ? new HttpResponse("ok", { status: 200 }) : HttpResponse.error(),
      ),
    );
    const wrapper = mountPage();
    await settle();
    expect(wrapper.get('[data-testid="error-title"]').text()).toBe(
      "Can't reach the server",
    );
    up = true;
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await settle();
    expect(wrapper.get('[data-testid="editor"]').element.value).toBe("ok");
  });

  it("shows nothing for a read that was cancelled", async () => {
    server.use(http.get(FILE, () => new HttpResponse("x", { status: 200 })));
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("a", "AbortError"),
    );
    const wrapper = mountPage();
    await settle();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("refuses to commit over a file that never loaded", async () => {
    server.use(http.get(FILE, () => new HttpResponse(null, { status: 503 })));
    const wrapper = mountPage();
    await settle();
    const onError = vi.fn();
    wrapper.vm.handleSave("new", () => {}, onError);
    expect(mocks.error).toHaveBeenCalledWith(
      expect.stringContaining("did not load"),
    );
    expect(onError).toHaveBeenCalled();
    expect(wrapper.vm.showCommitDialog).toBe(false);
  });

  it("reports why a commit failed", async () => {
    server.use(http.get(FILE, () => new HttpResponse("# hi", { status: 200 })));
    mocks.commit.mockRejectedValueOnce(new Error("nope"));
    const wrapper = mountPage();
    await settle();
    await wrapper.vm.submitCommit();
    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Failed to commit changes",
    });
  });
});
