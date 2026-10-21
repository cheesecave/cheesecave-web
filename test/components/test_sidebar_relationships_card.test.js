import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import SidebarRelationshipsCard from "@/components/repo/metadata/SidebarRelationshipsCard.vue";
import { RouterLinkStub } from "../helpers/vue";

function render(props = {}) {
  return mount(SidebarRelationshipsCard, {
    props: {
      namespace: "acme-labs",
      namespaceLink: "/organizations/acme-labs",
      repoType: "dataset",
      ...props,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

const labels = (wrapper) =>
  wrapper.findAll(".text-xs.mb-1").map((node) => node.text());

describe("the Relationships card names the author and, when known, who created it", () => {
  it("keeps the author as it was: the account or organization of the namespace", () => {
    const wrapper = render();

    expect(labels(wrapper)).toEqual(["Author:"]);
    const link = wrapper.getComponent(RouterLinkStub);
    expect(link.props("to")).toBe("/organizations/acme-labs");
    expect(link.text()).toBe("acme-labs");
  });

  it("adds Created By with the person, linked to their profile, after the author", () => {
    const wrapper = render({
      createdBy: { username: "alice", full_name: "Alice A", is_org: false },
    });

    expect(labels(wrapper)).toEqual(["Author:", "Created By:"]);
    const links = wrapper.findAllComponents(RouterLinkStub);
    expect(links).toHaveLength(2);
    expect(links[0].text()).toBe("acme-labs");
    expect(links[1].props("to")).toBe("/alice");
    expect(links[1].text()).toBe("alice");
  });

  it("hides Created By when there is no creator, or no name to show", () => {
    for (const createdBy of [undefined, null, {}, { username: "" }]) {
      expect(labels(render({ createdBy }))).toEqual(["Author:"]);
    }
  });
});
