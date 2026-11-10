import MarkdownIt from "markdown-it";
import { getRepositoryType } from "./repository-types";

export function guestRepositoryTabs(repository) {
  const path = `/${repository.type}s/${encodeURIComponent(repository.namespace)}/${encodeURIComponent(repository.name)}`;
  return [
    {
      key: "card",
      label: `${getRepositoryType(repository.type).label} Card`,
      to: path,
    },
    { key: "files", label: "Files", to: `${path}/tree/main` },
    { key: "commits", label: "Commits", to: `${path}/commits/main` },
    { key: "metadata", label: "Metadata", to: `${path}?tab=metadata` },
  ];
}

export function repositoryFromRoute(route) {
  const match = /^\/(models|datasets|spaces)\/([^/]+)\/([^/]+)(?:\/|$)/.exec(
    route.path || "",
  );
  return match
    ? {
        type: match[1].slice(0, -1),
        namespace: decodeURIComponent(match[2]),
        name: decodeURIComponent(match[3]),
      }
    : null;
}

export function visibilityPayload(visibility) {
  if (!["public", "private", "invite"].includes(visibility))
    throw new Error("Select a repository visibility");
  return {
    private: visibility !== "public",
    invite_mode: visibility === "invite",
  };
}

export const INACTIVE_GRANT_NOTICE =
  "This account grant is revoked or expired. Contact the repository manager.";
export function isAccountGrantActive(grant, now = Date.now()) {
  return Boolean(
    grant &&
      !grant.revoked_at &&
      (!grant.expires_at || Date.parse(grant.expires_at) > now),
  );
}

// Remove resource-bearing tokens before any HTML parser sees them. This renderer
// never emits raw HTML or media; it does not inherit private repository context.
const publicMarkdown = new MarkdownIt({ html: true, linkify: true });
publicMarkdown.renderer.rules.html_inline = () => "";
publicMarkdown.renderer.rules.html_block = () => "";
publicMarkdown.renderer.rules.image = (tokens, index) =>
  publicMarkdown.utils.escapeHtml(tokens[index].content);
const renderLink =
  publicMarkdown.renderer.rules.link_open ||
  ((tokens, index, options, environment, renderer) =>
    renderer.renderToken(tokens, index, options));
publicMarkdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  environment,
  renderer,
) => {
  const token = tokens[index];
  const href = token.attrGet("href") || "";
  let allowed = /^#[\w-]*$/.test(href);
  if (/^https?:\/\//i.test(href)) {
    try {
      allowed = new URL(href).origin !== window.location.origin;
    } catch {
      /* Invalid URLs stay blocked. */
    }
  }
  if (!allowed) {
    token.tag = "span";
    token.attrs = [];
    let depth = 1;
    for (let i = index + 1; i < tokens.length; i++) {
      depth += tokens[i].nesting;
      if (!depth) {
        tokens[i].tag = "span";
        break;
      }
    }
  } else token.attrSet("rel", "noopener noreferrer");
  return renderLink(tokens, index, options, environment, renderer);
};
export function renderPublicInviteMarkdown(markdown) {
  return publicMarkdown.render(markdown || "");
}
