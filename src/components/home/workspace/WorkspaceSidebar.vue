<script setup>
import { computed, ref, watch } from "vue";
import { ElScrollbar } from "element-plus";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import { getRepositoryType as typeInfo } from "@/utils/repository-types";
import { buildRepositoryPath } from "@/utils/repo-paths";
import WorkspaceViewSelector from "./WorkspaceViewSelector.vue";
const props = defineProps({
  username: { type: String, default: null },
  organizations: { type: Array, default: () => [] },
  repositories: { type: Array, default: () => [] },
  loading: Boolean,
  error: Boolean,
});
defineEmits(["retry"]);
const filter = defineModel("filter", { type: String, default: "" });
const view = defineModel("view", { type: String, default: "self" });
const personalExpanded = defineModel("expanded", {
  type: Boolean,
  default: false,
});
const selectedOrganization = computed(() =>
  props.organizations.find((org) => `org:${org.name}` === view.value),
);
const organizationPath = computed(() =>
  selectedOrganization.value
    ? `/organizations/${encodeURIComponent(selectedOrganization.value.name)}`
    : null,
);
const visibleRepositories = computed(() => {
  const query = filter.value.trim().toLowerCase();
  return query
    ? props.repositories.filter((repo) => repo.id.toLowerCase().includes(query))
    : props.repositories.slice(0, 7);
});
const organizationCount = ref(3);
const visibleOrganizations = computed(() =>
  props.organizations.slice(0, organizationCount.value),
);
watch([() => props.username, view], () => {
  organizationCount.value = 3;
});
</script>

<template>
  <aside
    class="workspace-personal"
    data-testid="workspace-personal"
    :aria-label="
      selectedOrganization
        ? 'Organization workspace'
        : 'Your repositories and account'
    "
  >
    <ElScrollbar
      class="workspace-personal-scrollbar"
      wrap-class="workspace-personal-wrap"
      view-class="workspace-personal-view"
      :tabindex="0"
      always
      role="region"
      aria-label="Workspace navigation"
    >
      <WorkspaceViewSelector
        v-model="view"
        :username="username"
        :organizations="organizations"
      />
      <nav
        v-if="selectedOrganization"
        class="organization-actions"
        aria-label="Organization workspace navigation"
      >
        <RouterLink :to="organizationPath">View organization</RouterLink>
        <RouterLink :to="`${organizationPath}#repositories`"
          >Browse organization's repositories</RouterLink
        >
      </nav>
      <template v-else>
        <button
          type="button"
          class="personal-toggle"
          :aria-expanded="personalExpanded"
          aria-controls="personal-repositories"
          @click="personalExpanded = !personalExpanded"
        >
          <span class="i-carbon-folder" aria-hidden="true" /> Your repositories
          <span
            :class="
              personalExpanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'
            "
            aria-hidden="true"
          />
        </button>
        <div
          id="personal-repositories"
          class="personal-content"
          :class="{ expanded: personalExpanded }"
        >
          <div class="sidebar-heading">
            <h2>Your repositories</h2>
            <RouterLink
              to="/new"
              class="workspace-create"
              aria-label="Create repository"
              ><span aria-hidden="true">+</span> New</RouterLink
            >
          </div>
          <label class="repo-search"
            ><span class="i-carbon-search" aria-hidden="true" /><input
              v-model="filter"
              aria-label="Find a repository"
              placeholder="Find a repository…"
              type="search"
          /></label>
          <div v-if="loading" class="sidebar-state" role="status">
            Loading your repositories…
          </div>
          <div v-else-if="error" class="sidebar-state" role="alert">
            <p>Could not load your repositories.</p>
            <button type="button" @click="$emit('retry')">Try again</button>
          </div>
          <div v-else-if="!repositories.length" class="sidebar-state">
            <h3>No repositories yet</h3>
            <RouterLink to="/new">Create your first repository →</RouterLink>
          </div>
          <p v-else-if="!visibleRepositories.length" class="sidebar-state">
            No repositories match your search.
          </p>
          <ul v-else class="workspace-repos">
            <li
              v-for="repo in visibleRepositories"
              :key="`${repo.type}:${repo.id}`"
            >
              <RouterLink
                :to="buildRepositoryPath(repo.type, repo.id)"
                class="workspace-repo"
                ><span
                  :class="typeInfo(repo.type).icon"
                  aria-hidden="true" /><span
                  class="compact-repo-name"
                  :title="repo.id"
                  >{{ repo.id }}</span
                ><span
                  v-if="repo.private"
                  class="i-carbon-locked"
                  title="Private"
                  aria-label="Private"
              /></RouterLink>
            </li>
          </ul>
          <RouterLink :to="`/${username}`" class="all-repositories"
            >View all repositories <span aria-hidden="true">→</span></RouterLink
          >
          <section class="sidebar-section">
            <div class="sidebar-heading">
              <h2>Your organizations</h2>
              <RouterLink
                to="/organizations/new"
                aria-label="Create an organization"
                >+</RouterLink
              >
            </div>
            <ul v-if="organizations.length" class="organization-list">
              <li v-for="org in visibleOrganizations" :key="org.name">
                <RouterLink
                  :to="`/organizations/${encodeURIComponent(org.name)}`"
                  ><EntityAvatar
                    :username="org.name"
                    is-org
                    :size="24"
                    class="organization-avatar"
                  /><span class="organization-name">{{ org.name }}</span
                  ><span class="organization-role">{{
                    org.roleInOrg || org.role
                  }}</span></RouterLink
                >
              </li>
            </ul>
            <button
              v-if="visibleOrganizations.length < organizations.length"
              type="button"
              class="load-organizations"
              @click="organizationCount += 3"
            >
              Load more
            </button>
            <p v-if="!organizations.length" class="organization-empty">
              You haven't joined any organizations yet.
            </p>
          </section>
        </div>
      </template>
    </ElScrollbar>
    <nav
      v-if="!selectedOrganization"
      class="quick-links"
      :class="{ expanded: personalExpanded }"
      aria-label="Workspace shortcuts"
    >
      <RouterLink to="/settings"
        ><span class="i-carbon-settings" aria-hidden="true" /> Account
        settings</RouterLink
      >
    </nav>
  </aside>
</template>

<style scoped>
.workspace-personal {
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  align-self: start;
  height: calc(100dvh - var(--site-header-height, 64px));
  min-width: 0;
  border-right: 1px solid var(--ws-border);
  background: var(--ws-surface);
}
.workspace-personal-scrollbar {
  flex: 1;
  min-height: 0;
}
:deep(.workspace-personal-wrap) {
  overscroll-behavior: contain;
}
:deep(.workspace-personal-view) {
  padding: 26px 20px;
}
.organization-actions {
  display: grid;
  gap: 10px;
}
.organization-actions a,
.load-organizations {
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--ws-surface);
  color: var(--ws-text);
  font-size: 12px;
  line-height: 1.5;
}
.organization-actions a:hover,
.load-organizations:hover {
  border-color: var(--site-primary);
  color: var(--site-primary);
}
.load-organizations {
  width: 100%;
}
.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.sidebar-heading h2 {
  font-size: 13px;
  font-weight: 650;
  margin: 0;
}
.workspace-create {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--site-primary, #94621f);
  color: var(--site-primary-text, #eef0e7);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}
.workspace-create:hover {
  background: var(--site-primary-hover, #885c20);
}
.repo-search {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 8px 9px;
  color: var(--ws-muted);
}
.repo-search input {
  width: 100%;
  min-width: 0;
  font-size: 11px;
  background: transparent;
  color: var(--ws-text);
  outline: none;
}
.repo-search:focus-within {
  outline: 2px solid var(--site-primary, #94621f);
  outline-offset: 2px;
}
.workspace-repos,
.organization-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
}
.workspace-repo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--ws-link);
  font-size: 12px;
}
.workspace-repo > span:first-child {
  flex-shrink: 0;
  color: var(--ws-muted);
}
.compact-repo-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-repo > .i-carbon-locked {
  flex-shrink: 0;
}
.all-repositories {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 11px;
  color: var(--ws-muted);
}
.sidebar-section {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--ws-border);
}
.organization-list a {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ws-text);
  font-size: 12px;
  padding: 7px 0;
}
.organization-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.organization-role {
  margin-left: auto;
  font-size: 10px;
  color: var(--ws-muted);
}
.organization-empty {
  color: var(--ws-muted);
  font-size: 12px;
  line-height: 1.7;
}
.quick-links {
  display: grid;
  flex-shrink: 0;
  margin: 0 20px;
  padding: 16px 0;
  border-top: 1px solid var(--ws-border);
}
.quick-links a {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ws-muted);
}
.sidebar-state button {
  border: 1px solid var(--ws-border);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  background: var(--ws-surface);
  color: var(--ws-text);
}
.sidebar-state {
  color: var(--ws-muted);
  font-size: 12px;
  padding: 18px 0;
  line-height: 1.8;
}
.sidebar-state h3 {
  color: var(--ws-text);
  font-weight: 600;
}
.sidebar-state p {
  margin-bottom: 10px;
}
.personal-toggle {
  display: none;
}
@media (max-width: 1150px) {
  .workspace-personal {
    grid-row: 1 / span 2;
  }
}
@media (max-width: 700px) {
  .workspace-personal {
    position: static;
    align-self: stretch;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--ws-border);
  }
  .workspace-personal-scrollbar {
    flex: none;
    height: auto;
  }
  :deep(.workspace-personal-wrap) {
    overscroll-behavior: auto;
  }
  :deep(.workspace-personal-view) {
    padding: 14px 20px;
  }
  .personal-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-size: 12px;
    color: var(--ws-muted);
  }
  .personal-toggle > span:last-child {
    margin-left: auto;
  }
  .personal-content {
    display: none;
  }
  .personal-content.expanded {
    display: block;
    padding-top: 20px;
  }
  .quick-links {
    display: none;
  }
  .quick-links.expanded {
    display: grid;
  }
}
</style>
