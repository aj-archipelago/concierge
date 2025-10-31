/**
 * Extracts head and body content from HTML, handling both complete and incomplete HTML
 * Returns an object with headContent and bodyContent
 * @param {string} content - The HTML content to parse
 * @returns {object} - Object with headContent and bodyContent properties
 */
export function extractHtmlStructure(content) {
    if (!content || typeof content !== "string") {
        return { headContent: "", bodyContent: "" };
    }

    let html = content.trim();
    let headContent = "";
    let bodyContent = "";

    // Only process if content appears to start with structural tags
    const startsWithStructuralTag = /^\s*(<!DOCTYPE|<html|<head|<body)/i.test(
        html,
    );

    if (!startsWithStructuralTag) {
        // Content doesn't start with structural tags, treat it all as body content
        return { headContent: "", bodyContent: html };
    }

    // Remove DOCTYPE declarations
    html = html.replace(/^\s*<!DOCTYPE\s+[^>]*>/gi, "");
    html = html.replace(/^\s*<!DOCTYPE[^<]*/gi, "");

    // Remove <html> tags (opening and closing)
    html = html.replace(/^\s*<\/?\s*html(\s+[^>]*)?>/gi, "");
    html = html.replace(/^\s*<\/?\s*html[^<>\s]*/gi, "");
    html = html.replace(/<\/html>\s*$/gi, "");

    // Extract <head> content
    const headMatch = html.match(/^\s*<head(\s+[^>]*)?>([\s\S]*?)<\/head>/i);
    if (headMatch) {
        headContent = headMatch[2];
        // Remove the head tag but keep everything after it
        html = html.replace(/^\s*<head(\s+[^>]*)?>[\s\S]*?<\/head>/gi, "");
    } else {
        // Handle incomplete head tag during streaming
        // Only extract if we haven't seen a <body> tag yet
        if (!/<body/i.test(html)) {
            const incompleteHeadMatch = html.match(
                /^\s*<head(\s+[^>]*)?>([\s\S]*)$/i,
            );
            if (incompleteHeadMatch) {
                // During streaming, we might have incomplete head
                // Extract head content but keep everything after </head> or after <head> tag
                const headTagEnd = incompleteHeadMatch[0].length;
                const afterHead = html.substring(headTagEnd);
                // If there's content after head tag, it might be body content
                if (afterHead.trim()) {
                    html = afterHead;
                } else {
                    // No content after head, clear headContent since it's incomplete
                    headContent = "";
                    html = html.replace(/^\s*<head(\s+[^>]*)?>/gi, "");
                }
            }
        }
        // Remove any incomplete head opening tags
        html = html.replace(/^\s*<head[^>]*>/gi, "");
    }

    // Extract <body> content
    const bodyMatch = html.match(/^\s*<body(\s+[^>]*)?>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        bodyContent = bodyMatch[2];
    } else {
        // Handle incomplete body tag during streaming
        const incompleteBodyMatch = html.match(
            /^\s*<body(\s+[^>]*)?>([\s\S]*)$/i,
        );
        if (incompleteBodyMatch) {
            bodyContent = incompleteBodyMatch[2];
        } else {
            // No body tag found, treat remaining content as body
            // This handles cases where content doesn't have a body tag yet (during streaming)
            // or is just raw HTML without structural tags
            bodyContent = html;
        }
    }

    // Remove any remaining closing tags
    bodyContent = bodyContent.replace(/<\/body>\s*$/gi, "");
    bodyContent = bodyContent.trim();

    return { headContent: headContent.trim(), bodyContent };
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
                    body { 
                        margin: 0; 
                        font-family: system-ui, -apple-system, sans-serif;
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
                </script>
            </head>
            <body>${bodyContent}</body>
        </html>
    `;

    // Apply filtering to the entire HTML document
    return filterDarkClasses(fullHtml, theme);
}
