export const DEFAULT_HOMEPAGE = Object.freeze({
  enabled: true,
  eyebrow: "THE HOME FOR YOUR AI PROJECTS",
  title: "Your next idea starts here.",
  description:
    "Discover, share, and build with models, datasets, and spaces. A home for your work and your community.",
  primary_label: "Get Started",
  primary_url: "/get-started",
  secondary_label: "Host Your Own Hub",
  secondary_url: "/self-hosted",
  illustration: "mouse-cheese",
  animation_enabled: true,
  show_repositories: true,
});

export function isSafeHomepageUrl(value) {
  if (value === "") return true;
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\\\u0000-\u001f\u007f-\u009f]/.test(value)
  )
    return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//i.test(value) &&
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function normalizeHomepage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = { ...DEFAULT_HOMEPAGE, ...value };
  for (const key of ["enabled", "animation_enabled", "show_repositories"]) {
    if (typeof result[key] !== "boolean") return null;
  }
  for (const [key, limit] of Object.entries({
    eyebrow: 100,
    title: 200,
    description: 2000,
    primary_label: 80,
    secondary_label: 80,
  })) {
    if (
      typeof result[key] !== "string" ||
      Array.from(result[key]).length > limit
    )
      return null;
  }
  if (
    !result.title.trim() ||
    !["mouse-cheese", "none"].includes(result.illustration)
  )
    return null;
  if (
    !["primary_url", "secondary_url"].every((key) =>
      isSafeHomepageUrl(result[key]),
    )
  )
    return null;
  return Object.fromEntries(
    Object.keys(DEFAULT_HOMEPAGE).map((key) => [key, result[key]]),
  );
}

export async function fetchHomepage({ signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 4000);
  try {
    const response = await fetch("/api/site-homepage", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Homepage configuration is unavailable");
    const config = normalizeHomepage(await response.json());
    if (!config) throw new Error("Invalid homepage configuration");
    return config;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
