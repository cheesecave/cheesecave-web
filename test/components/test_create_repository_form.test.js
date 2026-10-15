import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
import { CreationFormStub } from "../helpers/creation-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getUserOrgs: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/utils/api", () => ({
  repoAPI: { create: mocks.create },
  orgAPI: { getUserOrgs: mocks.getUserOrgs },
}));
vi.mock("vue-router/auto", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("element-plus", () => ({
  ElMessage: { success: mocks.success, error: mocks.error },
}));
import CreateRepositoryForm from "@/components/repo/CreateRepositoryForm.vue";
import { useAuthStore } from "@/stores/auth";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("shared repository creation form", () => {
  const wrappers = [];
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAuthStore().user = { username: "alice" };
    mocks.getUserOrgs.mockResolvedValue({ data: { organizations: [] } });
    mocks.create.mockResolvedValue({ data: {} });
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
  function mountForm(props = {}) {
    const wrapper = mount(CreateRepositoryForm, {
      props,
      global: { stubs: { ...ElementPlusStubs, ElForm: CreationFormStub } },
    });
    wrappers.push(wrapper);
    return wrapper;
  }
  function button(wrapper, label) {
    return wrapper
      .findAll("button")
      .find((item) => item.text().includes(label));
  }

  it("uses the same organization, visibility, validation and fallback redirect for a fixed type", async () => {
    mocks.getUserOrgs.mockResolvedValue({
      data: {
        organizations: [
          { name: "team", role: "member" },
          { name: "visitors", role: "visitor" },
        ],
      },
    });
    const wrapper = mountForm({ fixedType: "dataset", compact: true });
    await flushPromises();
    expect(wrapper.find('[data-el-form-item][prop="type"]').exists()).toBe(
      false,
    );
    // Backend namespace creation currently permits every organization membership.
    expect(
      wrapper.findAll("option").map((option) => option.element.value),
    ).toEqual(["alice", "team", "visitors"]);
    await wrapper.get('select[aria-label="Select owner"]').setValue("team");
    await wrapper.get('input[placeholder="my-dataset"]').setValue("data.v1");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, "Create Dataset").trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({
      type: "dataset",
      name: "data.v1",
      organization: "team",
      private: true,
    });
    expect(mocks.push).toHaveBeenCalledWith("/datasets/team/data.v1");
    expect(wrapper.emitted("created")).toEqual([
      [{ type: "dataset", repoId: "team/data.v1" }],
    ]);
  });

  it("cancels and resets a draft without submitting", async () => {
    const wrapper = mountForm();
    await flushPromises();
    await wrapper
      .get('input[placeholder="my-awesome-model"]')
      .setValue("draft");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, "Cancel").trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(
      wrapper.get('input[placeholder="my-awesome-model"]').element.value,
    ).toBe("");
    expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("says so when the user's organizations cannot be listed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUserOrgs.mockRejectedValueOnce(new Error("down"));
    mountForm({ initialType: "space" });
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to load your organizations"),
      }),
    );
  });

  it("keeps draft text on failure and permits correcting it before retry", async () => {
    mocks.create.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        headers: {},
        data: { detail: { error: "Quota exceeded" } },
      },
    });
    const wrapper = mountForm({ initialType: "space" });
    await flushPromises();
    await wrapper.get('input[placeholder="my-awesome-space"]').setValue("demo");
    await button(wrapper, "Create Space").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to create space: Quota exceeded"),
      }),
    );
    expect(
      wrapper.get('input[placeholder="my-awesome-space"]').element.value,
    ).toBe("demo");
    expect(mocks.push).not.toHaveBeenCalled();
    await button(wrapper, "Create Space").trigger("click");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith("/spaces/alice/demo");
  });

  describe("the SDK of a Space", () => {
    const sdkSelect = (wrapper) => wrapper.find('select[aria-label="Select SDK"]');

    it("asks for an SDK, Gradio unless chosen otherwise, only when creating a Space", async () => {
      const space = mountForm({ fixedType: "space" });
      const model = mountForm({ fixedType: "model" });
      const dataset = mountForm({ fixedType: "dataset" });
      await flushPromises();

      expect(sdkSelect(space).exists()).toBe(true);
      expect(sdkSelect(space).element.value).toBe("gradio");
      expect(sdkSelect(space).findAll("option").map((o) => [o.element.value, o.text()])).toEqual([
        ["gradio", "Gradio"],
        ["streamlit", "Streamlit"],
        ["docker", "Docker"],
        ["static", "Static"],
      ]);
      expect(sdkSelect(model).exists()).toBe(false);
      expect(sdkSelect(dataset).exists()).toBe(false);
    });

    it("sends the chosen SDK, so the Space starts with the card that names it", async () => {
      const wrapper = mountForm({ fixedType: "space" });
      await flushPromises();
      await wrapper.get('input[placeholder="my-space"], input[placeholder="my-awesome-space"]').setValue("demo");
      await sdkSelect(wrapper).setValue("static");
      await button(wrapper, "Create Space").trigger("click");
      await flushPromises();

      expect(mocks.create).toHaveBeenCalledWith({ type: "space", name: "demo", organization: null, private: false, sdk: "static" });
    });

    it("sends Gradio when the choice was not touched", async () => {
      const wrapper = mountForm({ fixedType: "space" });
      await flushPromises();
      await wrapper.get('input[placeholder="my-space"], input[placeholder="my-awesome-space"]').setValue("demo");
      await button(wrapper, "Create Space").trigger("click");
      await flushPromises();

      expect(mocks.create.mock.calls[0][0].sdk).toBe("gradio");
    });

    it("sends no sdk for a model or a dataset, and not after the type changed from Space", async () => {
      const wrapper = mountForm({ initialType: "space" });
      await flushPromises();
      await sdkSelect(wrapper).setValue("docker");
      await wrapper.setProps({ initialType: "model" });
      await wrapper.get('input[placeholder="my-model"], input[placeholder="my-awesome-model"]').setValue("m");
      await button(wrapper, "Create Model").trigger("click");
      await flushPromises();

      expect(sdkSelect(wrapper).exists()).toBe(false);
      expect(mocks.create).toHaveBeenCalledWith({ type: "model", name: "m", organization: null, private: false });
    });

    it("goes back to Gradio when the form is cancelled", async () => {
      const wrapper = mountForm({ fixedType: "space" });
      await flushPromises();
      await sdkSelect(wrapper).setValue("streamlit");
      await button(wrapper, "Cancel").trigger("click");

      expect(sdkSelect(wrapper).element.value).toBe("gradio");
    });
  });

  it("clears account drafts and ignores late organization and creation responses", async () => {
    const oldOrganizations = deferred();
    const oldCreation = deferred();
    mocks.getUserOrgs.mockReturnValueOnce(oldOrganizations.promise);
    mocks.create.mockReturnValueOnce(oldCreation.promise);
    const wrapper = mountForm();
    await wrapper
      .get('input[placeholder="my-awesome-model"]')
      .setValue("private-draft");
    await button(wrapper, "Create Model").trigger("click");
    useAuthStore().user = { username: "bob" };
    await flushPromises();
    expect(
      wrapper.get('input[placeholder="my-awesome-model"]').element.value,
    ).toBe("");
    expect(wrapper.get('select[aria-label="Select owner"]').element.value).toBe(
      "bob",
    );
    oldOrganizations.resolve({
      data: { organizations: [{ name: "alice-team" }] },
    });
    oldCreation.resolve({ data: { repo_id: "alice/private-draft" } });
    await flushPromises();
    expect(wrapper.text()).not.toContain("alice-team");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not redirect or report success after a pending form is cancelled", async () => {
    const pending = deferred();
    mocks.create.mockReturnValueOnce(pending.promise);
    const wrapper = mountForm();
    await wrapper
      .get('input[placeholder="my-awesome-model"]')
      .setValue("draft");
    await button(wrapper, "Create Model").trigger("click");
    await button(wrapper, "Cancel").trigger("click");
    pending.resolve({ data: { repo_id: "alice/draft" } });
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not expose organizations cached for a logged-out account", async () => {
    const auth = useAuthStore();
    auth.userOrganizations = [{ name: "private-team" }];
    auth.user = null;
    const wrapper = mountForm();
    await flushPromises();
    expect(wrapper.text()).not.toContain("private-team");
    expect(mocks.getUserOrgs).not.toHaveBeenCalled();
  });
});
