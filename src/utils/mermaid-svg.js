// Mermaid's strict mode already cleans the labels it draws. What is left to remove here: elements that run code or
// load other documents, every event-handler attribute, and link targets that are not web, mail or in-page links.
// (DOMPurify's SVG profile would also drop the HTML labels inside <foreignObject>, so it is not used here.)
const FORBIDDEN_ELEMENTS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "base",
  "form",
]);
const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// Browsers ignore spaces, tabs and control characters inside a scheme, so they are removed before the check.
function isSafeLink(value) {
  const compact = value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
  const scheme = compact.match(/^[a-z][a-z0-9+.-]*:/);
  return !scheme || ALLOWED_LINK_SCHEMES.has(scheme[0]);
}

/**
 * Make a diagram's SVG safe to insert.
 * @param {string} svg - SVG text as Mermaid returns it
 * @returns {string} - SVG text that is safe to insert
 */
export function sanitizeMermaidSvg(svg) {
  if (!svg) return "";
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  for (const element of [...doc.querySelectorAll("*")]) {
    if (FORBIDDEN_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        (attribute.localName === "href" && !isSafeLink(attribute.value))
      ) {
        element.removeAttributeNode(attribute);
      }
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
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
