// Public site appearance, shared by the visitor and administration applications.
export const CACHE_KEY = "kohakuhub.site-appearance.v1";

export const DEFAULT_THEME = Object.freeze({
  default_mode: "system",
  primary_light: "#94621f",
  primary_dark: "#e6b85c",
  background_light: "#f7f4eb",
  background_dark: "#1c211d",
  card_light: "#fffdf7",
  card_dark: "#282e27",
});

export const DEFAULT_FOOTER = Object.freeze({
  groups: Object.freeze([
    Object.freeze({
      title: "Using this hub",
      links: Object.freeze([
        Object.freeze({ label: "Documentation", url: "/docs" }),
        Object.freeze({ label: "Get started", url: "/get-started" }),
        Object.freeze({ label: "About", url: "/about" }),
        Object.freeze({ label: "Self-host", url: "/self-hosted" }),
      ]),
    }),
    Object.freeze({
      title: "Open source",
      links: Object.freeze([
        Object.freeze({
          label: "DeepGHS fork",
          url: "https://github.com/deepghs/KohakuHub",
        }),
        Object.freeze({
          label: "Upstream project",
          url: "https://github.com/KohakuBlueleaf/KohakuHub",
        }),
        Object.freeze({
          label: "Report an issue",
          url: "https://github.com/cheesecave/cheesecave-web/issues",
        }),
        Object.freeze({
          label: "Discord",
          url: "https://discord.gg/xWYrkyvJ2s",
        }),
      ]),
    }),
    Object.freeze({
      title: "Policies",
      links: Object.freeze([
        Object.freeze({ label: "Terms", url: "/terms" }),
        Object.freeze({ label: "Privacy", url: "/privacy" }),
      ]),
    }),
  ]),
  show_build_info: true,
});

// Project attribution and license information are fixed, independent of saved settings.
export const FOOTER_ATTRIBUTION = Object.freeze({
  project_label: "DeepGHS",
  project_url: "https://github.com/deepghs/KohakuHub",
  upstream_label: "KohakuHub",
  upstream_url: "https://github.com/KohakuBlueleaf/KohakuHub",
  copyright_text: "Derived from KohakuHub © 2025 KohakuBlueLeaf and contributors",
  license_label: "AGPL-3.0",
  license_url: "https://github.com/deepghs/KohakuHub/blob/main/LICENSE",
});

export const DEFAULT_APPEARANCE = Object.freeze({
  footer: DEFAULT_FOOTER,
  theme: DEFAULT_THEME,
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isSafeAppearanceUrl(value, { allowEmpty = true } = {}) {
  if (
    typeof value !== "string" ||
    Array.from(value).length > 2048 ||
    /[\s\\\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    return false;
  }
  if (!value) return allowEmpty;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//i.test(value) &&
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function normalizeFooter(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_FOOTER)) {
    const supplied = Object.hasOwn(value, key) ? value[key] : fallback;
    if (key === "groups") {
      if (!Array.isArray(supplied) || supplied.length > 3) return null;
      result.groups = [];
      for (const group of supplied) {
        if (
          !isObject(group) ||
          typeof group.title !== "string" ||
          !group.title.trim() ||
          Array.from(group.title).length > 100 ||
          !Array.isArray(group.links) ||
          group.links.length > 8
        ) {
          return null;
        }
        const links = [];
        for (const link of group.links) {
          if (
            !isObject(link) ||
            typeof link.label !== "string" ||
            !link.label.trim() ||
            Array.from(link.label).length > 100 ||
            !isSafeAppearanceUrl(link.url, { allowEmpty: false })
          ) {
            return null;
          }
          links.push({ label: link.label.trim(), url: link.url });
        }
        result.groups.push({ title: group.title.trim(), links });
      }
    } else if (key === "show_build_info") {
      if (typeof supplied !== "boolean") return null;
      result[key] = supplied;
    }
  }
  return result;
}

export function normalizeTheme(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_THEME)) {
    const supplied = Object.hasOwn(value, key) ? value[key] : fallback;
    if (key === "default_mode") {
      if (!["system", "light", "dark"].includes(supplied)) return null;
      result[key] = supplied;
    } else {
      if (typeof supplied !== "string" || !/^#[0-9a-f]{6}$/i.test(supplied)) {
        return null;
      }
      result[key] = supplied.toLowerCase();
    }
  }
  return result;
}

export function normalizeAppearance(value) {
  if (!isObject(value)) return null;
  const footer = normalizeFooter(
    Object.hasOwn(value, "footer") ? value.footer : DEFAULT_FOOTER,
  );
  const theme = normalizeTheme(
    Object.hasOwn(value, "theme") ? value.theme : DEFAULT_THEME,
  );
  return footer && theme ? { footer, theme } : null;
}

export function parseCachedAppearance(raw) {
  try {
    const cache = JSON.parse(raw);
    return cache?.version === 1 ? normalizeAppearance(cache.appearance) : null;
  } catch {
    return null;
  }
}

export function readCachedAppearance() {
  try {
    return (
      parseCachedAppearance(globalThis.localStorage.getItem(CACHE_KEY)) ||
      normalizeAppearance(DEFAULT_APPEARANCE)
    );
  } catch {
    return normalizeAppearance(DEFAULT_APPEARANCE);
  }
}

export function saveCachedAppearance(value) {
  const appearance = normalizeAppearance(value);
  if (!appearance) return false;
  try {
    globalThis.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: 1, appearance }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function fetchAppearance() {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch("/api/site-appearance", {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (
          !response.ok ||
          response.headers.get("X-Site-Appearance-Fallback") === "true"
        ) {
          throw new Error("Site appearance is unavailable");
        }
        const appearance = normalizeAppearance(await response.json());
        if (!appearance) throw new Error("Invalid site appearance response");
        return appearance;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Site appearance request timed out"));
        }, 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
