// Which README style is in force: the reader's own choice if they made one, else the site's default, else GitHub's.
// The choice lives on the server, with the account, so it follows the reader to every browser; a copy in the browser
// makes the first paint right before the server has answered.
import { computed, ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { preferencesAPI } from "@/utils/api";
import {
  DEFAULT_MARKDOWN_STYLE,
  isMarkdownStyle,
  loadMarkdownStyle,
  normalizeMarkdownStyle,
} from "@/markdown-styles/registry";
import { useAuthStore } from "./auth";
import { useSiteAppearanceStore } from "./siteAppearance";

const cacheKey = (username) => `cheesecave:markdown-style:${username}`;

function readCache(username) {
  if (!username) return null;
  try {
    const value = localStorage.getItem(cacheKey(username));
    return isMarkdownStyle(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCache(username, value) {
  try {
    if (value) localStorage.setItem(cacheKey(username), value);
    else localStorage.removeItem(cacheKey(username));
  } catch {
    /* Private browsing can disable storage; the server copy still holds. */
  }
}

export const useMarkdownStyleStore = defineStore("markdownStyle", () => {
  const auth = useAuthStore();
  const appearance = useSiteAppearanceStore();
  // null: follow the site's default
  const userChoice = ref(readCache(auth.username));
  const siteDefault = computed(() =>
    normalizeMarkdownStyle(
      appearance.theme?.markdown_style,
      DEFAULT_MARKDOWN_STYLE,
    ),
  );
  const resolved = computed(() => userChoice.value ?? siteDefault.value);
  const source = computed(() => (userChoice.value ? "user" : "site"));
  let loadedFor = null;

  /** The signed-in reader's saved choice, from the server. */
  async function loadFromServer() {
    const username = auth.username;
    if (!username) return;
    try {
      const { data } = await preferencesAPI.get(username);
      if (auth.username !== username) return; // signed out or switched while asking
      const value = isMarkdownStyle(data?.markdown_style)
        ? data.markdown_style
        : null;
      userChoice.value = value;
      writeCache(username, value);
      loadedFor = username;
    } catch {
      // The server did not answer: keep what the browser remembers
    }
  }

  /** Choose a style, or null to follow the site's default; the change is shown at once and saved. */
  async function choose(id) {
    const username = auth.username;
    const next = id === null ? null : normalizeMarkdownStyle(id, null);
    if (id !== null && next === null) throw new Error(`Unknown style: ${id}`);
    const before = userChoice.value;
    userChoice.value = next;
    if (!username) return;
    writeCache(username, next);
    try {
      await preferencesAPI.update(username, { markdown_style: next });
    } catch (error) {
      userChoice.value = before;
      writeCache(username, before);
      throw error;
    }
  }

  // The sign-in answer (whoami-v2) is awaited before the app mounts: if it carries the preferences, the first paint
  // is already right and nothing more is asked
  function fromSignIn(username) {
    const preferences = auth.userInfo?.preferences;
    if (!username || !preferences || !("markdown_style" in preferences))
      return false;
    const value = isMarkdownStyle(preferences.markdown_style)
      ? preferences.markdown_style
      : null;
    userChoice.value = value;
    writeCache(username, value);
    loadedFor = username;
    return true;
  }

  watch(
    () => auth.username,
    (username) => {
      userChoice.value = readCache(username);
      if (username && loadedFor !== username && !fromSignIn(username))
        void loadFromServer();
      if (!username) loadedFor = null;
    },
    { immediate: true },
  );

  // Fetch the stylesheet (and so its fonts) as soon as the style is known, not when the first README arrives
  watch(
    resolved,
    (id) => {
      loadMarkdownStyle(id).catch(() => {});
    },
    { immediate: true },
  );

  return { userChoice, siteDefault, resolved, source, choose, loadFromServer };
});

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(useMarkdownStyleStore, import.meta.hot),
  );
}
