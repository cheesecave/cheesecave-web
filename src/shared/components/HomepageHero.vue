<script setup>
import { computed } from "vue";
import MouseCheese from "./MouseCheese.vue";
import { DEFAULT_HOMEPAGE } from "../site-homepage.js";

const props = defineProps({
  config: { type: Object, default: () => ({ ...DEFAULT_HOMEPAGE }) },
  preview: { type: Boolean, default: false },
  fullScreen: { type: Boolean, default: false },
});
const title = computed(() =>
  props.config.title.replace(/\\r\\n|\\n|\r\n?/g, "\n"),
);
</script>

<template>
  <section
    v-if="config.enabled"
    class="homepage-hero"
    :class="{
      'text-only': config.illustration === 'none',
      'full-screen': fullScreen,
    }"
    data-testid="homepage-hero"
    aria-label="Welcome"
  >
    <div v-if="config.illustration === 'mouse-cheese'" class="hero-art">
      <div class="art-orbit" aria-hidden="true"></div>
      <MouseCheese :animated="config.animation_enabled" />
    </div>
    <div class="hero-copy">
      <p v-if="config.eyebrow" class="hero-eyebrow">{{ config.eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p v-if="config.description" class="hero-description">
        {{ config.description }}
      </p>
      <div class="hero-actions">
        <template
          v-for="action in [
            {
              label: config.primary_label,
              url: config.primary_url,
              primary: true,
            },
            {
              label: config.secondary_label,
              url: config.secondary_url,
              primary: false,
            },
          ]"
          :key="action.primary"
        >
          <button
            v-if="action.label && action.url && preview"
            type="button"
            :class="['hero-action', { primary: action.primary }]"
          >
            {{ action.label }} <span aria-hidden="true">↗</span>
          </button>
          <RouterLink
            v-else-if="action.label && action.url && action.url.startsWith('/')"
            :to="action.url"
            :class="['hero-action', { primary: action.primary }]"
            >{{ action.label }} <span aria-hidden="true">→</span></RouterLink
          >
          <a
            v-else-if="action.label && action.url"
            :href="action.url"
            :class="['hero-action', { primary: action.primary }]"
            >{{ action.label }} <span aria-hidden="true">↗</span></a
          >
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.homepage-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  overflow: hidden;
  border: 1px solid var(--site-border, #d9d9d2);
  border-radius: 24px;
  background: var(--site-card, #fffdf7);
  color: var(--site-card-text, #2c332b);
}
.hero-art {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 390px;
  padding: 36px;
  background: var(--site-illustration-bg, #f4eee1);
  overflow: hidden;
}
.art-orbit {
  --orbit-ring-width: 36px;
  --orbit-border-width: 37px;
  position: absolute;
  width: 310px;
  height: 310px;
  border: 1px solid var(--site-illustration-border, #dfcfb6);
  border-radius: 50%;
  box-shadow:
    0 0 0 var(--orbit-ring-width) var(--site-illustration-ring, #ece3d1),
    0 0 0 var(--orbit-border-width) var(--site-illustration-border, #dfcfb6);
}
.hero-art :deep(.mouse-cheese) {
  position: relative;
  width: min(100%, 285px);
}
.hero-copy {
  align-self: center;
  padding: clamp(28px, 4vw, 64px);
  min-width: 0;
}
.hero-eyebrow {
  margin: 0 0 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--site-link, #94621f);
  overflow-wrap: anywhere;
}
.hero-copy h1 {
  margin: 0;
  max-width: 600px;
  font-size: clamp(32px, 3.6vw, 54px);
  line-height: 1.08;
  letter-spacing: -0.045em;
  font-weight: 750;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.hero-description {
  margin: 24px 0 0;
  max-width: 520px;
  font-size: 16px;
  line-height: 1.8;
  color: var(--site-muted, #6b7068);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 12px 18px;
  min-height: 44px;
  border: 1px solid var(--site-border, #d9d9d2);
  border-radius: 8px;
  color: var(--site-card-text, #2c332b);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
  text-align: center;
}
.hero-action.primary {
  color: var(--site-primary-text, #eef0e7);
  background: var(--site-primary, #94621f);
  border-color: var(--site-primary, #94621f);
}
.hero-action:hover {
  background: var(--site-hover, #f2f1eb);
  color: var(--site-card-text, #2c332b);
}
.hero-action.primary:hover {
  background: var(--site-primary-hover, #885c20);
  color: var(--site-primary-text, #eef0e7);
}
.hero-action:focus-visible {
  outline: 3px solid var(--site-primary, #94621f);
  outline-offset: 4px;
}
.text-only {
  grid-template-columns: 1fr;
}
.full-screen {
  width: 100%;
  min-height: calc(100dvh - var(--site-header-height, 64px));
  border-radius: 0;
  border-width: 0 0 1px;
}
.full-screen .hero-copy {
  padding: clamp(32px, 5vw, 88px);
}
.full-screen .hero-copy h1 {
  font-size: clamp(42px, 4.4vw, 76px);
  max-width: 700px;
}
.full-screen .hero-description {
  font-size: clamp(16px, 1.3vw, 20px);
}
.full-screen .hero-art :deep(.mouse-cheese) {
  width: min(80%, 460px);
}
.full-screen .art-orbit {
  width: clamp(320px, 34vw, 520px);
  height: auto;
  aspect-ratio: 1;
}
.dark .homepage-hero {
  background: var(--site-card, #282e27);
  border-color: var(--site-border, #4c514a);
  color: var(--site-card-text, #eef0e7);
}
.dark .hero-art {
  background: var(--site-illustration-bg, #3b3c2c);
}
.dark .art-orbit {
  border-color: var(--site-illustration-border, #615737);
  box-shadow:
    0 0 0 var(--orbit-ring-width) var(--site-illustration-ring, #494630),
    0 0 0 var(--orbit-border-width) var(--site-illustration-border, #615737);
}
.dark .hero-description {
  color: var(--site-muted, #b3b6ad);
}
.dark .hero-eyebrow {
  color: var(--site-link, #e6b85c);
}
.dark .hero-action {
  color: var(--site-card-text, #eef0e7);
  border-color: var(--site-border, #4c514a);
}
.dark .hero-action.primary {
  background: var(--site-primary, #e6b85c);
  color: var(--site-primary-text, #2c332b);
  border-color: var(--site-primary, #e6b85c);
}
.dark .hero-action:hover {
  background: var(--site-hover, #343a33);
  color: var(--site-card-text, #eef0e7);
}
.dark .hero-action.primary:hover {
  background: var(--site-primary-hover, #e7bf6d);
  color: var(--site-primary-text, #2c332b);
}
@media (max-width: 700px) {
  .homepage-hero {
    grid-template-columns: 1fr;
    border-radius: 18px;
  }
  .hero-art {
    min-height: 240px;
    padding: 24px;
  }
  .hero-art :deep(.mouse-cheese) {
    width: 180px;
  }
  .art-orbit {
    width: 190px;
    height: 190px;
    --orbit-ring-width: 24px;
    --orbit-border-width: 25px;
  }
  .hero-copy {
    padding: 28px 24px 32px;
  }
  .hero-eyebrow {
    margin-bottom: 16px;
  }
  .hero-description {
    font-size: 14px;
    margin-top: 18px;
  }
  .hero-actions {
    margin-top: 24px;
  }
  .hero-action {
    flex: 1 1 150px;
  }
  .full-screen {
    border-radius: 0;
    grid-template-rows: minmax(240px, 1fr) auto;
  }
  .full-screen .hero-art {
    padding: 24px;
    min-height: 240px;
  }
  .full-screen .hero-art :deep(.mouse-cheese) {
    width: min(70%, 230px);
  }
  .full-screen .art-orbit {
    width: 230px;
  }
  .full-screen .hero-copy {
    padding: 28px 24px 32px;
  }
  .full-screen .hero-copy h1 {
    font-size: clamp(32px, 8vw, 44px);
  }
  .full-screen .hero-description {
    font-size: 14px;
  }
  .full-screen.text-only {
    grid-template-rows: auto;
  }
}
</style>
