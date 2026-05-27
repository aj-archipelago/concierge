import { injectAppletIdMeta } from "./appletHtmlUtils";

/**
 * Ensures the Concierge Applet SDK script tag is present in HTML content.
 * If missing, injects <script src="/applet-sdk.js"></script> into <head>,
 * or before </body>, or prepends it as a fallback.
 * @param {string} html - The applet HTML content
 * @returns {string} - HTML with the SDK script tag guaranteed to be present
 */
export function ensureAppletSdkScript(html) {
    if (!html || typeof html !== "string") {
        return html;
    }

    // Already has the SDK script tag — nothing to do
    if (html.includes("applet-sdk.js")) {
        return html;
    }

    const scriptTag = '<script src="/applet-sdk.js"></script>';

    // Try to inject into <head> (before </head>)
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `    ${scriptTag}\n</head>`);
    }

    // No <head> — try before </body>
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    }

    // No structural tags — prepend
    return scriptTag + "\n" + html;
}

export function ensureAppletRuntimeHtml(html, { appletId = null } = {}) {
    const withSdk = ensureAppletSdkScript(html);
    return injectAppletIdMeta(withSdk, appletId);
}
