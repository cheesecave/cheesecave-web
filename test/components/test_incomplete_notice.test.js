// The notice that a list is incomplete because an external source could not be reached.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IncompleteNotice from "@/components/common/IncompleteNotice.vue";

describe("IncompleteNotice", () => {
  it("shows nothing when every source answered", () => {
    expect(
      mount(IncompleteNotice).find("[data-testid=incomplete-notice]").exists(),
    ).toBe(false);
    expect(
      mount(IncompleteNotice, { props: { sources: [] } })
        .find("[data-testid=incomplete-notice]")
        .exists(),
    ).toBe(false);
  });

  it("names the sources that were left out, as a status message", () => {
    const wrapper = mount(IncompleteNotice, {
      props: { sources: ["HuggingFace", "Mirror"] },
    });
    const notice = wrapper.get("[data-testid=incomplete-notice]");

    expect(notice.attributes("role")).toBe("status");
    expect(notice.text()).toContain("HuggingFace, Mirror");
    expect(notice.text()).toMatch(/incomplete/i);
  });
});
