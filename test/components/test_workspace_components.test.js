import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { h } from "vue";
import { RouterLinkStub, ElementPlusStubs } from "../helpers/vue";
import WorkspaceSidebar from "@/components/home/workspace/WorkspaceSidebar.vue";
import WorkspaceFeed from "@/components/home/workspace/WorkspaceFeed.vue";
import WorkspaceTrending from "@/components/home/workspace/WorkspaceTrending.vue";
import WorkspaceActivityCard from "@/components/home/workspace/WorkspaceActivityCard.vue";
import WorkspaceCommitDetail from "@/components/home/workspace/WorkspaceCommitDetail.vue";
import RepositoryCard from "@/components/repo/RepositoryCard.vue";
import RepositoryStats from "@/components/repo/RepositoryStats.vue";
import RepoDiscoveryCard from "@/components/discovery/RepoDiscoveryCard.vue";

describe("workspace sections", () => {
  const wrappers = [];
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
  function render(component, props, slots = {}) {
    const wrapper = mount(component, {
      props,
      slots,
      global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
    });
    wrappers.push(wrapper);
    return wrapper;
  }

  function activity(overrides = {}) {
    return {
      id: "commit:1",
      kind: "commit",
      created_at: "2026-10-04T03:04:05Z",
      actor: { username: "alice", full_name: "Alice", is_org: false },
      namespace: { username: "different-owner", is_org: true },
      repository: {
        id: "different-owner/project",
        type: "model",
        private: true,
      },
      commit: {
        sha: "abcdef123456",
        message: "Commit summary\n<script>alert(1)</script>",
      },
      ...overrides,
    };
  }

  it("composes repository and details named slots without coupling the event header to a repository renderer", () => {
    const item = activity();
    const wrapper = render(
      WorkspaceActivityCard,
      { item },
      {
        repository: ({ repository }) =>
          h("aside", { "data-custom-repository": "true" }, repository.id),
        details: () =>
          h(
            "p",
            { "data-custom-details": "true" },
            "A different details renderer",
          ),
      },
    );
    const heading = wrapper.get(".activity-heading");
    expect(heading.text().replace(/\s+/g, " ")).toContain(
      "Alice updated a Model",
    );
    expect(heading.text()).not.toContain("different-owner");
    expect(heading.get("time").attributes("datetime")).toBe(
      "2026-10-04T03:04:05.000Z",
    );
    expect(heading.get("time").attributes("title")).toBe(
      "2026-10-04 03:04:05 UTC",
    );
    expect(wrapper.get("[data-custom-repository]").text()).toBe(
      item.repository.id,
    );
    expect(wrapper.get("[data-custom-details]").text()).toBe(
      "A different details renderer",
    );
    expect(wrapper.findComponent(RepositoryCard).exists()).toBe(false);
    expect(wrapper.findComponent(WorkspaceCommitDetail).exists()).toBe(false);
    const headerOnly = render(WorkspaceActivityCard, { item });
    expect(headerOnly.text()).not.toContain(item.repository.id);
    expect(headerOnly.text()).not.toContain(item.commit.message);
    expect(headerOnly.find(".activity-repository").exists()).toBe(false);
    expect(headerOnly.find(".activity-details").exists()).toBe(false);
  });

  it.each([
    [
      "commit",
      "model",
      {
        username: "alice",
        full_name: "Alice",
        is_org: false,
        avatar_url: "/images/alice.png",
      },
      "/alice",
      "/images/alice.png",
      "AL",
      "Alice updated a Model",
    ],
    [
      "like",
      "dataset",
      { username: "contributors", full_name: "Contributors", is_org: true },
      "/organizations/contributors",
      "/api/organizations/contributors/avatar",
      "CO",
      "Contributors liked a Dataset",
    ],
    [
      "repo_created",
      "space",
      { username: "builder", is_org: false },
      "/builder",
      "/api/users/builder/avatar",
      "BU",
      "builder created a Space",
    ],
  ])(
    "renders the provided %s actor, type and avatar independently of the repository owner",
    async (kind, type, actor, path, avatarPath, initials, text) => {
      const wrapper = render(WorkspaceActivityCard, {
        item: activity({
          kind,
          actor,
          repository: { id: "different-owner/project", type },
          commit: null,
        }),
      });
      const heading = wrapper.get(".activity-heading");
      expect(heading.text().replace(/\s+/g, " ")).toContain(text);
      expect(heading.text()).not.toContain("different-owner");
      expect(heading.get(".activity-actor-link").attributes("href")).toBe(path);
      expect(heading.get(".activity-avatar-link").attributes("href")).toBe(
        path,
      );
      const avatar = heading.getComponent({ name: "ElAvatar" });
      expect(avatar.props("src")).toBe(avatarPath);
      await avatar.get("img").trigger("error");
      expect(avatar.text()).toBe(initials);
    },
  );

  it("keeps a missing creation actor unknown rather than attributing creation to the repository namespace", () => {
    const wrapper = render(WorkspaceActivityCard, {
      item: activity({ kind: "repo_created", actor: null, commit: null }),
    });
    const heading = wrapper.get(".activity-heading");
    expect(heading.text().replace(/\s+/g, " ")).toContain(
      "Unknown user created a Model",
    );
    expect(heading.text()).not.toContain("different-owner");
    expect(heading.find("a").exists()).toBe(false);
    expect(heading.getComponent({ name: "ElAvatar" }).props("src")).toBeFalsy();
    expect(heading.find(".i-carbon-user-avatar").exists()).toBe(true);
  });

  it("shares RepositoryCard with discovery and keeps encoded repository and commit links separate", () => {
    const item = activity({
      repository: {
        id: "team/project?#<x>",
        type: "model",
        private: true,
        lastModified: "2026-10-04T05:06:07Z",
        downloads: 17,
        likes: 4,
      },
      commit: { sha: "abc/#?<x>", message: "A commit <img src=x>" },
    });
    const wrapper = render(WorkspaceFeed, { items: [item] });
    const repoCard = wrapper.getComponent(RepositoryCard);
    expect(repoCard.props("repo")).toEqual(item.repository);
    expect(repoCard.props("repoType")).toBe("model");
    expect(repoCard.props("showStats")).toBe(true);
    const repoLink = repoCard.get("a");
    expect(repoLink.attributes("href")).toBe(
      "/models/team/project%3F%23%3Cx%3E",
    );
    expect(repoLink.find("a").exists()).toBe(false);
    expect(repoCard.get(".repo-updated").attributes("title")).toBe(
      item.repository.lastModified,
    );
    expect(repoCard.get(".repo-updated").text()).toMatch(/^Updated /);
    expect(repoCard.get('[aria-label="17 downloads"]').text()).toBe("17");
    expect(repoCard.get('[aria-label="4 likes"]').text()).toBe("4");
    expect(wrapper.find('[aria-label="0 downloads"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="0 likes"]').exists()).toBe(false);
    expect(repoCard.text()).toContain("Private");
    const details = wrapper.getComponent(WorkspaceCommitDetail);
    const commitLink = details.get("a");
    expect(commitLink.attributes("href")).toBe(
      "/models/team/project%3F%23%3Cx%3E/commit/abc%2F%23%3F%3Cx%3E",
    );
    expect(repoLink.element.contains(commitLink.element)).toBe(false);
    expect(details.text()).toContain("A commit <img src=x>");
    expect(details.find("img").exists()).toBe(false);
    const discovery = render(RepoDiscoveryCard, {
      repo: { ...item.repository, downloads: 17, likes: 4 },
      repoType: "model",
    });
    expect(discovery.getComponent(RepositoryCard).props("showStats")).toBe(
      true,
    );
    expect(discovery.get('[aria-label="17 downloads"]').text()).toBe("17");
    expect(discovery.get('[aria-label="4 likes"]').text()).toBe("4");
    expect(discovery.get("a").attributes("href")).toBe(
      repoLink.attributes("href"),
    );
  });

  it.each(["model", "dataset", "space"])(
    "shows and refreshes current %s repository stats separately from activity time",
    async (type) => {
      const item = activity({
        repository: {
          id: "different-owner/project",
          type,
          private: false,
          lastModified: "2026-10-04T05:06:07Z",
          downloads: 2400,
          likes: 19,
        },
      });
      const wrapper = render(WorkspaceFeed, { items: [item] });
      const card = wrapper.getComponent(RepositoryCard);
      expect(card.get(".repo-updated").attributes("title")).toBe(
        item.repository.lastModified,
      );
      expect(card.get('[aria-label="2,400 downloads"]').text()).toBe("2.4K");
      expect(card.get('[aria-label="19 likes"]').text()).toBe("19");
      const eventTime = wrapper
        .get(".activity-heading time")
        .attributes("datetime");
      expect(eventTime).toBe("2026-10-04T03:04:05.000Z");
      await wrapper.setProps({
        items: [
          {
            ...item,
            repository: {
              ...item.repository,
              downloads: 0,
              likes: 0,
              lastModified: "2026-10-04T06:00:00Z",
            },
          },
        ],
      });
      expect(card.get('[aria-label="0 downloads"]').text()).toBe("0");
      expect(card.get('[aria-label="0 likes"]').text()).toBe("0");
      expect(card.get(".repo-updated").attributes("title")).toBe(
        "2026-10-04T06:00:00Z",
      );
      expect(wrapper.get(".activity-heading time").attributes("datetime")).toBe(
        eventTime,
      );
    },
  );

  it("keeps the sidebar scrollbar and emits mobile expansion and search changes", async () => {
    const wrapper = render(WorkspaceSidebar, {
      username: "alice",
      repositories: [{ id: "alice/model", type: "model", private: true }],
    });
    expect(
      wrapper.get(".workspace-personal-view").attributes("aria-label"),
    ).toBe("Workspace navigation");
    expect(wrapper.get(".workspace-personal-wrap").attributes("tabindex")).toBe(
      "0",
    );
    await wrapper.get(".personal-toggle").trigger("click");
    expect(wrapper.emitted("update:expanded")[0]).toEqual([true]);
    await wrapper
      .get('input[aria-label="Find a repository"]')
      .setValue("model");
    expect(wrapper.emitted("update:filter")[0]).toEqual(["model"]);
    expect(wrapper.get('[aria-label="Private"]').exists()).toBe(true);
  });

  it("bounds the personal sidebar to seven repositories and three organizations with incremental organization loading", async () => {
    const repositories = Array.from({ length: 10 }, (_, index) => ({
      id: `alice/repo-${index}`,
      type: "model",
    }));
    const organizations = Array.from({ length: 8 }, (_, index) => ({
      name: `team-${index}`,
      role: "member",
    }));
    const wrapper = render(WorkspaceSidebar, {
      username: "alice",
      repositories,
      organizations,
    });
    expect(
      wrapper.findAll(".workspace-repo").map((link) => link.text()),
    ).toEqual(repositories.slice(0, 7).map((repo) => repo.id));
    expect(wrapper.findAll(".organization-list li")).toHaveLength(3);
    await wrapper.get(".load-organizations").trigger("click");
    expect(wrapper.findAll(".organization-list li")).toHaveLength(6);
    await wrapper.get(".load-organizations").trigger("click");
    expect(wrapper.findAll(".organization-list li")).toHaveLength(8);
    expect(wrapper.find(".load-organizations").exists()).toBe(false);
    await wrapper
      .get('input[aria-label="Find a repository"]')
      .setValue("repo-9");
    expect(wrapper.findAll(".workspace-repo")).toHaveLength(1);
    expect(wrapper.get(".workspace-repo").text()).toBe("alice/repo-9");
    await wrapper.get('input[aria-label="Find a repository"]').setValue("  ");
    expect(wrapper.findAll(".workspace-repo")).toHaveLength(7);
  });

  it("uses the shared avatar endpoints and switches workspace through a dropdown instead of a profile link", async () => {
    const wrapper = render(WorkspaceSidebar, {
      username: "alice",
      organizations: [{ name: "team?#", role: "member" }],
    });
    const trigger = wrapper.get('[aria-label="Select workspace"]');
    expect(trigger.element.tagName).toBe("BUTTON");
    expect(trigger.attributes("href")).toBeUndefined();
    expect(trigger.getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/users/alice/avatar",
    );
    const organization = wrapper.get(".organization-list li");
    expect(organization.getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/organizations/team%3F%23/avatar",
    );
    const dropdown = wrapper.getComponent({ name: "ElDropdown" });
    expect(
      wrapper
        .findAllComponents({ name: "ElDropdownItem" })
        .map((item) => item.attributes("command")),
    ).toEqual(["self", "org:team?#"]);
    dropdown.vm.$emit("command", "org:team?#");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:view")).toEqual([["org:team?#"]]);
    expect(trigger.getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/organizations/team%3F%23/avatar",
    );
    const navigation = wrapper.get(
      '[aria-label="Organization workspace navigation"]',
    );
    expect(
      navigation
        .findAll("a")
        .map((link) => [link.text(), link.attributes("href")]),
    ).toEqual([
      ["View organization", "/organizations/team%3F%23"],
      [
        "Browse organization's repositories",
        "/organizations/team%3F%23#repositories",
      ],
    ]);
    expect(wrapper.find(".workspace-repos").exists()).toBe(false);
    expect(wrapper.find(".organization-list").exists()).toBe(false);
    expect(wrapper.find(".quick-links").exists()).toBe(false);
    expect(wrapper.find(".personal-toggle").exists()).toBe(false);
    dropdown.vm.$emit("command", "self");
    await wrapper.vm.$nextTick();
    expect(
      wrapper.find('[aria-label="Organization workspace navigation"]').exists(),
    ).toBe(false);
    expect(wrapper.find(".organization-list").exists()).toBe(true);
  });

  it("renders accessible loading skeletons through the ordinary card surface", async () => {
    const wrapper = render(WorkspaceFeed, { loading: true });
    expect(wrapper.get('[role="status"]').text()).toContain("Loading activity");
    expect(wrapper.findAll(".update-card.workspace-skeleton")).toHaveLength(2);
    expect(
      wrapper
        .findAll(".workspace-skeleton")
        .every((card) => card.attributes("aria-hidden") === "true"),
    ).toBe(true);
    await wrapper.setProps({ loading: false, error: true });
    await wrapper.get(".workspace-state button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("shows organization activity without personal scope or category filters while retaining pagination and retry", async () => {
    const wrapper = render(WorkspaceFeed, {
      organization: "research-lab",
      scope: "org:research-lab",
      items: [activity()],
      hasMore: true,
    });
    expect(wrapper.find('[aria-label="Filter activity"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Activity category"]').exists()).toBe(
      false,
    );
    expect(wrapper.findComponent({ name: "ElDropdown" }).exists()).toBe(false);
    expect(wrapper.find(".activity-card").exists()).toBe(true);
    await wrapper
      .findAll("button")
      .find((item) => item.text() === "Load more")
      .trigger("click");
    expect(wrapper.emitted("load-more")).toEqual([[]]);
    await wrapper.setProps({ items: [], hasMore: false, error: true });
    await wrapper.get(".workspace-state button").trigger("click");
    expect(wrapper.emitted("retry")).toEqual([[]]);
    await wrapper.setProps({ error: false, organization: null, scope: "all" });
    expect(wrapper.find('[aria-label="Filter activity"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Activity category"]').exists()).toBe(
      true,
    );
  });

  it("renders every scope with an avatar, separating organization choices from All/Self/Following", async () => {
    const wrapper = render(WorkspaceFeed, {
      username: "alice",
      organizations: [{ name: "research-lab" }, { name: "second-team" }],
    });
    const dropdown = wrapper.getComponent({ name: "ElDropdown" });
    const rows = wrapper.findAllComponents({ name: "ElDropdownItem" });
    expect(rows.map((row) => row.attributes("command"))).toEqual([
      "all",
      "self",
      "following",
      "org:research-lab",
      "org:second-team",
    ]);
    expect(rows.map((row) => row.get(".scope-option-label").text())).toEqual([
      "All",
      "Self",
      "Following",
      "research-lab",
      "second-team",
    ]);
    expect(
      rows.every((row) => row.findComponent({ name: "ElAvatar" }).exists()),
    ).toBe(true);
    expect(
      wrapper
        .get('[aria-label="Filter activity"]')
        .findComponent({ name: "ElAvatar" })
        .exists(),
    ).toBe(true);
    expect(rows[3].vm.$attrs.divided).toBe(true);
    expect(rows[4].vm.$attrs.divided).toBe(false);
    expect(rows[0].getComponent({ name: "ElAvatar" }).props("src")).toBeFalsy();
    expect(rows[0].find(".i-carbon-events").exists()).toBe(true);
    expect(rows[2].find(".i-carbon-user-follow").exists()).toBe(true);
    const selfAvatar = rows[1].getComponent({ name: "ElAvatar" });
    expect(selfAvatar.props("src")).toBe("/api/users/alice/avatar");
    await selfAvatar.get("img").trigger("error");
    expect(selfAvatar.text()).toBe("AL");
    const organizationAvatar = rows[3].getComponent({ name: "ElAvatar" });
    expect(organizationAvatar.props("src")).toBe(
      "/api/organizations/research-lab/avatar",
    );
    await organizationAvatar.get("img").trigger("error");
    expect(organizationAvatar.text()).toBe("RE");
    dropdown.vm.$emit("command", "org:research-lab");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:scope")).toEqual([["org:research-lab"]]);
    const trigger = wrapper.get('[aria-label="Filter activity"]');
    expect(trigger.get(".scope-label").text()).toBe("research-lab");
    expect(trigger.getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/organizations/research-lab/avatar",
    );
    expect(rows[3].attributes("aria-current")).toBe("true");
    dropdown.vm.$emit("command", "self");
    await wrapper.vm.$nextTick();
    expect(trigger.get(".scope-label").text()).toBe("Self");
    expect(trigger.getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/users/alice/avatar",
    );
  });

  it("omits the organization separator when no memberships are available", () => {
    const wrapper = render(WorkspaceFeed, {
      username: "alice",
      organizations: [],
    });
    const rows = wrapper.findAllComponents({ name: "ElDropdownItem" });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.vm.$attrs.divided)).toBe(true);
    expect(
      wrapper.get('[aria-label="Filter activity"]').get(".scope-label").text(),
    ).toBe("All");
  });

  it("shows All/Models/Datasets/Spaces/Likes as distinct accessible activity categories", async () => {
    const wrapper = render(WorkspaceFeed, {});
    const categories = wrapper.get(
      '[role="group"][aria-label="Activity category"]',
    );
    expect(categories.findAll("button").map((item) => item.text())).toEqual([
      "All",
      "Models",
      "Datasets",
      "Spaces",
      "Likes",
    ]);
    expect(
      categories
        .findAll("button")
        .map((item) => item.attributes("aria-pressed")),
    ).toEqual(["true", "false", "false", "false", "false"]);
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Refresh activity"]').exists()).toBe(
      false,
    );
    await categories
      .findAll("button")
      .find((item) => item.text() === "Likes")
      .trigger("click");
    expect(wrapper.emitted("update:type")).toEqual([["likes"]]);
    expect(
      categories
        .findAll("button")
        .find((item) => item.text() === "Likes")
        .attributes("aria-pressed"),
    ).toBe("true");
  });

  it.each(["model", "dataset", "space"])(
    "encodes trending %s repository links and uses the same current statistics renderer as repository cards",
    async (type) => {
      const repo = { id: "team?#/project <x>", downloads: 2400, likes: 19 };
      const wrapper = render(WorkspaceTrending, {
        type,
        trendingRepositories: [repo],
      });
      expect(wrapper.get(".trending-repo").attributes("href")).toBe(
        `/${type}s/team%3F%23/project%20%3Cx%3E`,
      );
      expect(wrapper.get(".browse-trending").attributes("href")).toBe(
        `/${type}s`,
      );
      expect(wrapper.getComponent(RepositoryStats).props("repo")).toEqual(repo);
      const card = render(RepositoryCard, { repo, repoType: type });
      for (const view of [wrapper, card]) {
        expect(view.get('[aria-label="2,400 downloads"]').text()).toBe("2.4K");
        expect(view.get('[aria-label="19 likes"]').text()).toBe("19");
      }
      await wrapper.setProps({
        trendingRepositories: [{ ...repo, downloads: 0, likes: 0 }],
      });
      expect(wrapper.get('[aria-label="0 downloads"]').text()).toBe("0");
      expect(wrapper.get('[aria-label="0 likes"]').text()).toBe("0");
    },
  );

  it("keeps the right rail scroll region and independent retry/type controls", async () => {
    const wrapper = render(WorkspaceTrending, { trendingError: true });
    expect(
      wrapper.get(".workspace-trending-view").attributes("aria-label"),
    ).toBe("Community discovery");
    expect(wrapper.get(".workspace-trending-wrap").attributes("tabindex")).toBe(
      "0",
    );
    await wrapper
      .get('select[aria-label="Trending repository type"]')
      .setValue("space");
    expect(wrapper.emitted("update:type")[0]).toEqual(["space"]);
    await wrapper.get(".sidebar-state button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });
});
