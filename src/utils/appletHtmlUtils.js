function escapeHtmlAttribute(value) {
    return (value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "&#39;")
        .replace(/"/g, "&quot;");
}

function injectMetaTag(html, metaMarkup) {
    if (!html || typeof html !== "string") {
        return html;
    }

    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `    ${metaMarkup}\n</head>`);
    }

    if (/<body[^>]*>/i.test(html)) {
        return html.replace(
            /<body[^>]*>/i,
            (match) => `${match}\n${metaMarkup}`,
        );
    }

    return `${metaMarkup}\n${html}`;
}

export function injectAppletMetaTags(html, appletName) {
    let taggedHtml = html;

    if (!/<meta\s+name=["']concierge-type["']/i.test(taggedHtml)) {
        taggedHtml = injectMetaTag(
            taggedHtml,
            '<meta name="concierge-type" content="applet">',
        );
    }

    if (appletName && !/<meta\s+name=["']applet-name["']/i.test(taggedHtml)) {
        taggedHtml = taggedHtml.replace(
            /(<meta\s+name=["']concierge-type["'][^>]*>)/i,
            `$1\n    <meta name="applet-name" content="${escapeHtmlAttribute(appletName)}">`,
        );
    }

    return taggedHtml;
}

export function injectAppletIdMeta(html, appletId) {
    if (!html || typeof html !== "string" || !appletId) {
        return html;
    }

    if (/<meta\s+name=["']applet-id["']/i.test(html)) {
        return html.replace(
            /<meta\s+name=["']applet-id["']\s+content=["'][^"']*["']\s*\/?>/i,
            `<meta name="applet-id" content="${escapeHtmlAttribute(appletId)}">`,
        );
    }

    const appletIdMeta = `<meta name="applet-id" content="${escapeHtmlAttribute(appletId)}">`;

    if (/<meta\s+name=["']concierge-type["'][^>]*>/i.test(html)) {
        return html.replace(
            /(<meta\s+name=["']concierge-type["'][^>]*>)/i,
            `$1\n    ${appletIdMeta}`,
        );
    }

    return injectMetaTag(html, appletIdMeta);
}
