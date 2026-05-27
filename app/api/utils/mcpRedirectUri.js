/**
 * MCP dynamic registration needs a real HTTPS (or allowed) callback.
 *
 * - Rewrites origin using NEXT_PUBLIC_APP_URL when set.
 * - Sandbox iframes can send "null/code/..." (opaque origin + path); we
 *   recover the path and attach a real origin from env or the request Host.
 *
 * @param {string} clientRedirectUri
 * @param {Request} [request] - Current request (for Host fallback)
 * @returns {string}
 */
export function normalizeMcpRedirectUri(clientRedirectUri, request) {
    if (!clientRedirectUri || typeof clientRedirectUri !== "string") {
        return clientRedirectUri;
    }

    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(
        /\/$/,
        "",
    );
    const raw = clientRedirectUri.trim();

    let pathname = "";
    let search = "";
    let clientOrigin = null;

    if (raw.indexOf("null/") === 0) {
        const rest = raw.slice(5);
        pathname = "/" + rest.replace(/^\/+/, "").split("?")[0];
        const qi = rest.indexOf("?");
        search = qi >= 0 ? rest.slice(qi) : "";
    } else if (/^https?:\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            clientOrigin = u.origin;
            pathname = u.pathname;
            search = u.search;
        } catch {
            return clientRedirectUri;
        }
    } else {
        const qGlobal = raw.indexOf("?");
        const pathPart = qGlobal >= 0 ? raw.slice(0, qGlobal) : raw;
        pathname = pathPart.startsWith("/")
            ? pathPart
            : "/" + pathPart.replace(/^\/+/, "");
        search = qGlobal >= 0 ? raw.slice(qGlobal) : "";
    }

    let outOrigin = null;
    if (process.env.NEXT_PUBLIC_APP_URL) {
        try {
            outOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
        } catch {
            /* ignore */
        }
    }
    if (!outOrigin && clientOrigin) {
        outOrigin = clientOrigin;
    }
    if (!outOrigin && request) {
        const host =
            request.headers.get("x-forwarded-host") ||
            request.headers.get("host");
        if (host) {
            const proto = request.headers.get("x-forwarded-proto") || "http";
            outOrigin = `${proto}://${host}`;
        }
    }

    if (!outOrigin) {
        return clientRedirectUri;
    }

    let path = pathname + search;
    if (basePath && path !== basePath && !path.startsWith(basePath + "/")) {
        path = basePath + (path.startsWith("/") ? path : "/" + path);
    }

    return `${outOrigin}${path}`;
}

export function normalizeAtlassianMcpRedirectUri(clientRedirectUri, request) {
    return normalizeMcpRedirectUri(clientRedirectUri, request);
}

/**
 * Returns the origin we trust for OAuth redirect URIs on this request:
 * NEXT_PUBLIC_APP_URL when set, otherwise the request's own host. Used to
 * reject client-provided redirectUri values that point at an unrelated
 * origin — without this check a caller could supply
 * "https://attacker.com/code/mcp" and exfiltrate the OAuth code.
 *
 * @param {Request} [request]
 * @returns {string|null}
 */
export function getTrustedMcpRedirectOrigin(request) {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        try {
            return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
        } catch {
            /* fall through */
        }
    }
    if (request) {
        const host =
            request.headers.get("x-forwarded-host") ||
            request.headers.get("host");
        if (host) {
            const proto = request.headers.get("x-forwarded-proto") || "http";
            return `${proto}://${host}`;
        }
    }
    return null;
}
