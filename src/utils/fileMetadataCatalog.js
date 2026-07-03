const ROOT_SEGMENT_RE =
    /(?:^|\/)(global|chats|media|articles|applets|automations|skills|profile)\//;

export function normalizeFileMetadataPath(value) {
    if (!value) return "";
    let path = String(value).split("?")[0].replace(/\\/g, "/");
    try {
        path = decodeURIComponent(path);
    } catch {
        // Keep raw path when decoding fails.
    }
    path = path.replace(/^\/+/, "").replace(/^workspace\/files\/?/, "");
    const rootMatch = path.match(ROOT_SEGMENT_RE);
    if (rootMatch?.index > 0) {
        path = path.slice(
            rootMatch.index + (rootMatch[0].startsWith("/") ? 1 : 0),
        );
    }
    return path.replace(/^\/+|\/+$/g, "");
}

export function titleFromFileMetadataPath(path) {
    const basename = normalizeFileMetadataPath(path).split("/").pop() || "";
    return basename
        .replace(/\.[^.]+$/, "")
        .replace(/^[a-f\d]{8,}_/i, "")
        .replace(/[-_]+/g, " ")
        .trim();
}

export function getFileMetadataKey(file) {
    return normalizeFileMetadataPath(
        file?.blobPath || file?.name || file?.path || file?.url,
    );
}

export function buildFolderTitleMap(chatTitleMap = {}, folderMetadata = {}) {
    const next = { ...(chatTitleMap || {}) };
    for (const [path, metadata] of Object.entries(folderMetadata || {})) {
        const segment = normalizeFileMetadataPath(path).split("/").pop();
        if (segment && metadata?.displayName) {
            next[segment] = metadata.displayName;
        }
    }
    return next;
}

export function applyFileMetadata(file, fileMetadata = {}) {
    if (!file || typeof file !== "object") return file;
    const metadata = fileMetadata[getFileMetadataKey(file)];
    if (!metadata) return file;
    return {
        ...file,
        ...metadata,
        _fileMetadata: metadata,
        _mediaItem: metadata._mediaItem || file._mediaItem,
        displayFilename:
            file.displayFilename ||
            metadata.displayFilename ||
            metadata.displayName,
        displayName: file.displayName || metadata.displayName,
    };
}

export function buildFileMetadataRequest({ folderPaths = [], files = [] }) {
    return {
        folderPaths: Array.from(
            new Set(folderPaths.map(normalizeFileMetadataPath).filter(Boolean)),
        ),
        blobPaths: Array.from(
            new Set(files.map(getFileMetadataKey).filter(Boolean)),
        ),
    };
}
