import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { RouterLinkStub } from "../helpers/vue";
import RepositoryHeader from "@/components/repo/RepositoryHeader.vue";

function mountHeader(props = {}) {
  return mount(RepositoryHeader, {
    props: {
      repoType: "model",
      namespace: "alice",
      name: "bert",
      namespaceLink: "/alice",
      tabs: [{ id: "card", label: "Model card" }],
      activeTab: "card",
      repoInfo: { private: false },
      signedIn: true,
      ...props,
    },
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        AddToCollectionMenu: {
          props: ["repoType", "repoId"],
          template:
            '<i data-add-menu :data-type="repoType" :data-id="repoId" />',
        },
      },
    },
  });
}

describe("the repository header and collections", () => {
  it("offers 'Add to collection' for the repository to someone who is signed in", () => {
    const menu = mountHeader().get("[data-add-menu]");
    expect(menu.attributes("data-type")).toBe("model");
    expect(menu.attributes("data-id")).toBe("alice/bert");
  });

  it.each([
    ["signed out", { signedIn: false }],
    [
      "private (a collection could show it to people who may not read it)",
      { repoInfo: { private: true } },
    ],
    ["not loaded yet", { repoInfo: null }],
  ])("offers nothing while the repository is %s", (_why, props) => {
    expect(mountHeader(props).find("[data-add-menu]").exists()).toBe(false);
  });
});
