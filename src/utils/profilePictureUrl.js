const BLOB_STORAGE_HOST_SUFFIXES = [".blob.core.windows.net"];
const BLOB_STORAGE_HOSTS = [
    "storage.googleapis.com",
    "storage.cloud.google.com",
    "127.0.0.1",
    "localhost",
];
const LOCAL_BASE_URL = "http://localhost";
const PROFILE_PICTURE_PROXY_PATH = "/api/image-proxy";
const PROFILE_PICTURE_FILE_SCOPE = "profile";

function isBlobStorageHost(hostname) {
    return (
        BLOB_STORAGE_HOSTS.includes(hostname) ||
        BLOB_STORAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    );
}

function extractProxyParam(url, param) {
    if (!url?.startsWith("/api/")) return null;

    try {
        const proxyUrl = new URL(url, LOCAL_BASE_URL);
        return proxyUrl.searchParams.get(param);
    } catch {
        return null;
    }
}

function buildProfilePictureProxyUrl({ blobPath, contextId }) {
    const searchParams = new URLSearchParams({
        blobPath,
        contextId,
        fileScope: PROFILE_PICTURE_FILE_SCOPE,
    });

    return `${PROFILE_PICTURE_PROXY_PATH}?${searchParams.toString()}`;
}

function extractBlobPathFromUrl(url) {
    if (!url) return null;

    try {
        const parsedUrl = new URL(url);
        if (!isBlobStorageHost(parsedUrl.hostname)) {
            return null;
        }

        const segments = parsedUrl.pathname.split("/").filter(Boolean);
        const isAzurite =
            parsedUrl.hostname === "127.0.0.1" ||
            parsedUrl.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;

        return segments.slice(skip).map(decodeURIComponent).join("/");
    } catch {
        return null;
    }
}

export function normalizeProfilePictureUrl(url, options = {}) {
    const { contextId = extractProxyParam(url, "contextId"), blobPath = null } =
        options;

    if (!url && !blobPath) return url;

    const wrappedUrl = extractProxyParam(url, "url");
    const resolvedBlobPath =
        blobPath ||
        extractProxyParam(url, "blobPath") ||
        extractBlobPathFromUrl(url) ||
        extractBlobPathFromUrl(wrappedUrl);

    if (resolvedBlobPath && contextId) {
        return buildProfilePictureProxyUrl({
            blobPath: resolvedBlobPath,
            contextId,
        });
    }

    return url;
}
