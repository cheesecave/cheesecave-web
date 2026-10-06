// A PSD member of a zip is read whole (a zip entry cannot be read by range).
// The real zip reader is covered in test_tar_browser_panel_zip; here the
// archive is a fake, to control when its read finishes or fails.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs } from "../helpers/vue";
import { buildPsd } from "../helpers/psd-builder";

const mocks = vi.hoisted(() => ({ archive: null }));

vi.mock("@/utils/zip-archive", async (importOriginal) => ({
  ...(await importOriginal()),
  openRepoZip: vi.fn(async () => mocks.archive),
}));
vi.mock("@/utils/psd-preview", async (importOriginal) => ({
  ...(await importOriginal()),
  rgbaToBlob: vi.fn(async () => new Blob(["pixels"], { type: "image/png" })),
}));

import TarBrowserPanel from "@/components/repo/preview/TarBrowserPanel.vue";
import { ZipArchiveError } from "@/utils/zip-archive";

const psd = buildPsd({ width: 30, height: 20 });

function fakeArchive(read) {
  return {
    url: "https://hub.test/art.zip",
    files: { "art.psd": { offset: 0, size: psd.length } },
    volumes: [],
    legacyNames: false,
    encoding: "utf-8",
    needsPassword: false,
    read: vi.fn(read),
  };
}

async function openPsd() {
  const wrapper = mount(TarBrowserPanel, {
    props: {
      zip: {
        repoType: "dataset",
        namespace: "o",
        name: "n",
        branch: "main",
        path: "art.zip",
      },
      filename: "art.zip",
    },
    global: { stubs: ElementPlusStubs },
  });
  await flushPromises();
  const row = wrapper
    .findAll(".cursor-pointer")
    .find((r) => r.text().includes("art.psd"));
  await row.trigger("click");
  return wrapper;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:psd");
  URL.revokeObjectURL = vi.fn();
  localStorage.setItem("kohaku-tar-thumbnail-enabled", "0");
  localStorage.setItem("kohaku-tar-view-mode", "list");
});

describe("TarBrowserPanel · psd member of a zip", () => {
  it("reads the member whole, once, and shows its flattened image", async () => {
    mocks.archive = fakeArchive(async () => psd);
    const wrapper = await openPsd();
    await flushPromises();
    expect(mocks.archive.read).toHaveBeenCalledTimes(1);
    expect(mocks.archive.read.mock.calls[0][0]).toBe("art.psd");
    expect(mocks.archive.read.mock.calls[0][1].limit).toBe(psd.length);
    expect(wrapper.find('[data-testid="psd-preview-image"]').exists()).toBe(
      true,
    );
    wrapper.unmount();
  });

  it("drops a read that finishes after the member was closed", async () => {
    let finish;
    mocks.archive = fakeArchive(
      () => new Promise((resolve) => (finish = () => resolve(psd))),
    );
    const wrapper = await openPsd();
    const back = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Back"));
    await back.trigger("click");
    finish();
    await flushPromises();
    expect(wrapper.find('[data-testid="psd-preview-image"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="psd-preview-error"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it("asks for the password when the member needs one", async () => {
    mocks.archive = fakeArchive(async () => {
      throw new ZipArchiveError("This member needs a password", {
        kind: "password",
      });
    });
    const wrapper = await openPsd();
    await flushPromises();
    expect(wrapper.find('[data-testid="zip-password-form"]').exists()).toBe(
      true,
    );
    wrapper.unmount();
  });

  it("stays quiet when its own read is aborted", async () => {
    mocks.archive = fakeArchive(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const wrapper = await openPsd();
    await flushPromises();
    expect(wrapper.find('[data-testid="psd-preview-error"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="zip-password-form"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it("reports any other read failure on the member", async () => {
    mocks.archive = fakeArchive(async () => {
      throw new Error("disk on fire");
    });
    const wrapper = await openPsd();
    await flushPromises();
    expect(wrapper.text()).toContain("disk on fire");
    wrapper.unmount();
  });
});
