// Failure toasts of the upload page and the avatar editor go through notifyError.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("cropperjs", () => ({}));
vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: "/models/acme/demo/upload/main",
    params: { namespace: "acme", name: "demo", branch: "main" },
  }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    canWriteToNamespace: () => true,
  }),
}));

import UploadPage from "@/pages/[type]s/[namespace]/[name]/upload/[branch].vue";
import AvatarUpload from "@/components/profile/AvatarUpload.vue";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("failure toasts", () => {
  it("upload page reports why an upload failed", () => {
    const wrapper = mount(UploadPage, {
      global: {
        stubs: {
          ...ElementPlusStubs,
          RouterLink: RouterLinkStub,
          FileUploader: true,
        },
      },
    });
    const err = new Error("nope");
    wrapper.vm.handleUploadError(err);
    expect(mocks.notify).toHaveBeenCalledWith(err, {
      fallback: "Failed to upload files",
    });
  });

  it("avatar editor reports why an upload failed", async () => {
    const err = new Error("nope");
    const wrapper = mount(AvatarUpload, {
      props: {
        entityName: "alice",
        entityType: "user",
        uploadFunction: vi.fn().mockRejectedValue(err),
        deleteFunction: vi.fn(),
      },
      global: { stubs: { ...ElementPlusStubs, "cropper-canvas": true } },
    });
    wrapper.vm.cropperSelection = {
      $toCanvas: async () => ({
        toBlob: (cb) => cb(new Blob(["x"], { type: "image/jpeg" })),
      }),
    };
    await wrapper.vm.handleCrop();
    await flushPromises();
    expect(mocks.notify).toHaveBeenCalledWith(err, {
      fallback: "Failed to upload avatar",
    });
  });
});
