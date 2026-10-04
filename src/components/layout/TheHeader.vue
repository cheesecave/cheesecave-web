<!-- src/components/layout/TheHeader.vue -->
<template>
  <header
    class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 transition-colors"
    style="z-index: 1000"
  >
    <div
      class="container-main flex items-center justify-between h-12 md:h-16"
      :class="{ 'workspace-header': expanded }"
    >
      <!-- Logo -->
      <RouterLink
        to="/"
        class="flex items-center gap-2 min-w-0 max-w-[70%] md:max-w-[25%]"
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

      <!-- Desktop Navigation - hidden on mobile -->
      <nav
        class="hidden md:flex items-center gap-6"
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
      <div class="hidden md:flex items-center gap-4">
        <!-- Dark Mode Toggle -->
        <el-button
          @click="themeStore.toggle()"
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
            <el-button type="primary" circle>
              <div class="i-carbon-add text-xl" />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="item in HEADER_CREATION_ITEMS"
                  :key="item.id"
                  :divided="item.divided"
                  @click="selectMenuItem(item)"
                >
                  <div class="flex items-center gap-2">
                    <div :class="item.icon" />
                    <span>{{ item.label }}</span>
                  </div>
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
                <el-dropdown-item
                  v-for="item in accountItems"
                  :key="item.id"
                  :divided="item.divided"
                  @click="selectMenuItem(item)"
                >
                  <div :class="item.icon" class="inline-block mr-2" />
                  {{ item.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <template v-else>
          <el-button @click="$router.push('/login')" plain> Login </el-button>
          <el-button type="primary" @click="$router.push('/register')">
            Sign Up
          </el-button>
        </template>
      </div>

      <!-- Mobile Menu Button -->
      <div
        class="flex md:hidden items-center gap-2"
        style="position: relative; z-index: 1001"
      >
        <!-- Dark Mode Toggle - Mobile -->
        <el-button
          @click="themeStore.toggle()"
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
            <div
              v-for="item in HEADER_CREATION_ITEMS"
              :key="item.id"
              @click="selectMenuItem(item, true)"
              class="px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-2">
                <div :class="item.icon" />
                {{ item.label }}
              </div>
            </div>
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
            <div
              v-for="item in accountItems"
              :key="item.id"
              @click="selectMenuItem(item, true)"
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
          </div>
        </template>

        <!-- Not authenticated -->
        <template v-else>
          <div class="flex flex-col gap-1 px-4">
            <el-button
              @click="
                $router.push('/login');
                mobileMenuOpen = false;
              "
              size="large"
              class="w-full"
              plain
            >
              Login
            </el-button>
            <div class="w-0 h-0 p-0 m-0"></div>
            <!-- Avoid el-button+el-button spacing -->
            <el-button
              type="primary"
              @click="
                $router.push('/register');
                mobileMenuOpen = false;
              "
              size="large"
              class="w-full"
            >
              Sign Up
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </header>
</template>

<script setup>
defineProps({ expanded: { type: Boolean, default: false } });
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useSiteBrandingStore } from "@/stores/siteBranding";
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
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

function selectMenuItem(item, closeMobile = false) {
  if (closeMobile) mobileMenuOpen.value = false;
  if (item.action === "logout") return handleLogout();
  return router.push(item.to);
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
