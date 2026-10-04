<script setup>
import { storeToRefs } from "pinia";
import { useSiteBrandingStore } from "@/stores/siteBranding";
import { useSiteAppearanceStore } from "@/stores/siteAppearance";
import SiteAttribution from "./SiteAttribution.vue";

const { branding } = storeToRefs(useSiteBrandingStore());
const { footer } = storeToRefs(useSiteAppearanceStore());
const external = (url) => /^https?:\/\//i.test(url);
</script>

<template>
  <footer class="site-footer border-t mt-4 transition-colors">
    <div class="container-main py-8">
      <div
        class="footer-groups grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
      >
        <div>
          <h3 class="font-semibold mb-3 break-words">
            {{ branding.site_name }}
          </h3>
          <p class="footer-muted text-sm whitespace-pre-wrap break-words">
            {{ branding.footer_description }}
          </p>
        </div>
        <div v-for="(group, index) in footer.groups" :key="index">
          <h3 class="font-semibold mb-3 break-words">{{ group.title }}</h3>
          <div class="flex flex-col gap-2 text-sm">
            <a
              v-for="(link, linkIndex) in group.links"
              :key="linkIndex"
              :href="link.url"
              :target="external(link.url) ? '_blank' : undefined"
              :rel="external(link.url) ? 'noopener noreferrer' : undefined"
              class="footer-link break-words transition-colors"
              >{{ link.label }}</a
            >
          </div>
        </div>
      </div>
      <SiteAttribution />
    </div>
  </footer>
</template>
