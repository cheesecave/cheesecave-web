import DOMPurify from "isomorphic-dompurify";

// Mermaid's strict mode already cleans the labels it draws. This pass is the second layer: DOMPurify in the HTML
// context that innerHTML uses, with the HTML labels of a diagram (<foreignObject>) kept, animation elements removed
// (they can set an href to a script URL), and every link target checked against web, mail and in-page targets.
const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const LINK_ATTRIBUTES = new Set(["href", "xlink:href"]);

// Browsers ignore spaces, tabs and control characters inside a scheme, so they are removed before the check.
function isSafeLink(value) {
  const compact = value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
  const scheme = compact.match(/^[a-z][a-z0-9+.-]*:/);
  return !scheme || ALLOWED_LINK_SCHEMES.has(scheme[0]);
}

// DOMPurify calls an attribute hook as (node, event)
function dropUnsafeLinks(node, event) {
  if (LINK_ATTRIBUTES.has(event.attrName) && !isSafeLink(event.attrValue)) {
    event.keepAttr = false;
  }
}

/**
 * Make a diagram's SVG safe to insert as markup.
 * @param {string} svg - SVG text as Mermaid returns it
 * @returns {string} - SVG text that is safe to insert
 */
export function sanitizeMermaidSvg(svg) {
  if (!svg) return "";
  // The hook is attached only for this call: the Markdown sanitizer shares this DOMPurify instance
  DOMPurify.addHook("uponSanitizeAttribute", dropUnsafeLinks);
  try {
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      ADD_TAGS: ["foreignObject"],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
      FORBID_TAGS: [
        "script",
        "animate",
        "set",
        "animatemotion",
        "animatetransform",
        "discard",
      ],
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", dropUnsafeLinks);
  }
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
