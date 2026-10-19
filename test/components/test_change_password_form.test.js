// Settings > Security: change the password of the signed-in account.

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElementPlusStubs, InvalidElFormStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  success: vi.fn(),
  authAPI: { changePassword: vi.fn() },
}));

vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
vi.mock("@/utils/api", () => ({ authAPI: mocks.authAPI }));
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessage: Object.assign(vi.fn(), { success: mocks.success, error: vi.fn() }),
}));

import ChangePasswordForm from "@/components/settings/ChangePasswordForm.vue";

const httpFailure = (status) =>
  Object.assign(new Error("x"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });

const mountForm = (stubs = {}) =>
  mount(ChangePasswordForm, { global: { stubs: { ...ElementPlusStubs, ...stubs } } });
const fill = async (wrapper, current = "old-password-1", next = "new-password-1", again = next) => {
  await wrapper.get('input[placeholder="Current password"]').setValue(current);
  await wrapper.get('input[placeholder="New password"]').setValue(next);
  await wrapper.get('input[placeholder="Repeat the new password"]').setValue(again);
};
const submit = (wrapper) =>
  wrapper
    .findAll("button")
    .find((button) => button.text().includes("Change password"))
    .trigger("click");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authAPI.changePassword.mockResolvedValue({ data: { success: true } });
});

describe("changing the password", () => {
  it("sends the current and the new password, says so, and empties the form", async () => {
    const wrapper = mountForm();
    await fill(wrapper);

    await submit(wrapper);
    await flushPromises();

    expect(mocks.authAPI.changePassword).toHaveBeenCalledWith({
      current_password: "old-password-1",
      new_password: "new-password-1",
    });
    expect(mocks.success).toHaveBeenCalledWith("Password changed. Your other devices were signed out.");
    for (const placeholder of ["Current password", "New password", "Repeat the new password"])
      expect(wrapper.get(`input[placeholder="${placeholder}"]`).element.value).toBe("");
    expect(wrapper.find('[data-testid="current-password-error"]').exists()).toBe(false);
  });

  it("says what happens to other devices and to access tokens, so nobody is surprised", () => {
    const text = mountForm().text();

    expect(text).toContain("other devices are signed out");
    expect(text).toContain("Access tokens keep working");
    expect(text).toContain("at least 8 characters");
  });

  it("sends nothing while the form is not valid", async () => {
    const wrapper = mountForm({ ElForm: InvalidElFormStub });
    await fill(wrapper);

    await submit(wrapper);
    await flushPromises();

    expect(mocks.authAPI.changePassword).not.toHaveBeenCalled();
  });

  it("tells the person, next to the field, that the current password was wrong, and keeps the form", async () => {
    mocks.authAPI.changePassword.mockRejectedValue(httpFailure(403));
    const wrapper = mountForm();
    await fill(wrapper);

    await submit(wrapper);
    await flushPromises();

    expect(wrapper.get('[data-testid="current-password-error"]').text()).toBe("Current password is incorrect");
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(wrapper.get('input[placeholder="New password"]').element.value).toBe("new-password-1");
  });

  it("clears the wrong-password note when the person tries again", async () => {
    mocks.authAPI.changePassword.mockRejectedValueOnce(httpFailure(403));
    const wrapper = mountForm();
    await fill(wrapper);
    await submit(wrapper);
    await flushPromises();
    expect(wrapper.find('[data-testid="current-password-error"]').exists()).toBe(true);

    await submit(wrapper);
    await flushPromises();

    expect(wrapper.find('[data-testid="current-password-error"]').exists()).toBe(false);
  });

  it("reports any other failure the usual way", async () => {
    mocks.authAPI.changePassword.mockRejectedValue(httpFailure(500));
    const wrapper = mountForm();
    await fill(wrapper);

    await submit(wrapper);
    await flushPromises();

    expect(mocks.notify).toHaveBeenCalledWith(expect.any(Error), {
      fallback: "Failed to change the password",
    });
    expect(wrapper.find('[data-testid="current-password-error"]').exists()).toBe(false);
  });

  it("holds the server's rules for the new password, a repeat that matches, and asks for the current one", async () => {
    const wrapper = mountForm();
    const rules = wrapper.findComponent({ name: "ElForm" }).props("rules");
    const check = async (field, ...args) => {
      let result;
      await rules[field].find((rule) => rule.validator).validator({}, ...args, (error) => (result = error));
      return result?.message ?? null;
    };

    expect(rules.current[0].required).toBe(true);
    expect(await check("next", "short")).toBe("Password must be at least 8 characters");
    expect(await check("next", "new-password-1")).toBeNull();
    expect(await check("again", "")).toBe("Please repeat the password");
    await wrapper.get('input[placeholder="New password"]').setValue("new-password-1");
    expect(await check("again", "different-one-1")).toBe("The two passwords do not match");
    expect(await check("again", "new-password-1")).toBeNull();
  });
});
