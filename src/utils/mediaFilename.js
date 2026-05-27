/**
 * Build a human-readable download filename for a generated media item.
 * Derives the base from the prompt (sanitised, truncated) and the extension
 * from the URL when possible, falling back to a type-appropriate default.
 */
export function buildMediaFilename(image) {
    if (!image) return "";

    const url = image.azureUrl || image.url || "";
    let ext =
        image.type === "video" ? "mp4" : image.type === "audio" ? "wav" : "png";
    try {
        const path = new URL(url, "http://x").pathname;
        const match = path.match(/\.([a-z0-9]{1,5})$/i);
        if (match) ext = match[1].toLowerCase();
    } catch {
        // ignore — keep the default extension
    }

    const source = (image.prompt || image.type || "media").trim();
    const sanitised = source
        .replace(/\s+/g, "_")
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .replace(/_+/g, "_")
        .replace(/^[._-]+|[._-]+$/g, "")
        .slice(0, 80);
    const base = sanitised || image.type || "media";

    return `${base}.${ext}`;
}
