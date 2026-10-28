<!-- src/kohaku-hub-ui/src/App.vue -->
<template>
  <div
    class="app-shell w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors flex flex-col"
    :class="{
      'workspace-shell': isWorkspaceHome,
      'repository-shell': isRepositoryView,
    }"
  >
    <UnlimitedSwitcher />
    <SessionBanner class="shrink-0" />
    <TheHeader
      v-if="!isRepositoryView"
      class="shrink-0"
      :expanded="authStore.isAuthenticated"
    />
    <PageScrollArea>
      <TheHeader v-if="isRepositoryView" class="shrink-0" repository />
      <main class="site-main flex-1 min-w-0">
        <RouterView v-slot="{ Component, route }">
          <RouteBoundary :route-key="route.path">
            <keep-alive :include="['RepoViewer']">
              <component :is="Component" :key="getRouteKey(route)" />
            </keep-alive>
          </RouteBoundary>
        </RouterView>
      </main>
      <TheFooter v-if="!isWorkspaceHome && !isRepositoryPage" />
    </PageScrollArea>
  </div>
</template>

<script setup>
import RouteBoundary from "@/components/common/RouteBoundary.vue";
import SessionBanner from "@/components/common/SessionBanner.vue";
import TheHeader from "@/components/layout/TheHeader.vue";
import TheFooter from "@/components/layout/TheFooter.vue";
import PageScrollArea from "@/components/layout/PageScrollArea.vue";
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import {
  getRouteViewKey,
  isCompositeRepositoryRoute,
  isRepositoryRoute,
} from "@/utils/repo-view-routes";

const route = useRoute();
const authStore = useAuthStore();
const isRepositoryView = computed(() => isCompositeRepositoryRoute(route));
const isRepositoryPage = computed(() => isRepositoryRoute(route));
const isWorkspaceHome = computed(
  () => authStore.isAuthenticated && route.path === "/",
);

// Theme is applied early via inline script in index.html to prevent flash
// No need to initialize here

/**
 * Generate unique key for route to control when component should be reused
 * Same repo = same key = reuse component (no flicker)
 * Different repo = different key = new component instance
 */
function getRouteKey(route) {
  return getRouteViewKey(route);
}
</script>

<style scoped>
.app-shell {
  --site-header-height: 65px;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
.site-main {
  min-height: calc(100vh - var(--site-header-height));
  min-height: calc(100dvh - var(--site-header-height));
}
.repository-shell .site-main {
  min-height: 0;
}
@media (max-width: 767px) {
  .app-shell {
    --site-header-height: 49px;
  }
}
</style>
