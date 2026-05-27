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

/** Supported applet UI languages. */
export const SUPPORTED_APPLET_LANGUAGES = new Set(["en", "ar"]);

/**
 * Normalize a language code to a supported applet locale.
 * @param {string} [language="en"]
 * @returns {{ language: "en"|"ar", direction: "ltr"|"rtl" }}
 */
export function normalizeAppletLocale(language = "en") {
    const normalized = String(language || "en")
        .toLowerCase()
        .split("-")[0];
    const resolved = SUPPORTED_APPLET_LANGUAGES.has(normalized)
        ? normalized
        : "en";
    return {
        language: resolved,
        direction: resolved === "ar" ? "rtl" : "ltr",
    };
}

/** Concierge-internal query params that should not be exposed to applets. */
export const RESERVED_APPLET_QUERY_PARAMS = new Set([
    "openChat",
    "openCanvasApplet",
]);

const UNSAFE_APPLET_PARAM_KEYS = new Set([
    "__proto__",
    "constructor",
    "prototype",
]);

function isSafeAppletParamKey(key) {
    return (
        !RESERVED_APPLET_QUERY_PARAMS.has(key) &&
        !UNSAFE_APPLET_PARAM_KEYS.has(key)
    );
}

/**
 * Filter a params object for applet consumption, excluding reserved and unsafe keys.
 * @param {Record<string, string>} [params={}]
 * @returns {Record<string, string>}
 */
export function filterAppletParams(params = {}) {
    const filtered = Object.create(null);
    for (const [key, value] of Object.entries(params)) {
        if (isSafeAppletParamKey(key) && typeof value === "string") {
            filtered[key] = value;
        }
    }
    return filtered;
}

/**
 * Parse URL query params for applet consumption, excluding Concierge-internal keys.
 * @param {string} [search=""] - Query string (with or without leading "?")
 * @returns {Record<string, string>}
 */
export function parseAppletParams(search = "") {
    const normalized = search.startsWith("?") ? search.slice(1) : search;
    const params = Object.create(null);
    for (const [key, value] of new URLSearchParams(normalized).entries()) {
        if (isSafeAppletParamKey(key)) {
            params[key] = value;
        }
    }
    return params;
}

/**
 * Generates the complete HTML template for sandbox/preview iframes with theme filtering applied
 * Extracts head content (styles, scripts) and body content from user HTML and merges them properly
 * @param {string} content - The HTML content to include
 * @param {string} theme - The current theme ('light' or 'dark')
 * @param {object} options - Optional generation flags
 * @param {boolean} options.includeRuntimeScripts - Include platform/runtime scripts
 * @param {string} [options.language] - Applet UI language (en or ar)
 * @param {string} [options.direction] - Text direction (ltr or rtl)
 * @param {Record<string, string>} [options.params] - Query params to inject (defaults to parent page URL)
 * @returns {string} - The complete HTML document with dark classes filtered based on theme
 */
export function generateFilteredSandboxHtml(content, theme, options = {}) {
    const includeRuntimeScripts = options.includeRuntimeScripts !== false;
    const locale = {
        ...normalizeAppletLocale(options.language),
        ...(options.direction === "rtl" || options.direction === "ltr"
            ? { direction: options.direction }
            : {}),
    };

    // Capture parent page query params and inject as window.APPLET_PARAMS
    const params =
        options.params !== undefined
            ? filterAppletParams(options.params)
            : typeof window !== "undefined"
              ? parseAppletParams(window.location.search)
              : Object.create(null);

    // Extract head and body content from the user's HTML
    const { headContent, bodyContent } = extractHtmlStructure(content);

    // Tailwind v4 browser script - required for <style type="text/tailwindcss"> and Tailwind classes in applet body
    const TAILWIND_SCRIPT = includeRuntimeScripts
        ? '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>'
        : "";

    // Recovery script for Tailwind v4 compilation errors (e.g., AI-hallucinated or deprecated v3
    // classes in @apply directives). A single bad @apply prevents ALL Tailwind CSS from generating,
    // breaking the entire page. This catches the error, strips bad @apply rules from AI-generated
    // style blocks, and reloads Tailwind so valid classes still work.
    const TAILWIND_ERROR_RECOVERY = includeRuntimeScripts
        ? `<script>
(function(){
    var recovered = false;
    function recover() {
        if (recovered) return;
        recovered = true;
        document.querySelectorAll('style[type="text/tailwindcss"]:not([data-system])').forEach(function(el) {
            el.textContent = el.textContent.replace(/@apply\\b[^;]*;/g, '');
        });
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
        document.head.appendChild(s);
    }
    window.addEventListener('error', function(e) {
        if (e.message && e.message.includes('unknown utility class')) {
            e.preventDefault();
            recover();
        }
    }, true);
    window.addEventListener('unhandledrejection', function(e) {
        var msg = e.reason && (e.reason.message || String(e.reason));
        if (msg && msg.includes('unknown utility class')) {
            e.preventDefault();
            recover();
        }
    });
})();
</script>`
        : "";

    // Concierge Applet SDK - provides platform functions to applets (e.g. ConciergeSDK.agent.chat())
    const APPLET_SDK_SCRIPT = includeRuntimeScripts
        ? '<script src="/applet-sdk.js"></script>'
        : "";

    // Generate the full HTML document with user's head content merged in
    const fullHtml = `
        <!DOCTYPE html>
        <html data-theme="${theme}" lang="${locale.language}" dir="${locale.direction}">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                ${TAILWIND_ERROR_RECOVERY}
                ${TAILWIND_SCRIPT}
                ${APPLET_SDK_SCRIPT}
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
                    html[dir="rtl"] body {
                        direction: rtl;
                    }
                    html[dir="ltr"] body {
                        direction: ltr;
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
                <style type="text/tailwindcss" data-system>
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
                    // Make theme and locale available to applets via JavaScript
                    window.CONCIERGE_THEME = "${theme}";
                    window.CONCIERGE_PREFERS_COLOR_SCHEME = "${theme}";
                    window.CONCIERGE_LANGUAGE = "${locale.language}";
                    window.CONCIERGE_DIRECTION = "${locale.direction}";

                    // Make querystring params available to applets
                    window.APPLET_PARAMS = ${JSON.stringify(params).replace(/<\//g, "<\\/")};

                    function __conciergeIsTrustedParentMessage(event) {
                        if (!event || event.source !== window.parent) return false;
                        try {
                            var expectedOrigin = window.location.origin;
                            if (expectedOrigin && expectedOrigin !== 'null') {
                                return event.origin === expectedOrigin;
                            }
                            return event.origin === window.parent.location.origin;
                        } catch (e) {
                            return false;
                        }
                    }

                    function __conciergeNormalizeAppletLocale(language, direction) {
                        var lang = String(language || 'en').toLowerCase().split('-')[0];
                        if (lang !== 'ar') lang = 'en';
                        var dir;
                        if (direction === 'rtl' || direction === 'ltr') {
                            dir = direction;
                        } else {
                            dir = lang === 'ar' ? 'rtl' : 'ltr';
                        }
                        return { language: lang, direction: dir };
                    }

                    function __conciergeApplyAppletLocale(language, direction) {
                        var locale = __conciergeNormalizeAppletLocale(language, direction);
                        document.documentElement.setAttribute('lang', locale.language);
                        document.documentElement.setAttribute('dir', locale.direction);
                        window.CONCIERGE_LANGUAGE = locale.language;
                        window.CONCIERGE_DIRECTION = locale.direction;
                        document.dispatchEvent(new CustomEvent('concierge-locale-change', {
                            detail: { language: locale.language, direction: locale.direction }
                        }));
                    }

                    // Listen for theme and locale changes from parent
                    window.addEventListener('message', function(event) {
                        if (!__conciergeIsTrustedParentMessage(event)) return;
                        if (event.data && event.data.type === 'theme-change') {
                            const newTheme = event.data.theme;
                            if (newTheme !== 'light' && newTheme !== 'dark') return;
                            document.documentElement.setAttribute('data-theme', newTheme);
                            document.documentElement.style.setProperty('--prefers-color-scheme', newTheme);
                            window.CONCIERGE_THEME = newTheme;
                            window.CONCIERGE_PREFERS_COLOR_SCHEME = newTheme;
                            document.dispatchEvent(new CustomEvent('concierge-theme-change', {
                                detail: { theme: newTheme }
                            }));
                        }
                        if (event.data && event.data.type === 'locale-change') {
                            __conciergeApplyAppletLocale(event.data.language, event.data.direction);
                        }
                    });
                    
                    // Proxy fetch requests through parent window on iOS Safari to avoid Azure App Service 403 errors.
                    // OutputSandbox can rewrite this document repeatedly, so keep the shim idempotent.
                    window.__CONCIERGE_ORIGINAL_FETCH__ = window.__CONCIERGE_ORIGINAL_FETCH__ || window.fetch;
                    window.__CONCIERGE_IS_IOS__ = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                    
                    window.fetch = function(url, options) {
                        // Normalize URL to string and check if it's a same-origin API request
                        let urlStr;
                        try {
                            if (typeof url === 'string') {
                                urlStr = url;
                            } else if (typeof Request !== 'undefined' && url instanceof Request) {
                                urlStr = url.url;
                            } else if (url instanceof URL) {
                                urlStr = url.href;
                            } else {
                                urlStr = String(url);
                            }
                        } catch (e) {
                            urlStr = String(url);
                        }
                        
                        let requestUrl;
                        try {
                            requestUrl = new URL(urlStr, window.location.href);
                        } catch (e) {
                            requestUrl = null;
                        }

                        const isSameOrigin = !!requestUrl && requestUrl.origin === window.location.origin;
                        const isSameOriginApi = isSameOrigin && requestUrl.pathname.startsWith('/api/');
                        
                        // Only proxy on iOS Safari for same-origin API requests
                        if (window.parent !== window && isSameOriginApi && window.__CONCIERGE_IS_IOS__) {
                            console.log('[Fetch Proxy] Proxying request:', urlStr);
                            return new Promise((resolve, reject) => {
                                const requestId = '__fetch_proxy_' + Date.now() + '_' + Math.random();
                                let resolved = false;
                                
                                // Set up response listener
                                const responseHandler = (event) => {
                                    if (resolved) return;
                                    if (event.data && event.data.type === '__FETCH_PROXY_RESPONSE__' && event.data.requestId === requestId) {
                                        resolved = true;
                                        window.removeEventListener('message', responseHandler);
                                        
                                        if (event.data.error) {
                                            console.error('[Fetch Proxy] Error response:', event.data.error);
                                            reject(new Error(event.data.error));
                                        } else {
                                            console.log('[Fetch Proxy] Success response:', event.data.status);
                                            // Create a Response object that works with .json(), .text(), etc.
                                            const response = new Response(event.data.body, {
                                                status: event.data.status,
                                                statusText: event.data.statusText,
                                                headers: new Headers(event.data.headers || {})
                                            });
                                            resolve(response);
                                        }
                                    }
                                };
                                
                                window.addEventListener('message', responseHandler);
                                
                                // Send request to parent
                                // In srcdoc iframes, window.location.origin is "null" which postMessage rejects
                                // Use '*' as target origin - we verify origin on receiving end for security
                                try {
                                    window.parent.postMessage({
                                        type: '__FETCH_PROXY_REQUEST__',
                                        requestId: requestId,
                                        url: urlStr,
                                        options: options || {}
                                    }, '*');
                                    console.log('[Fetch Proxy] Request sent to parent');
                                } catch (error) {
                                    resolved = true;
                                    window.removeEventListener('message', responseHandler);
                                    console.error('[Fetch Proxy] Failed to send:', error);
                                    reject(new Error('Failed to send proxy request: ' + error.message));
                                    return;
                                }
                                
                                // Timeout after 60 seconds
                                setTimeout(() => {
                                    if (!resolved) {
                                        resolved = true;
                                        window.removeEventListener('message', responseHandler);
                                        console.error('[Fetch Proxy] Timeout after 60s');
                                        reject(new Error('Fetch proxy timeout'));
                                    }
                                }, 60000);
                            });
                        }
                        
                        // Same-origin applet API calls need auth cookies. Cross-origin data/CDN
                        // calls must stay anonymous unless the applet explicitly opts into
                        // credentials; otherwise wildcard CORS responses are rejected.
                        const opts = options ? { ...options } : {};
                        if (isSameOrigin && !opts.credentials) {
                            opts.credentials = 'include';
                        }
                        return window.__CONCIERGE_ORIGINAL_FETCH__.call(this, url, options ? opts : (isSameOrigin ? opts : undefined));
                    };
                    
                    // Also override XMLHttpRequest for compatibility with older code
                    window.__CONCIERGE_ORIGINAL_XHR__ = window.__CONCIERGE_ORIGINAL_XHR__ || window.XMLHttpRequest;
                    window.XMLHttpRequest = function() {
                        const xhr = new window.__CONCIERGE_ORIGINAL_XHR__();
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
