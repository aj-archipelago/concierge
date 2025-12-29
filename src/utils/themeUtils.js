/**
 * Extracts head and body content from HTML, handling both complete and incomplete HTML
 * Uses DOM parsing for robustness with malformed or streaming content
 * @param {string} content - The HTML content to parse
 * @returns {object} - Object with headContent and bodyContent properties
 */
export function extractHtmlStructure(content) {
    if (!content || typeof content !== "string") {
        return { headContent: "", bodyContent: "" };
    }

    let html = content.trim();

    // Only process if content appears to start with structural tags
    const startsWithStructuralTag = /^\s*(<!DOCTYPE|<html|<head|<body)/i.test(
        html,
    );

    if (!startsWithStructuralTag) {
        // Content doesn't start with structural tags, treat it all as body content
        return { headContent: "", bodyContent: html };
    }

    // Use DOM parser for more robust extraction
    // This handles incomplete/malformed HTML better than regex
    try {
        const parser = new DOMParser();
        // Wrap in a complete HTML structure so parser can handle incomplete content
        const wrappedHtml = `<html>${html}</html>`;
        const doc = parser.parseFromString(wrappedHtml, "text/html");

        // Extract head content
        let headContent = "";
        const headElement = doc.querySelector("head");
        if (headElement) {
            // Get all child nodes of head (styles, scripts, meta tags, etc.)
            headContent = Array.from(headElement.childNodes)
                .map((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        return node.outerHTML;
                    } else if (
                        node.nodeType === Node.TEXT_NODE &&
                        node.textContent.trim()
                    ) {
                        return node.textContent;
                    }
                    return "";
                })
                .filter(Boolean)
                .join("\n");
        }

        // Extract body content
        let bodyContent = "";
        const bodyElement = doc.querySelector("body");
        if (bodyElement) {
            // Get innerHTML of body (all content inside body tag)
            bodyContent = bodyElement.innerHTML;
        } else {
            // No body tag found - check if content is just body-level elements
            // The parser might have put content directly in html element
            const htmlElement = doc.documentElement;
            if (htmlElement) {
                // Get all nodes that aren't head
                const nonHeadNodes = Array.from(htmlElement.childNodes).filter(
                    (node) => node.nodeName.toLowerCase() !== "head",
                );
                bodyContent = nonHeadNodes
                    .map((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.outerHTML;
                        } else if (
                            node.nodeType === Node.TEXT_NODE &&
                            node.textContent.trim()
                        ) {
                            return node.textContent;
                        }
                        return "";
                    })
                    .filter(Boolean)
                    .join("\n");
            }
        }

        return {
            headContent: headContent.trim(),
            bodyContent: bodyContent.trim(),
        };
    } catch (error) {
        // Fallback to regex-based extraction if DOM parsing fails
        console.warn("DOM parsing failed, using regex fallback:", error);

        // Fallback regex extraction (simplified version)
        let headContent = "";
        let bodyContent = "";

        // Remove DOCTYPE declarations
        html = html.replace(/^\s*<!DOCTYPE\s+[^>]*>/gi, "");
        html = html.replace(/^\s*<!DOCTYPE[^<]*/gi, "");

        // Remove <html> tags
        html = html.replace(/^\s*<\/?\s*html(\s+[^>]*)?>/gi, "");
        html = html.replace(/^\s*<\/?\s*html[^<>\s]*/gi, "");
        html = html.replace(/<\/html>\s*$/gi, "");

        // Extract <head> content
        const headMatch = html.match(
            /^\s*<head(\s+[^>]*)?>([\s\S]*?)<\/head>/i,
        );
        if (headMatch) {
            headContent = headMatch[2];
            html = html.replace(/^\s*<head(\s+[^>]*)?>[\s\S]*?<\/head>/gi, "");
        } else {
            const incompleteHeadMatch = html.match(
                /^\s*<head(\s+[^>]*)?>([\s\S]*)$/i,
            );
            if (incompleteHeadMatch && !/<body/i.test(html)) {
                const headTagEnd = incompleteHeadMatch[0].length;
                const afterHead = html.substring(headTagEnd);
                if (afterHead.trim()) {
                    html = afterHead;
                } else {
                    headContent = "";
                    html = html.replace(/^\s*<head(\s+[^>]*)?>/gi, "");
                }
            }
            html = html.replace(/^\s*<head[^>]*>/gi, "");
        }

        // Extract <body> content
        const bodyMatch = html.match(
            /^\s*<body(\s+[^>]*)?>([\s\S]*?)<\/body>/i,
        );
        if (bodyMatch) {
            bodyContent = bodyMatch[2];
        } else {
            const incompleteBodyMatch = html.match(
                /^\s*<body(\s+[^>]*)?>([\s\S]*)$/i,
            );
            if (incompleteBodyMatch) {
                bodyContent = incompleteBodyMatch[2];
            } else {
                bodyContent = html;
            }
        }

        bodyContent = bodyContent.replace(/<\/body>\s*$/gi, "");

        return {
            headContent: headContent.trim(),
            bodyContent: bodyContent.trim(),
        };
    }
}

/**
 * Filters out dark mode classes from HTML content based on the current theme
 * @param {string} content - The HTML content to filter
 * @param {string} theme - The current theme ('light' or 'dark')
 * @returns {string} - The filtered HTML content
 */
export function filterDarkClasses(content, theme) {
    // Handle null or undefined content
    if (!content) {
        return "";
    }

    if (theme === "dark") {
        return content; // Keep all classes for dark theme
    }

    // Remove all dark: classes from the HTML content
    return content.replace(/\bdark:[^\s"'`>]+/g, "");
}

/**
 * Generates the complete HTML template for sandbox/preview iframes with theme filtering applied
 * Extracts head content (styles, scripts) and body content from user HTML and merges them properly
 * @param {string} content - The HTML content to include
 * @param {string} theme - The current theme ('light' or 'dark')
 * @returns {string} - The complete HTML document with dark classes filtered based on theme
 */
export function generateFilteredSandboxHtml(content, theme) {
    // Extract head and body content from the user's HTML
    const { headContent, bodyContent } = extractHtmlStructure(content);

    // Generate the full HTML document with user's head content merged in
    const fullHtml = `
        <!DOCTYPE html>
        <html data-theme="${theme}">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                    }
                    html {
                        height: auto;
                    }
                    body { 
                        font-family: system-ui, -apple-system, sans-serif;
                        min-height: auto;
                        height: auto;
                        background-color: #ffffff;
                    }
                    html[data-theme="dark"] body {
                        background-color: #1f2937; /* gray-800 - matches layout content container */
                    }
                    /* Ensure images don't overflow */
                    img { max-width: 100%; height: auto; }
                    
                    /* Theme-aware styles for applets */
                    html[data-theme="dark"] {
                        color-scheme: dark;
                    }
                    html[data-theme="light"] {
                        color-scheme: light;
                    }
                    
                    /* CSS custom property for applets to use */
                    :root {
                        --prefers-color-scheme: ${theme};
                    }
                    
                    /* Override prefers-color-scheme media queries based on theme */
                    html[data-theme="dark"] {
                        /* Force dark mode regardless of system preference */
                        color-scheme: dark;
                    }
                    
                    html[data-theme="light"] {
                        /* Force light mode regardless of system preference */
                        color-scheme: light;
                    }
                    
                    /* Hide pre elements with llm-output class - they're replaced by React portals */
                    pre.llm-output {
                        display: none !important;
                    }
                </style>
                <style type="text/tailwindcss">
                    /* Styles for rendered markdown content from the LLM */
                    .chat-message {
                        @apply text-sm text-gray-800 dark:text-gray-200 leading-relaxed;
                    }
                    .chat-message p {
                        @apply mb-4;
                    }
                    .chat-message h1, .chat-message h2, .chat-message h3, .chat-message h4, .chat-message h5, .chat-message h6 {
                        @apply font-semibold text-gray-900 dark:text-white my-4;
                    }
                    .chat-message h1 { @apply text-2xl; }
                    .chat-message h2 { @apply text-xl; }
                    .chat-message h3 { @apply text-lg; }
                    .chat-message a {
                        @apply text-sky-500 hover:underline dark:text-sky-400;
                    }
                    .chat-message ul, .chat-message ol {
                        @apply my-4 pl-5 space-y-1;
                    }
                    .chat-message ul { @apply list-disc list-outside; }
                    .chat-message ol { @apply list-decimal list-outside; }
                    .chat-message li::marker {
                        @apply text-gray-500;
                    }
                    .chat-message blockquote {
                        @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic text-gray-600 dark:text-gray-400;
                    }
                    .chat-message hr {
                        @apply border-t border-gray-300 dark:border-gray-600 my-6;
                    }
                    .chat-message code {
                        @apply bg-gray-100 dark:bg-gray-700 rounded-md px-1.5 py-1 font-mono text-sm text-sky-600 dark:text-sky-400;
                    }
                    .chat-message strong {
                        @apply font-semibold;
                    }
                    .chat-message table {
                        @apply w-full my-4 text-left border-collapse;
                    }
                    .chat-message th, .chat-message td {
                        @apply border border-gray-300 dark:border-gray-600 p-2;
                    }
                    .chat-message th {
                        @apply bg-gray-100 dark:bg-gray-700 font-semibold;
                    }
                </style>
                ${headContent}
                <script>
                    // Make theme available to applets via JavaScript
                    window.LABEEB_THEME = "${theme}";
                    window.LABEEB_PREFERS_COLOR_SCHEME = "${theme}";
                    
                    // Listen for theme changes from parent
                    window.addEventListener('message', function(event) {
                        if (event.data && event.data.type === 'theme-change') {
                            const newTheme = event.data.theme;
                            document.documentElement.setAttribute('data-theme', newTheme);
                            document.documentElement.style.setProperty('--prefers-color-scheme', newTheme);
                            window.LABEEB_THEME = newTheme;
                            window.LABEEB_PREFERS_COLOR_SCHEME = newTheme;
                        }
                    });
                    
                    // Override fetch to always include credentials for iOS Safari iframe cookie support
                    // iOS Safari blocks cookies in iframes unless credentials: 'include' is set
                    const originalFetch = window.fetch;
                    window.fetch = function(url, options) {
                        const opts = options || {};
                        // Ensure credentials are included for same-origin requests
                        if (!opts.credentials) {
                            opts.credentials = 'include';
                        }
                        return originalFetch.call(this, url, opts);
                    };
                    
                    // Also override XMLHttpRequest for compatibility with older code
                    const OriginalXHR = window.XMLHttpRequest;
                    window.XMLHttpRequest = function() {
                        const xhr = new OriginalXHR();
                        const originalOpen = xhr.open;
                        xhr.open = function(method, url, async, user, password) {
                            originalOpen.call(this, method, url, async, user, password);
                            // Set withCredentials after open() is called
                            if (url && (url.startsWith('/') || url.startsWith(window.location.origin))) {
                                this.withCredentials = true;
                            }
                        };
                        return xhr;
                    };
                </script>
            </head>
            <body>${bodyContent}</body>
        </html>
    `;

    // Apply filtering to the entire HTML document
    return filterDarkClasses(fullHtml, theme);
}
