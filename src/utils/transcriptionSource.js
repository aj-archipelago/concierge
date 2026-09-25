import { isManagedStorageUrl, isLocalStorageUrl } from "./storageOrigins";

// Saved storage paths identify media; expiring access tokens do not.
export function getStoredTranscriptionSource(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    const local = isLocalStorageUrl(url);
    if (!isManagedStorageUrl(url)) return null;
    if (url.username || url.password)
        throw new Error("Invalid saved media URL");
    const parts = url.pathname.split("/").filter(Boolean);
    const blobPath = parts
        .slice(local ? 2 : 1)
        .map(decodeURIComponent)
        .join("/");
    if (!blobPath) throw new Error("Invalid saved media path");
    // A snapshot/version is a different object, even when its path is unchanged.
    const identity = new URL(url.origin + url.pathname);
    for (const key of ["versionid", "snapshot"]) {
        if (url.searchParams.has(key)) {
            identity.searchParams.set(key, url.searchParams.get(key));
        }
    }
    return { blobPath, identity: identity.href, versioned: !!identity.search };
}

export function getTranscriptionSourceIdentity(value) {
    if (!value) return "";
    const stored = getStoredTranscriptionSource(value);
    if (stored) return stored.identity;
    try {
        const url = new URL(value);
        url.hash = "";
        return url.href;
    } catch {
        return String(value);
    }
}
