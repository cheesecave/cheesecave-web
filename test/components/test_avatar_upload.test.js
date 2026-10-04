import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("cropperjs", () => ({}));
vi.mock("element-plus", async (original) => ({
  ...(await original()),
  ElMessage: { success: mocks.success, error: mocks.error },
  ElMessageBox: { confirm: mocks.confirm },
}));
import AvatarUpload from "@/components/profile/AvatarUpload.vue";

describe("avatar edit cache refresh", () => {
  const wrappers = [];
  const render = (component, options) => {
    const wrapper = mount(component, options);
    wrappers.push(wrapper);
    return wrapper;
  };
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(["user", "org"])(
    "refreshes the mounted %s avatar only after a successful upload and deletion",
    async (entityType) => {
      const username = `edited-${entityType}`;
      const avatar = render(EntityAvatar, {
        props: { username, isOrg: entityType === "org" },
      });
      const uploadFunction = vi.fn().mockResolvedValue(undefined);
      const deleteFunction = vi.fn().mockResolvedValue(undefined);
      const editor = render(AvatarUpload, {
        props: {
          entityName: username,
          entityType,
          uploadFunction,
          deleteFunction,
        },
        global: {
          stubs: {
            ...ElementPlusStubs,
            "cropper-canvas": true,
            "cropper-image": true,
            "cropper-shade": true,
            "cropper-handle": true,
            "cropper-selection": true,
            "cropper-grid": true,
            "cropper-crosshair": true,
          },
        },
      });
      const oldSource = avatar.get("img").attributes("src");
      editor.vm.cropperSelection = {
        $toCanvas: async () => ({
          toBlob: (callback) =>
            callback(new Blob(["jpeg"], { type: "image/jpeg" })),
        }),
      };
      await editor.vm.handleCrop();
      await flushPromises();
      expect(uploadFunction).toHaveBeenCalledWith(username, expect.any(File));
      const uploadedSource = avatar.get("img").attributes("src");
      expect(uploadedSource).not.toBe(oldSource);
      expect(editor.get('img[alt="Current avatar"]').attributes("src")).toBe(
        uploadedSource,
      );
      expect(editor.emitted("uploaded")).toHaveLength(1);

      mocks.confirm.mockResolvedValue(undefined);
      deleteFunction.mockRejectedValueOnce(new Error("offline"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await editor.vm.handleDelete();
      await flushPromises();
      expect(avatar.get("img").attributes("src")).toBe(uploadedSource);
      expect(editor.emitted("deleted")).toBeUndefined();
      expect(consoleError).toHaveBeenCalled();

      await editor.vm.handleDelete();
      await flushPromises();
      expect(avatar.get("img").attributes("src")).not.toBe(uploadedSource);
      expect(editor.emitted("deleted")).toHaveLength(1);
      await avatar.get("img").trigger("error");
      expect(avatar.text()).toBe("ED");
    },
  );
});
