import { computed, onScopeDispose, ref } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import {
  CACHE_KEY,
  DEFAULT_APPEARANCE,
  fetchAppearance,
  normalizeAppearance,
  parseCachedAppearance,
  readCachedAppearance,
  saveCachedAppearance,
} from "../shared/site-appearance.js";
import { useThemeStore } from "./theme";

export const useSiteAppearanceStore = defineStore("siteAppearance", () => {
  const appearance = ref(readCachedAppearance());
  const revision = ref(0);
  const themeStore = useThemeStore();
  const footer = computed(() => appearance.value.footer);
  const theme = computed(() => appearance.value.theme);
  function apply(value, { persist = true } = {}) {
    const next = normalizeAppearance(value);
    if (!next) return false;
    appearance.value = next;
    revision.value += 1;
    if (persist) saveCachedAppearance(next);
    themeStore.setSiteTheme(next.theme);
    return true;
  }
  async function refresh() {
    const started = revision.value;
    try {
      const next = await fetchAppearance();
      return revision.value === started ? apply(next) : false;
    } catch {
      return false;
    }
  }
  let dispose;
  function initialize() {
    if (dispose) return dispose;
    themeStore.setSiteTheme(theme.value);
    const disposeTheme = themeStore.init();
    const onStorage = (event) => {
      if (event.key !== CACHE_KEY && event.key !== null) return;
      const next = parseCachedAppearance(event.newValue);
      if (next || event.newValue === null)
        apply(next || DEFAULT_APPEARANCE, { persist: false });
    };
    window.addEventListener("storage", onStorage);
    void refresh();
    dispose = () => {
      window.removeEventListener("storage", onStorage);
      disposeTheme();
      dispose = undefined;
    };
    return dispose;
  }
  onScopeDispose(() => dispose?.());
  return { appearance, revision, footer, theme, apply, refresh, initialize };
});

if (import.meta.hot)
  import.meta.hot.accept(
    acceptHMRUpdate(useSiteAppearanceStore, import.meta.hot),
  );
