import DOMPurify from "dompurify";
import { parseFragment } from "parse5";
import sanitizeHtml from "sanitize-html";

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

function parseHtml(html) {
    // lgtm[js/xss-through-dom, js/xss] - safe: output always passed through DOMPurify.sanitize before use
    return new DOMParser().parseFromString(String(html || ""), "text/html");
}

export function removeScriptAndStyleBlocks(value) {
    const doc = parseHtml(value);
    doc.querySelectorAll("script, style").forEach((el) => el.remove());
    return DOMPurify.sanitize(doc.body.innerHTML);
}

const PLAIN_TEXT_BLOCK_TAGS = new Set([
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "tr",
]);

const HTML_ENTITY_VALUES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    nbsp: " ",
};

const HTML_ENTITY_TOKENS = {
    amp: "__HTML_ENTITY_AMP__",
    lt: "__HTML_ENTITY_LT__",
    gt: "__HTML_ENTITY_GT__",
    quot: "__HTML_ENTITY_QUOT__",
    "#39": "__HTML_ENTITY_APOS__",
    nbsp: "__HTML_ENTITY_NBSP__",
};

function decodeHtmlEntities(text) {
    return String(text || "").replace(
        /&(amp|lt|gt|quot|#39|nbsp);/g,
        (_, entity) => HTML_ENTITY_VALUES[entity] ?? `&${entity};`,
    );
}

function protectLiteralEntities(text) {
    return String(text || "").replace(
        /&(amp|lt|gt|quot|#39|nbsp);/g,
        (_, entity) => HTML_ENTITY_TOKENS[entity] ?? `&${entity};`,
    );
}

function restoreLiteralEntities(text) {
    return Object.entries(HTML_ENTITY_TOKENS).reduce(
        (result, [entity, token]) => result.replaceAll(token, `&${entity};`),
        String(text || ""),
    );
}

function htmlFragmentToPlainText(html, { preserveBlockBreaks = false } = {}) {
    let text = "";
    const fragment = parseFragment(String(html || ""));

    const visitNode = (node) => {
        if (node.nodeName === "#text") {
            text += node.value;
            return;
        }

        const tagName = node.tagName || node.nodeName;

        if (!tagName || tagName === "script" || tagName === "style") {
            return;
        }

        if (preserveBlockBreaks && tagName === "br") {
            text += "\n";
            return;
        }

        const shouldAddBlockBreaks =
            preserveBlockBreaks && PLAIN_TEXT_BLOCK_TAGS.has(tagName);

        if (shouldAddBlockBreaks) {
            text += "\n";
        }

        node.childNodes?.forEach(visitNode);

        if (shouldAddBlockBreaks) {
            text += "\n";
        }
    };

    fragment.childNodes?.forEach(visitNode);

    return text;
}

export function stripHtmlToPlainTextFragment(html) {
    return htmlFragmentToPlainText(html).replace(/\s+/g, " ").trim();
}

export function stripHTML(html) {
    // sanitize-html removes script/style with their content (via nonTextTags default)
    // and keeps only the structural tags we want to convert to newlines.
    let text = sanitizeHtml(protectLiteralEntities(decodeHtmlEntities(html)), {
        allowedTags: [
            "br",
            "p",
            "div",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "li",
            "tr",
        ],
        allowedAttributes: {},
    });

    text = htmlFragmentToPlainText(text, { preserveBlockBreaks: true });
    text = restoreLiteralEntities(text);

    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.replace(/[ \t]+/g, " ");
    return text.trim();
}
