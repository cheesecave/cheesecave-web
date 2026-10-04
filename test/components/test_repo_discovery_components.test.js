import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RepoFilterPanel from "@/components/discovery/RepoFilterPanel.vue";
import RepoDiscoveryCard from "@/components/discovery/RepoDiscoveryCard.vue";
import RepositoryCard from "@/components/repo/RepositoryCard.vue";
import { RouterLinkStub } from "../helpers/vue";

function facets() {
  return [
    {
      key: "task",
      label: "Tasks",
      options: Array.from({ length: 10 }, (_, index) => ({
        value: `task-${index}`,
        label: `Task ${index}`,
        count: index + 1,
      })),
    },
    {
      key: "library",
      label: "Libraries",
      options: [{ value: "transformers", label: "Transformers", count: 2400 }],
    },
    { key: "license", label: "Licenses", options: [] },
  ];
}

describe("RepoFilterPanel", () => {
  it("groups actual facets and emits repeated toggles without mutating selected values", async () => {
    const selected = { task: ["task-0", "task-1"], library: ["transformers"] };
    const wrapper = mount(RepoFilterPanel, {
      props: { facets: facets(), selected },
    });
    expect(
      wrapper
        .findAll(".facet-group")
        .map((group) => group.attributes("aria-label")),
    ).toEqual(["Tasks", "Libraries"]);
    expect(wrapper.get(".selection-count").text()).toBe("3");
    expect(
      wrapper
        .get('[aria-label="Tasks"] .facet-chip')
        .attributes("aria-pressed"),
    ).toBe("true");
    const chip = wrapper.get('[aria-label="Tasks"] .facet-chip');
    await chip.trigger("click");
    await chip.trigger("click");
    expect(wrapper.emitted("toggle")).toEqual([
      [{ key: "task", value: "task-0" }],
      [{ key: "task", value: "task-0" }],
    ]);
    expect(selected.task).toEqual(["task-0", "task-1"]);
    await wrapper.setProps({ selected: { task: ["task-1"] } });
    expect(chip.attributes("aria-pressed")).toBe("false");
    expect(wrapper.get(".selection-count").text()).toBe("1");
    await wrapper.get(".clear-filters").trigger("click");
    expect(wrapper.emitted("clear")).toEqual([[]]);
    wrapper.unmount();
  });

  it("expands long groups, searches all options, and switches categories", async () => {
    const wrapper = mount(RepoFilterPanel, { props: { facets: facets() } });
    expect(wrapper.findAll('[aria-label="Tasks"] .facet-chip')).toHaveLength(8);
    const more = wrapper.get('[aria-label="Show more Tasks filters"]');
    expect(more.attributes("aria-expanded")).toBe("false");
    await more.trigger("click");
    expect(wrapper.findAll('[aria-label="Tasks"] .facet-chip')).toHaveLength(
      10,
    );
    await wrapper
      .get('[aria-label="Show fewer Tasks filters"]')
      .trigger("click");
    expect(wrapper.findAll('[aria-label="Tasks"] .facet-chip')).toHaveLength(8);
    await wrapper
      .get('input[aria-label="Search filters"]')
      .setValue(" TASK-9 ");
    expect(wrapper.findAll(".facet-chip")).toHaveLength(1);
    expect(wrapper.get(".facet-label").text()).toBe("Task 9");
    expect(wrapper.find(".facet-more").exists()).toBe(false);
    await wrapper.get('input[aria-label="Search filters"]').setValue("");
    const libraries = wrapper
      .findAll(".filter-categories button")
      .find((button) => button.text() === "Libraries");
    await libraries.trigger("click");
    expect(libraries.attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAll(".facet-group")).toHaveLength(1);
    expect(wrapper.get(".facet-count").text()).toBe("2,400");
    await wrapper.setProps({ facets: [facets()[0]] });
    expect(
      wrapper.get(".filter-categories button").attributes("aria-pressed"),
    ).toBe("true");
    expect(wrapper.get(".facet-group").attributes("aria-label")).toBe("Tasks");
    wrapper.unmount();
  });

  it("distinguishes unavailable facets from a search with no matches", async () => {
    const wrapper = mount(RepoFilterPanel);
    expect(wrapper.text()).toContain(
      "No filters available for these repositories.",
    );
    expect(wrapper.find(".clear-filters").exists()).toBe(false);
    await wrapper.setProps({ facets: facets() });
    await wrapper.get('input[aria-label="Search filters"]').setValue("missing");
    expect(wrapper.get('.filter-empty[role="status"]').text()).toBe(
      "No matching filters.",
    );
    wrapper.unmount();
  });

  it("uses the exact facet value when the API omits its optional display label", () => {
    const wrapper = mount(RepoFilterPanel, {
      props: {
        facets: [
          {
            key: "license",
            label: "Licenses",
            options: [{ value: "apache-2.0", count: 2 }],
          },
        ],
      },
    });
    expect(wrapper.get(".facet-label").text()).toBe("apache-2.0");
    expect(wrapper.get(".facet-chip").attributes("title")).toBe("apache-2.0");
    wrapper.unmount();
  });
});

function mountCard(repo, repoType = "model") {
  return mount(RepoDiscoveryCard, {
    props: { repo, repoType },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

describe("RepoDiscoveryCard", () => {
  it("preserves discovery navigation and default stats through the shared RepositoryCard", () => {
    const repo = {
      id: "team/shared-model",
      private: true,
      downloads: 12,
      likes: 5,
    };
    const wrapper = mountCard(repo);
    const card = wrapper.getComponent(RepositoryCard);
    expect(card.props("repo")).toEqual(repo);
    expect(card.props("repoType")).toBe("model");
    expect(card.props("showStats")).toBe(true);
    expect(wrapper.get("a").classes()).toContain("repo-discovery-card");
    expect(wrapper.get("a").classes()).toContain("repository-card");
    expect(wrapper.get("a").attributes("href")).toBe(
      "/models/team/shared-model",
    );
    expect(wrapper.get('[aria-label="12 downloads"]').text()).toBe("12");
    expect(wrapper.get('[aria-label="5 likes"]').text()).toBe("5");
    wrapper.unmount();
  });

  it("supports event repositories without inventing stats and can show actual stats later", async () => {
    const wrapper = mount(RepositoryCard, {
      props: {
        repo: { id: "team/model", private: true },
        repoType: "model",
        showStats: false,
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(wrapper.get("a").attributes("href")).toBe("/models/team/model");
    expect(wrapper.text()).toContain("Private");
    expect(wrapper.find(".repo-card-stats").exists()).toBe(false);
    expect(wrapper.find('[aria-label="0 downloads"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="0 likes"]').exists()).toBe(false);
    await wrapper.setProps({
      repo: { id: "team/model", downloads: 40, likes: 3 },
      showStats: true,
    });
    expect(wrapper.get('[aria-label="40 downloads"]').text()).toBe("40");
    expect(wrapper.get('[aria-label="3 likes"]').text()).toBe("3");
    wrapper.unmount();
  });
  it.each(["model", "dataset", "space"])(
    "links the whole %s card with encoded identifiers and plain metadata",
    (repoType) => {
      const id = "team/name?#<script>";
      const wrapper = mountCard(
        {
          id,
          private: true,
          facets: {
            task: ["<img src=x onerror=alert(1)>"],
            library: ["transformers"],
            license: ["mit"],
          },
          downloads: 2400,
          likes: 19,
          lastModified: "2026-10-03T00:00:00Z",
        },
        repoType,
      );
      expect(wrapper.get("a").attributes("href")).toBe(
        `/${repoType}s/team/name%3F%23%3Cscript%3E`,
      );
      expect(wrapper.findAll("a")).toHaveLength(1);
      expect(wrapper.find("button").exists()).toBe(false);
      expect(wrapper.get("h3").text()).toBe(id);
      expect(wrapper.get(".repo-private").text()).toBe("Private");
      expect(wrapper.get(".repo-card-metadata").text().toLowerCase()).toContain(
        "<img src=x onerror=alert(1)>",
      );
      expect(wrapper.find("img").exists()).toBe(false);
      expect(wrapper.get('[aria-label="2,400 downloads"]').text()).toBe("2.4K");
      expect(wrapper.get('[aria-label="19 likes"]').text()).toBe("19");
      expect(wrapper.get(".repo-updated").text()).toContain("Updated");
      wrapper.unmount();
    },
  );

  it("uses real README metadata aliases and prefers indexed facets", () => {
    const wrapper = mountCard({
      id: "alice/model",
      facets: { task: ["text-generation"] },
      metadata: {
        pipeline_tag: "image-to-text",
        library_name: "transformers",
        license: "apache-2.0",
      },
    });
    expect(
      wrapper.findAll(".repo-card-metadata span").map((item) => item.text()),
    ).toEqual(["Text Generation", "Transformers", "Apache License 2.0"]);
    expect(wrapper.find(".repo-private").exists()).toBe(false);
    wrapper.unmount();
    const dataset = mountCard(
      {
        id: "alice/data",
        metadata: {
          task_categories: ["image-classification"],
          framework: "pytorch",
        },
        likes: -1,
        downloads: NaN,
      },
      "dataset",
    );
    expect(dataset.text()).toContain("Image Classification");
    expect(dataset.text()).toContain("PyTorch");
    expect(dataset.get('[aria-label="0 downloads"]').text()).toBe("0");
    expect(dataset.get('[aria-label="0 likes"]').text()).toBe("0");
    expect(dataset.find(".repo-updated").exists()).toBe(false);
    dataset.unmount();
  });

  it("omits absent metadata rather than inventing tasks or libraries", () => {
    const wrapper = mountCard({
      id: "alice/minimal",
      metadata: { task: [], library: {}, license: null },
    });
    expect(wrapper.find(".repo-card-metadata").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows actual Space SDK metadata and prefers the indexed SDK", () => {
    const wrapper = mountCard(
      { id: "alice/demo", metadata: { sdk: "gradio" } },
      "space",
    );
    expect(wrapper.get('[title="sdk: Gradio"]').text()).toBe("Gradio");
    wrapper.unmount();
    const indexed = mountCard(
      {
        id: "alice/demo",
        facets: { sdk: ["streamlit"] },
        metadata: { sdk: "gradio" },
      },
      "space",
    );
    expect(indexed.get('[title="sdk: Streamlit"]').text()).toBe("Streamlit");
    expect(indexed.text()).not.toContain("Gradio");
    indexed.unmount();
    const model = mountCard({ id: "alice/model", metadata: { sdk: "gradio" } });
    expect(model.find(".repo-card-metadata").exists()).toBe(false);
    model.unmount();
  });
});
