// Component tests for ZipPasswordForm.vue — the one-time password prompt
// TarBrowserPanel shows before listing an encrypted zip.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { ElementPlusStubs } from "../helpers/vue";

import ZipPasswordForm from "@/components/repo/preview/ZipPasswordForm.vue";

function mountForm(props = {}) {
  return mount(ZipPasswordForm, {
    props: { message: "This zip is password-protected.", ...props },
    global: { stubs: ElementPlusStubs },
  });
}

describe("ZipPasswordForm", () => {
  it("renders the message and a masked password input", () => {
    const wrapper = mountForm();
    expect(wrapper.text()).toContain("This zip is password-protected.");
    const input = wrapper.get("input");
    expect(input.attributes("type")).toBe("password");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("emits the typed password on submit and ignores an empty one", async () => {
    const wrapper = mountForm();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get("input").setValue("secret");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toEqual([["secret"]]);
  });

  it("does not submit again while busy and shows the error", async () => {
    const wrapper = mountForm({
      busy: true,
      error: "Wrong password, try again.",
    });
    await wrapper.get("input").setValue("secret");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Wrong password, try again.",
    );
    expect(wrapper.get("button").attributes("data-loading")).toBe("true");
  });
});
