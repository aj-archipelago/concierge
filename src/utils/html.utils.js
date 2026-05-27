/**
 * Allowed HTML tags for DOMPurify sanitization in article content.
 * Used by StoryPreview and Write components to sanitize HTML before rendering.
 */
export const DOMPURIFY_ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "a",
    "img",
    "div",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
];

/**
 * Allowed HTML attributes for DOMPurify sanitization in article content.
 * Used by StoryPreview and Write components to sanitize HTML before rendering.
 */
export const DOMPURIFY_ALLOWED_ATTR = [
    "href",
    "src",
    "alt",
    "title",
    "class",
    "style",
    "target",
    "rel",
    "data-type",
    "data-html",
    "data-original-src",
    "crossorigin",
];

/**
 * Returns DOMPurify configuration object for sanitizing article content.
 * @param {Object} options - Configuration options
 * @param {boolean} options.allowDataAttr - Whether to allow data-* attributes (default: false)
 * @returns {Object} DOMPurify configuration object
 */
export function getDOMPurifyConfig({ allowDataAttr = false } = {}) {
    return {
        ...(allowDataAttr && { ALLOW_DATA_ATTR: true }),
        ALLOWED_TAGS: DOMPURIFY_ALLOWED_TAGS,
        ALLOWED_ATTR: DOMPURIFY_ALLOWED_ATTR,
        ALLOW_UNKNOWN_PROTOCOLS: false,
    };
}

export function stripHTML(html) {
    var tmp = document.createElement("DIV");
    tmp.innerHTML = html;

    // First, replace block-level elements and <br> tags with newlines in the HTML string
    // This preserves paragraph and line break structure before parsing
    let processedHtml = html
        .replace(/<br\s*\/?>/gi, "\n") // Replace <br> tags with newlines
        .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, "\n"); // Replace block elements with newlines

    // Re-parse the modified HTML
    tmp.innerHTML = processedHtml;

    // Extract text content (now with newlines preserved from block elements)
    let text = tmp.textContent || tmp.innerText || "";

    // Clean up excessive whitespace while preserving paragraph breaks
    text = text.replace(/\n{3,}/g, "\n\n"); // Collapse 3+ newlines to 2
    text = text.replace(/[ \t]+/g, " "); // Collapse spaces/tabs (but not newlines)
    text = text.trim();

    return text;
}
