// Collections: the six colours Hugging Face gives a collection, links, and small helpers shared by the pages.
import { buildRepositoryPath } from "@/utils/repo-paths";

export const COLLECTION_THEMES = {
  orange: "#f97316",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  pink: "#ec4899",
  indigo: "#6366f1",
};

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 150;
export const NOTE_MAX = 500;

export function themeColor(theme) {
  return COLLECTION_THEMES[theme] || COLLECTION_THEMES.green;
}

/** `owner/title-slug-<24 hex>` -> the page of the collection (the slug has the owner in front) */
export function collectionPath(slug) {
  return `/collections/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

/** Where an item leads: a repository page, or another collection */
export function itemPath(item) {
  return item.type === "collection"
    ? collectionPath(item.slug)
    : buildRepositoryPath(item.type, item.id);
}

export const ITEM_ICONS = {
  model: "i-carbon-model text-blue-500",
  dataset: "i-carbon-data-table text-green-500",
  space: "i-carbon-application text-purple-500",
  collection: "i-carbon-folder text-amber-500",
};

/** Plain text -> [{ text, href? }]: the web addresses become links (the note is never rendered as HTML) */
export function linkify(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<]+/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], href: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The namespaces the signed-in user may put collections in: themselves and the organizations where they are more than a visitor */
export function writableOwners(auth) {
  if (!auth.isAuthenticated) return [];
  return [
    auth.username,
    ...(auth.organizations || [])
      .filter((org) => org.roleInOrg !== "visitor")
      .map((org) => org.name),
  ];
}

/** Whether to show the controls that change a collection of `owner` (the server decides, a visitor gets 403) */
export function canWriteFor(auth, owner) {
  return writableOwners(auth).includes(owner);
}
