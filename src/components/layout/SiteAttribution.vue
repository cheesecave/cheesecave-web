<script setup>
import { storeToRefs } from "pinia";
import { useSiteAppearanceStore } from "@/stores/siteAppearance";
import { buildCommitUrl } from "@/utils/build-commit-url";
import { FOOTER_ATTRIBUTION } from "../../shared/site-appearance.js";

const attribution = FOOTER_ATTRIBUTION;
const buildInfo =
  typeof __BUILD_INFO__ === "undefined"
    ? { commit: "unknown", dirty: false }
    : __BUILD_INFO__;
const commit =
  typeof buildInfo.commit === "string" ? buildInfo.commit : "unknown";
const versionLabel = `${commit.slice(0, 7)}${buildInfo.dirty ? "-dirty" : ""}`;
const versionTitle =
  commit === "unknown"
    ? "Frontend Git commit unavailable"
    : `Frontend Git commit: ${commit}${buildInfo.dirty ? " (uncommitted changes)" : ""}`;
const commitUrl = buildCommitUrl(
  "https://github.com/cheesecave/cheesecave-web",
  commit,
);
defineProps({ compact: Boolean });
const { footer } = storeToRefs(useSiteAppearanceStore());
const external = (url) => /^https?:\/\//i.test(url);
</script>

<template>
  <div
    class="footer-attribution footer-muted"
    :class="
      compact
        ? 'footer-attribution--compact'
        : 'mt-8 pt-8 border-t text-center text-sm'
    "
  >
    <p class="break-words">
      <a
        href="https://github.com/cheesecave/cheesecave-web"
        target="_blank"
        rel="noopener noreferrer"
        class="footer-credit"
        >CheeseCave</a
      >
      ·
      <a
        href="https://github.com/cheesecave/cheesecave-web/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        class="footer-credit"
        >Project license</a
      >
    </p>
    <p
      v-if="attribution.project_label || attribution.upstream_label"
      class="break-words"
    >
      <template v-if="attribution.project_label"
        >Powered by
        <component
          :is="attribution.project_url ? 'a' : 'span'"
          :href="attribution.project_url || undefined"
          :target="external(attribution.project_url) ? '_blank' : undefined"
          :rel="
            external(attribution.project_url)
              ? 'noopener noreferrer'
              : undefined
          "
          class="footer-credit"
          >{{ attribution.project_label }}</component
        ></template
      >
      <template v-if="attribution.project_label && attribution.upstream_label">
        ·
      </template>
      <template v-if="attribution.upstream_label"
        >Based on
        <component
          :is="attribution.upstream_url ? 'a' : 'span'"
          :href="attribution.upstream_url || undefined"
          :target="external(attribution.upstream_url) ? '_blank' : undefined"
          :rel="
            external(attribution.upstream_url)
              ? 'noopener noreferrer'
              : undefined
          "
          class="footer-credit"
          >{{ attribution.upstream_label }}</component
        ></template
      >
    </p>
    <p
      v-if="attribution.copyright_text || attribution.license_label"
      class="mt-2 break-words"
    >
      {{ attribution.copyright_text
      }}<template v-if="attribution.copyright_text && attribution.license_label"
        >. </template
      ><template v-if="attribution.license_label"
        >Licensed under
        <component
          :is="attribution.license_url ? 'a' : 'span'"
          :href="attribution.license_url || undefined"
          :target="external(attribution.license_url) ? '_blank' : undefined"
          :rel="
            external(attribution.license_url)
              ? 'noopener noreferrer'
              : undefined
          "
          class="footer-credit"
          >{{ attribution.license_label }}</component
        ></template
      >
    </p>
    <div
      v-if="footer.show_build_info"
      class="mt-2 text-xs font-mono"
      data-testid="frontend-version"
      :title="versionTitle"
    >
      Frontend
      <a
        v-if="commitUrl"
        :href="commitUrl"
        :aria-label="versionTitle"
        target="_blank"
        rel="noopener noreferrer"
        class="footer-credit"
        >{{ versionLabel }}</a
      ><span v-else>{{ versionLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.footer-attribution--compact {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--site-border);
  text-align: left;
  font-size: 10px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.footer-attribution--compact :deep([data-testid="frontend-version"]) {
  font-size: 10px;
}
</style>
