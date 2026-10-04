import { computed, onScopeDispose, ref } from "vue";
import { defineStore, acceptHMRUpdate } from "pinia";
import {
  normalizeTheme,
  readCachedAppearance,
} from "../shared/site-appearance.js";
import { applySiteTheme } from "@/utils/site-theme";

function readPreference() {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export const useThemeStore = defineStore("theme", () => {
  const siteTheme = ref(readCachedAppearance().theme);
  const preference = ref(readPreference());
  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const systemDark = ref(media?.matches || false);
  const isDark = computed(() => {
    const mode = preference.value || siteTheme.value.default_mode;
    return mode === "system" ? systemDark.value : mode === "dark";
  });
  const apply = () => applySiteTheme(siteTheme.value, isDark.value);
  function setTheme(dark) {
    preference.value = dark ? "dark" : "light";
    try {
      localStorage.setItem("theme", preference.value);
    } catch {
      /* Private browsing can disable storage. */
    }
    apply();
  }
  const toggle = () => setTheme(!isDark.value);
  function setSiteTheme(value) {
    const theme = normalizeTheme(value);
    if (!theme) return false;
    siteTheme.value = theme;
    apply();
    return true;
  }
  let dispose;
  function init() {
    apply();
    if (dispose) return dispose;
    const onSystem = (event) => {
      systemDark.value = event.matches;
      apply();
    };
    const onStorage = (event) => {
      if (event.key === "theme" || event.key === null) {
        preference.value = readPreference();
        apply();
      }
    };
    if (media?.addEventListener) media.addEventListener("change", onSystem);
    else media?.addListener?.(onSystem);
    window.addEventListener("storage", onStorage);
    dispose = () => {
      if (media?.removeEventListener)
        media.removeEventListener("change", onSystem);
      else media?.removeListener?.(onSystem);
      window.removeEventListener("storage", onStorage);
      dispose = undefined;
    };
    return dispose;
  }
  onScopeDispose(() => dispose?.());
  return {
    isDark,
    siteTheme,
    preference,
    apply,
    setTheme,
    toggle,
    setSiteTheme,
    init,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useThemeStore, import.meta.hot));
