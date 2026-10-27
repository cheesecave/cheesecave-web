<!-- src/components/layout/TheHeader.vue -->
<template>
  <header
    class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 transition-colors"
    :class="{ 'repository-site-header': repository }"
    style="z-index: 1000"
  >
    <div
      class="container-main flex items-center justify-between h-12 md:h-16"
      :class="{ 'workspace-header': expanded }"
    >
      <!-- Logo -->
      <RouterLink
        to="/"
        class="header-brand flex items-center gap-2 min-w-0 max-w-[70%] md:max-w-[25%]"
        :aria-label="branding.site_name"
        :title="branding.site_name"
      >
        <img
          :src="headerLogo"
          :alt="branding.site_name"
          class="h-8 w-8 md:h-10 md:w-10 shrink-0 object-contain"
          @error="logoFailed = true"
        />
        <span
          class="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100 truncate"
          >{{ branding.site_name }}</span
        >
      </RouterLink>

      <HeaderSearch v-if="repository" class="repository-header-search" />

      <!-- Desktop Navigation - hidden on mobile -->
      <nav
        class="header-navigation hidden md:flex items-center gap-6"
        aria-label="Main navigation"
      >
        <RouterLink
          v-for="item in HEADER_NAVIGATION_ITEMS"
          :key="item.id"
          :to="item.to"
          class="text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Desktop User Menu - hidden on mobile -->
      <div class="header-account-controls hidden md:flex items-center gap-4">
        <!-- Dark Mode Toggle -->
        <el-button
          @click="themeStore.toggle()"
          :aria-label="
            themeStore.isDark ? 'Switch to light theme' : 'Switch to dark theme'
          "
          :title="
            themeStore.isDark ? 'Switch to light theme' : 'Switch to dark theme'
          "
          circle
          text
          class="!text-gray-700 dark:!text-gray-300"
        >
          <div v-if="themeStore.isDark" class="i-carbon-moon text-xl" />
          <div v-else class="i-carbon-asleep text-xl" />
        </el-button>
        <template v-if="isAuthenticated">
          <!-- Create New Dropdown -->
          <el-dropdown trigger="click">
            <el-button
              type="primary"
              circle
              aria-label="Create new"
              title="Create new"
            >
              <div class="i-carbon-add text-xl" />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="item in HEADER_CREATION_ITEMS"
                  :key="item.id"
                  :divided="item.divided"
                  class="header-menu-item"
                  @click="followMenuLink"
                >
                  <RouterLink
                    :to="item.to"
                    class="header-menu-link"
                    tabindex="-1"
                  >
                    <div :class="item.icon" />
                    <span>{{ item.label }}</span>
                  </RouterLink>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- User Dropdown -->
          <el-dropdown>
            <div class="flex items-center gap-2 cursor-pointer">
              <!-- User Avatar -->
              <EntityAvatar
                :username="username"
                :size="32"
                :alt="`${username} avatar`"
                class="header-avatar"
              />
              <span>{{ username }}</span>
              <div class="i-carbon-chevron-down" />
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <template v-for="item in accountItems" :key="item.id">
                  <el-dropdown-item
                    v-if="item.action"
                    :divided="item.divided"
                    @click="logoutFromMenu()"
                  >
                    <div :class="item.icon" class="inline-block mr-2" />
                    {{ item.label }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-else
                    :divided="item.divided"
                    class="header-menu-item"
                    @click="followMenuLink"
                  >
                    <RouterLink
                      :to="item.to"
                      class="header-menu-link"
                      tabindex="-1"
                    >
                      <div :class="item.icon" />
                      {{ item.label }}
                    </RouterLink>
                  </el-dropdown-item>
                </template>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <template v-else>
          <LinkButton to="/login" plain> Login </LinkButton>
          <LinkButton to="/register" type="primary"> Sign Up </LinkButton>
        </template>
      </div>

      <!-- Mobile Menu Button -->
      <div
        class="header-mobile-controls flex md:hidden items-center gap-2"
        style="position: relative; z-index: 1001"
      >
        <!-- Dark Mode Toggle - Mobile -->
        <el-button
          @click="themeStore.toggle()"
          :aria-label="
            themeStore.isDark ? 'Switch to light theme' : 'Switch to dark theme'
          "
          :title="
            themeStore.isDark ? 'Switch to light theme' : 'Switch to dark theme'
          "
          circle
          text
          size="small"
          class="!text-gray-700 dark:!text-gray-300"
        >
          <div v-if="themeStore.isDark" class="i-carbon-moon text-lg" />
          <div v-else class="i-carbon-asleep text-lg" />
        </el-button>
        <!-- Hamburger Menu -->
        <el-button
          @click="mobileMenuOpen = !mobileMenuOpen"
          :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="mobileMenuOpen"
          circle
          text
          class="!text-gray-700 dark:!text-gray-300 !min-w-10 !min-h-10"
        >
          <div class="i-carbon-menu text-2xl" />
        </el-button>
      </div>
    </div>

    <!-- Mobile Menu Drawer -->
    <el-drawer
      append-to-body
      v-model="mobileMenuOpen"
      direction="rtl"
      size="280px"
      :show-close="false"
      :z-index="9999"
    >
      <div class="flex flex-col h-full">
        <!-- Navigation Links -->
        <nav
          class="flex flex-col gap-1 mb-6 px-4 pt-4"
          aria-label="Mobile navigation"
        >
          <RouterLink
            v-for="item in HEADER_NAVIGATION_ITEMS"
            :key="item.id"
            :to="item.to"
            @click="mobileMenuOpen = false"
            class="px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <div class="flex items-center gap-2">
              <div :class="item.icon" />
              {{ item.label }}
            </div>
          </RouterLink>
        </nav>

        <!-- Divider -->
        <div
          class="border-t border-gray-200 dark:border-gray-700 mb-4 mx-4"
        ></div>

        <!-- User Menu -->
        <template v-if="isAuthenticated">
          <!-- Create New Options -->
          <div class="mb-4 px-4">
            <div class="px-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
              CREATE NEW
            </div>
            <RouterLink
              v-for="item in HEADER_CREATION_ITEMS"
              :key="item.id"
              :to="item.to"
              @click="mobileMenuOpen = false"
              class="block px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-2">
                <div :class="item.icon" />
                {{ item.label }}
              </div>
            </RouterLink>
          </div>

          <!-- Divider -->
          <div
            class="border-t border-gray-200 dark:border-gray-700 mb-4 mx-4"
          ></div>

          <!-- User Options -->
          <div class="px-4">
            <div class="flex items-center gap-2 px-4 mb-4">
              <!-- User Avatar in Mobile Menu -->
              <EntityAvatar
                :username="username"
                :size="48"
                :alt="`${username} avatar`"
                class="header-avatar"
              />
              <div
                class="text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                {{ username }}
              </div>
            </div>
            <template v-for="item in accountItems" :key="item.id">
              <div
                v-if="item.action"
                @click="logoutFromMenu(true)"
                class="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                :class="
                  item.danger
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-700 dark:text-gray-300'
                "
              >
                <div class="flex items-center gap-2">
                  <div :class="item.icon" />
                  {{ item.label }}
                </div>
              </div>
              <RouterLink
                v-else
                :to="item.to"
                @click="mobileMenuOpen = false"
                class="block px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
              >
                <div class="flex items-center gap-2">
                  <div :class="item.icon" />
                  {{ item.label }}
                </div>
              </RouterLink>
            </template>
          </div>
        </template>

        <!-- Not authenticated -->
        <template v-else>
          <div class="flex flex-col gap-1 px-4">
            <LinkButton
              to="/login"
              @click="mobileMenuOpen = false"
              size="large"
              class="w-full"
              plain
            >
              Login
            </LinkButton>
            <div class="w-0 h-0 p-0 m-0"></div>
            <!-- Avoid el-button+el-button spacing -->
            <LinkButton
              to="/register"
              type="primary"
              @click="mobileMenuOpen = false"
              size="large"
              class="w-full"
            >
              Sign Up
            </LinkButton>
          </div>
        </template>
      </div>
    </el-drawer>
  </header>
</template>

<script setup>
defineProps({
  expanded: { type: Boolean, default: false },
  repository: { type: Boolean, default: false },
});
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useSiteBrandingStore } from "@/stores/siteBranding";
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import LinkButton from "@/components/common/LinkButton.vue";
import HeaderSearch from "@/components/layout/HeaderSearch.vue";
import {
  HEADER_NAVIGATION_ITEMS,
  HEADER_CREATION_ITEMS,
  getHeaderAccountItems,
} from "@/utils/header-navigation";

const authStore = useAuthStore();
const themeStore = useThemeStore();
const { branding } = storeToRefs(useSiteBrandingStore());
const logoFailed = ref(false);
const headerLogo = computed(() =>
  logoFailed.value
    ? "/images/logo-square.svg"
    : branding.value.header_logo || "/images/logo-square.svg",
);
watch(
  () => branding.value.header_logo,
  () => {
    logoFailed.value = false;
  },
);
const { isAuthenticated, username } = storeToRefs(authStore);
const router = useRouter();
const mobileMenuOpen = ref(false);
const accountItems = computed(() => getHeaderAccountItems(username.value));

// Logout is the one menu entry that is an action; every other entry is a link
function logoutFromMenu(closeMobile = false) {
  if (closeMobile) mobileMenuOpen.value = false;
  return handleLogout();
}

// A mouse click lands on the link inside the item and follows it. Enter and Space reach the
// item itself, as a "click" carrying the key event: follow the link for them.
function followMenuLink(event) {
  if (event.type === "keydown") event.target.querySelector("a[href]")?.click();
}

async function handleLogout() {
  try {
    await authStore.logout();
    ElMessage.success("Logged out successfully");
    router.push("/");
  } catch (err) {
    ElMessage.error("Logout failed");
  }
}
</script>

<style scoped>
.repository-site-header {
  position: relative;
  border-bottom: 0;
  background: var(--site-card);
}
.repository-site-header > .container-main {
  width: 100%;
  max-width: none;
  padding-inline: 24px;
  column-gap: 24px;
  justify-content: flex-start;
}
.repository-site-header .header-brand {
  flex: 0 1 auto;
  max-width: 260px;
}
.repository-header-search {
  flex: 1 1 280px;
  min-width: 160px;
  max-width: 360px;
}
.repository-site-header .header-navigation {
  margin-left: auto;
  flex: none;
  gap: 20px;
}
.repository-site-header .header-account-controls {
  flex: none;
}
@media (min-width: 768px) and (max-width: 1179px) {
  .repository-site-header .header-navigation,
  .repository-site-header .header-account-controls {
    display: none;
  }
  .repository-site-header .header-mobile-controls {
    display: flex;
    flex: none;
    margin-left: auto;
  }
}
@media (max-width: 767px) {
  .repository-site-header > .container-main {
    padding-inline: 16px;
    column-gap: 16px;
    height: auto;
    flex-wrap: wrap;
    row-gap: 8px;
    padding-block: 8px 12px;
  }
  .repository-site-header .header-mobile-controls {
    flex: none;
    margin-left: auto;
  }
  .repository-site-header .header-brand {
    max-width: calc(100% - 104px);
  }
  .repository-header-search {
    order: 1;
    flex-basis: 100%;
    max-width: none;
  }
}
.workspace-header {
  max-width: none;
  padding-inline: 24px;
}
@media (max-width: 767px) {
  .workspace-header {
    padding-inline: 16px;
  }
}
/* Ensure mobile menu buttons have proper touch targets */
@media (max-width: 768px) {
  :deep(.el-button) {
    min-height: 44px;
  }
}
</style>

<style>
/* A menu entry that is a link: the link fills the whole item, so the whole row is clickable */
.el-dropdown-menu__item.header-menu-item {
  padding: 0;
}
.header-menu-link {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 16px;
  color: inherit;
  text-decoration: none;
}
</style>
