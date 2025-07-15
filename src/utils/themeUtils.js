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
 * @param {string} content - The HTML content to include in the body
 * @param {string} theme - The current theme ('light' or 'dark')
 * @returns {string} - The complete HTML document with dark classes filtered based on theme
 */
export function generateFilteredSandboxHtml(content, theme) {
    // Generate the full HTML document
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
            <body>${content}</body>
        </html>
    `;

    // Apply filtering to the entire HTML document
    return filterDarkClasses(fullHtml, theme);
}
