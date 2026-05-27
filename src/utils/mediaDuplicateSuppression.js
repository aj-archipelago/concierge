import { getExpectedGeneratedMediaFilenameStem } from "./mediaGeneratedFilename.js";

export const PROCESSING_MEDIA_STATUSES = new Set([
    "pending",
    "processing",
    "queued",
]);
export const STORAGE_SYNC_MODEL = "storage-sync";

function safeDecodeUrlPathSegment(value) {
    if (!value || typeof value !== "string") return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function extractMediaBlobPathFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const isAzurite = hostname === "127.0.0.1" || hostname === "localhost";
        const isAzureBlobStorage =
            hostname.endsWith(".blob.core.windows.net") ||
            hostname.includes(".blob.core.");
        if (!isAzurite && !isAzureBlobStorage) return null;

        const segments = urlObj.pathname.split("/").filter(Boolean);
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(safeDecodeUrlPathSegment).join("/");
    } catch {
        return null;
    }
}

export function normalizeMediaPath(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
}

function getFilename(value) {
    const cleanValue = String(value || "")
        .split("?")[0]
        .split("#")[0];
    const filename = cleanValue.split("/").filter(Boolean).pop() || "";
    try {
        return decodeURIComponent(filename);
    } catch {
        return filename;
    }
}

function getStorageFilename(file) {
    return getFilename(
        file?.blobPath ||
            file?.name ||
            file?.filename ||
            file?.displayFilename ||
            file?.url,
    );
}

export function isProcessingMediaItem(item) {
    return PROCESSING_MEDIA_STATUSES.has(
        String(item?.status || "").toLowerCase(),
    );
}

export function isStorageSyncMediaItem(item) {
    return item?.model === STORAGE_SYNC_MODEL;
}

export function isProcessingGeneratedMediaItem(item) {
    return isProcessingMediaItem(item) && !isStorageSyncMediaItem(item);
}

function getStoragePath(item) {
    return normalizeMediaPath(
        item?.blobPath ||
            item?.name ||
            extractMediaBlobPathFromUrl(item?.azureUrl) ||
            extractMediaBlobPathFromUrl(item?.url),
    );
}

export function storageFileMatchesProcessingFolder(file, processingItem) {
    const processingFolder = normalizeMediaPath(processingItem?.outputFolder);
    if (!processingFolder) return true;

    const filePath = getStoragePath(file);
    if (!filePath) return false;

    return (
        filePath === processingFolder ||
        filePath.startsWith(`${processingFolder}/`) ||
        filePath.includes(`/${processingFolder}/`)
    );
}

export function storageFileMatchesExpectedGeneratedFilename(
    file,
    processingItem,
) {
    const expectedStem = getExpectedGeneratedMediaFilenameStem(processingItem);
    if (!expectedStem) return false;

    const filename = getStorageFilename(file).toLowerCase();
    if (!filename) return false;

    return filename === expectedStem || filename.startsWith(`${expectedStem}.`);
}

export function isLikelyStorageFileForProcessingMedia(
    file,
    processingItems = [],
) {
    return processingItems.some(
        (processingItem) =>
            isProcessingGeneratedMediaItem(processingItem) &&
            storageFileMatchesExpectedGeneratedFilename(file, processingItem) &&
            storageFileMatchesProcessingFolder(file, processingItem),
    );
}

export function isLikelyRawStorageFileForProcessingMedia(
    file,
    processingItems = [],
) {
    if (!file || file._mediaItem) return false;
    return isLikelyStorageFileForProcessingMedia(file, processingItems);
}
