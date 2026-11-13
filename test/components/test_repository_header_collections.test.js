import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { RouterLinkStub } from "../helpers/vue";
import RepositoryHeader from "@/components/repo/RepositoryHeader.vue";

function mountHeader(props = {}, visibility = null) {
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
      provide: { repositoryAccess: ref(visibility ? { visibility } : null) },
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
  it("renders Settings once in section navigation with its active state", () => {
    const path = "/models/alice/bert/settings";
    const w = mountHeader({
      isOwner: true,
      activeTab: "settings",
      tabs: [{ key: "settings", label: "Settings", to: path }],
    });
    const settings = w.findAll(`a[href="${path}"]`);
    expect(settings).toHaveLength(1);
    expect(
      w
        .get('nav[aria-label="Repository sections"] a')
        .attributes("aria-current"),
    ).toBe("page");
    expect(w.find('.repository-actions a[href$="/settings"]').exists()).toBe(
      false,
    );
    expect(w.get(".repository-tab .i-carbon-settings").exists()).toBe(true);
    w.unmount();
  });

  it("labels an invite repository using the separate browser access state", () => {
    const w = mountHeader({ repoInfo: { private: true } }, "invite");
    expect(w.get('[aria-label="Invite repository"]').text()).toContain(
      "Invite",
    );
    expect(w.find("[data-add-menu]").exists()).toBe(false);
  });
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
