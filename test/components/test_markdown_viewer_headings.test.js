// MarkdownViewer hands `headingOffset` to the renderer, so a README under a page's own <h1> starts at <h2>.

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import MarkdownViewer from "@/components/common/MarkdownViewer.vue";

describe("MarkdownViewer heading levels", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const mountViewer = (props) =>
    mount(MarkdownViewer, {
      props: { content: "# Card\n\n## Usage\n", ...props },
    });

  it("renders the headings as written by default", () => {
    const wrapper = mountViewer();
    expect(wrapper.findAll("h1")).toHaveLength(1);
    expect(wrapper.findAll("h2")).toHaveLength(1);
  });

  it("moves them down by headingOffset", () => {
    const wrapper = mountViewer({ headingOffset: 1 });
    expect(wrapper.findAll("h1")).toHaveLength(0);
    expect(wrapper.get("h2").text()).toBe("Card");
    expect(wrapper.get("h3").text()).toBe("Usage");
  });
});
