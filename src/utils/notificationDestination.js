// Inbox destinations are navigation links, never executable URLs.
export function normalizeNotificationDestination(value) {
    if (value == null || value === "") return null;
    if (typeof value !== "string" || value.length > 2048) return null;
    const url = value.trim();
    if (
        !url ||
        url.includes("\\") ||
        [...url].some(
            (character) =>
                character.charCodeAt(0) <= 32 ||
                character.charCodeAt(0) === 127,
        )
    )
        return null;
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    try {
        const parsed = new URL(url);
        if (
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password
        )
            return null;
        return parsed.href;
    } catch {
        return null;
    }
}
