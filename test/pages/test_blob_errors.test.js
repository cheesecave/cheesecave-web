// The blob page must say why a file did not load, wait for a commit that is
// still landing, and tell a download that cannot start from one that can.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "@/testing/msw";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
import { server } from "../setup/msw-server";

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  notify: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));

vi.mock("vue-router/auto", () => ({
  useRoute: () => ({
    path: "/datasets/acme/demo/blob/main/notes/a.md",
    params: {
      namespace: "acme",
      name: "demo",
      branch: "main",
      file: "notes/a.md",
    },
    query: {},
  }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    canWriteToNamespace: () => false,
  }),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: {
    commitFiles: (...a) => mocks.commit(...a),
    listTree: vi.fn(async () => ({ data: [] })),
    fileExists: vi.fn(async () => false),
  },
}));
vi.mock("element-plus", async (importOriginal) => {
  const real = await importOriginal();
  const ElMessage = Object.assign(mocks.message, {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  });
  return { ...real, ElMessage };
});

import BlobPage from "@/pages/[type]s/[namespace]/[name]/blob/[branch]/[...file].vue";

const FILE = "/datasets/acme/demo/resolve/main/notes/a.md";
const mountBlob = () =>
  mount(BlobPage, {
    global: {
      stubs: {
        ...ElementPlusStubs,
        ElTable: true,
        ElTableColumn: true,
        RouterLink: RouterLinkStub,
        MarkdownViewer: { template: "<div data-stub=MarkdownViewer />" },
        CodeViewer: { template: "<div data-stub=CodeViewer />" },
      },
    },
  });
const settle = async () => {
  for (let i = 0; i < 4; i++) await flushPromises();
};
const title = (w) => w.get('[data-testid="error-title"]').text();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("blob page failures", () => {
  it("says a file the backend has answered for is missing, without waiting", async () => {
    let calls = 0;
    server.use(
      http.get(FILE, () => {
        calls += 1;
        return new HttpResponse(null, {
          status: 404,
          headers: {
            "X-Error-Code": "EntryNotFound",
            "X-Error-Message": "Entry not found",
          },
        });
      }),
    );
    const wrapper = mountBlob();
    await settle();
    expect(title(wrapper)).toBe("File not found");
    expect(calls).toBe(1);
  });

  it("waits for a commit that is still landing, then shows the file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let calls = 0;
    server.use(
      http.get(FILE, () => {
        calls += 1;
        return calls < 3
          ? new HttpResponse(null, { status: 404 })
          : new HttpResponse("# done", { status: 200 });
      }),
    );
    const wrapper = mountBlob();
    for (let i = 0; i < 6; i++) {
      await settle();
      await vi.advanceTimersByTimeAsync(500);
    }
    vi.useRealTimers();
    await settle();
    expect(calls).toBe(3);
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("gives up after ten tries and says the file is not there", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let calls = 0;
    server.use(
      http.get(FILE, () => {
        calls += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const wrapper = mountBlob();
    for (let i = 0; i < 14; i++) {
      await settle();
      await vi.advanceTimersByTimeAsync(500);
    }
    vi.useRealTimers();
    await settle();
    expect(calls).toBe(10);
    expect(title(wrapper)).toBe("File not found");
  });

  it("says an unreachable server is unreachable, and retries", async () => {
    let up = false;
    server.use(
      http.get(FILE, () =>
        up ? new HttpResponse("ok", { status: 200 }) : HttpResponse.error(),
      ),
    );
    const wrapper = mountBlob();
    await settle();
    expect(title(wrapper)).toBe("Can't reach the server");
    up = true;
    await wrapper.get('[data-testid="error-action-retry"]').trigger("click");
    await settle();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("shows nothing for a read that was cancelled", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("a", "AbortError"),
    );
    const wrapper = mountBlob();
    await settle();
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });

  it("opens a download that can start, and explains one that cannot", async () => {
    server.use(http.get(FILE, () => new HttpResponse("ok", { status: 200 })));
    const wrapper = mountBlob();
    await settle();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await wrapper.vm.downloadFile();
    expect(open).toHaveBeenCalledWith(FILE, "_blank");

    server.use(http.get(FILE, () => new HttpResponse("x", { status: 503 })));
    await wrapper.vm.downloadFile();
    expect(mocks.message).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Download failed: Service unavailable",
      }),
    );
  });

  it("reports why deleting the file failed", async () => {
    server.use(http.get(FILE, () => new HttpResponse("ok", { status: 200 })));
    mocks.commit.mockRejectedValueOnce(new Error("nope"));
    const wrapper = mountBlob();
    await settle();
    await wrapper.vm.deleteFile();
    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Failed to delete file",
    });
  });
});
