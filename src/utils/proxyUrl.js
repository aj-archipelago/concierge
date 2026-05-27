/**
 * Utilities for proxying blob storage URLs when fetching text content.
 * Used by canvas tabs (article, HTML preview), useArticleEditor, and file previews.
 *
 * Blob storage URLs (Azure, GCS, Azurite) require proxying to bypass CORS.
 */

/** Domains that require text-proxy when fetching (CORS bypass) */
export const TEXT_PROXY_INDICATORS = [
    ".blob.core.windows.net",
    "storage.googleapis.com",
    "storage.cloud.google.com",
    "127.0.0.1:10000",
    "localhost:10000",
];

/**
 * Module-level cache: blob origin+pathname → first proxy URL seen.
 * SAS tokens rotate on every file-list refetch, but the underlying blob is
 * immutable. We lock in the first proxy URL we generate per blob path so the
 * URL stays stable across re-renders and the browser HTTP cache (text-proxy
 * sets Cache-Control: immutable for 30 days) actually hits.
 */
const proxyUrlCache = new Map();

/**
 * Returns the URL to use when fetching text content.
 * Proxies blob storage URLs through /api/text-proxy to bypass CORS.
 *
 * @param {string|null} url - Original URL (e.g. blob storage or public URL)
 * @returns {string|null} - Proxied URL if needed, or original URL; null if url is null
 */
export function getTextProxyUrl(url) {
    if (!url) return null;
    const needsProxy = TEXT_PROXY_INDICATORS.some((ind) => url.includes(ind));
    if (!needsProxy) return url;
    try {
        const urlObj = new URL(url);
        const cacheKey = urlObj.origin + urlObj.pathname;
        const cached = proxyUrlCache.get(cacheKey);
        if (cached) return cached;
        const proxyUrl = `/api/text-proxy?url=${encodeURIComponent(url)}`;
        proxyUrlCache.set(cacheKey, proxyUrl);
        return proxyUrl;
    } catch {
        return `/api/text-proxy?url=${encodeURIComponent(url)}`;
    }
}
