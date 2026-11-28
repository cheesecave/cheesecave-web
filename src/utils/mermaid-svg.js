import DOMPurify from "isomorphic-dompurify";

// Mermaid output is SVG that the page inserts as markup, so it gets the same care as Markdown HTML. Its links are the
// one place a diagram can run script (a `click` directive): only web, mail and in-page or relative targets survive.
const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// Browsers ignore spaces, tabs and control characters inside a scheme, so they are removed before the check.
function isSafeLink(value) {
  const compact = value.replace(/[\u0000- \u007f]/g, "").toLowerCase();
  const scheme = compact.match(/^[a-z][a-z0-9+.-]*:/);
  return !scheme || ALLOWED_LINK_SCHEMES.has(scheme[0]);
}

/**
 * Make a diagram's SVG safe to insert: script-scheme link targets are removed, then the markup is sanitized.
 * @param {string} svg - SVG text as Mermaid returns it
 * @returns {string} - SVG text that is safe to insert
 */
export function sanitizeMermaidSvg(svg) {
  if (!svg) return "";
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  for (const element of doc.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (attribute.localName === "href" && !isSafeLink(attribute.value)) {
        element.removeAttributeNode(attribute);
      }
    }
  }
  return DOMPurify.sanitize(
    new XMLSerializer().serializeToString(doc.documentElement),
    {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script"],
    },
  );
}

/**
 * The box shown when a diagram cannot be rendered. The message is set as text, never parsed as markup.
 * @param {string} message - Error text, which may contain parts of the diagram source
 * @returns {HTMLElement}
 */
export function mermaidErrorBox(message) {
  const box = document.createElement("div");
  box.className = "mermaid-error";
  box.innerHTML = `
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 text-sm">
      <div class="font-semibold text-red-600 dark:text-red-400 mb-2">Mermaid Rendering Error</div>
      <div class="error-message text-red-700 dark:text-red-300"></div>
    </div>`;
  box.querySelector(".error-message").textContent = message;
  return box;
}
