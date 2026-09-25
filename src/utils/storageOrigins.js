const LOCAL_STORAGE_ORIGINS = [
    "http://localhost:10000",
    "http://127.0.0.1:10000",
];

function parseOrigin(value) {
    try {
        const url = new URL(value);
        if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
        )
            return null;
        return url.origin;
    } catch {
        return null;
    }
}

/** Exact operator-configured origins, never a wildcard for other storage tenants. */
export function getManagedStorageOrigins() {
    const configured = (process.env.NEXT_PUBLIC_STORAGE_ORIGINS || "")
        .split(",")
        .map((value) => parseOrigin(value.trim()))
        .filter(Boolean);
    return new Set([
        ...configured,
        ...(process.env.NODE_ENV === "production" ? [] : LOCAL_STORAGE_ORIGINS),
    ]);
}

export function isManagedStorageUrl(value) {
    try {
        const url = value instanceof URL ? value : new URL(value);
        return (
            !url.username &&
            !url.password &&
            getManagedStorageOrigins().has(url.origin)
        );
    } catch {
        return false;
    }
}

export function isLocalStorageUrl(value) {
    try {
        const url = value instanceof URL ? value : new URL(value);
        return (
            process.env.NODE_ENV !== "production" &&
            !url.username &&
            !url.password &&
            LOCAL_STORAGE_ORIGINS.includes(url.origin)
        );
    } catch {
        return false;
    }
}

/** Server-side container prefixes used when resolving a persisted owner identity. */
export function getStorageContainerPrefixes() {
    return (
        process.env.CORTEX_STORAGE_CONTAINER_PREFIXES || "cortexfiles,files"
    )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
}
