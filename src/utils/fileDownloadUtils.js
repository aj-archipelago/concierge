/**
 * Utility functions for downloading files, including bulk ZIP downloads
 */

/** Characters that are invalid in filenames (cross-platform). */
// eslint-disable-next-line no-control-regex
export const INVALID_FILENAME_CHARS = /[<>:"|?*\x00-\x1f]/;

/**
 * Get file URL from a file object
 * Supports multiple file formats: media items, user files, etc.
 */
export function getFileUrl(file) {
    if (typeof file === "string") return file;
    return file?.azureUrl || file?.url || null;
}

/**
 * Strip blob hash prefix from a filename.
 * Blob names are stored as "{hexHash}_{filename}" where hash is a hex string (xxHash64).
 * Also extracts just the basename from any path.
 */
function stripBlobHash(filename) {
    if (!filename) return filename;
    // Extract just the filename from any path
    const basename = filename.split("/").pop();
    const idx = basename.indexOf("_");
    if (idx > 0) {
        const prefix = basename.substring(0, idx);
        // Only strip if the prefix looks like a hex hash
        if (/^[0-9a-f]+$/i.test(prefix)) {
            return basename.substring(idx + 1);
        }
    }
    return basename;
}

/**
 * Wrap a blob storage URL through the image proxy for downloads.
 * This ensures SAS token refresh on expiry and makes the URL same-origin
 * so the anchor download attribute works.
 */
/**
 * Check if a hostname belongs to a known blob storage domain.
 */
function isBlobStorageHost(hostname) {
    return (
        hostname.endsWith(".blob.core.windows.net") ||
        hostname === "storage.googleapis.com" ||
        hostname.endsWith(".storage.googleapis.com") ||
        hostname === "storage.cloud.google.com" ||
        hostname.endsWith(".storage.cloud.google.com") ||
        hostname === "127.0.0.1" ||
        hostname === "localhost"
    );
}

/**
 * Module-level cache: blob pathname → first proxy URL seen.
 * Ensures the same blob always maps to the same proxy URL so the browser
 * can cache the response long-term (proxy sets Cache-Control: immutable).
 * SAS tokens rotate on each listing, but we lock in the first one seen
 * per blob path so the browser URL stays stable across re-renders.
 */
const proxyUrlCache = new Map();

/**
 * Wrap a blob storage URL through the image proxy for downloads.
 * This ensures SAS token refresh on expiry and makes the URL same-origin
 * so the anchor download attribute works.
 *
 * Uses a per-pathname cache so that even when the SAS token changes between
 * file listings, the proxy URL stays stable and the browser can serve from
 * its HTTP cache (the proxy returns Cache-Control: immutable for 30 days).
 */
export function getDownloadUrl(url) {
    if (!url) return url;
    // Already proxied
    if (url.includes("/api/image-proxy")) return url;
    // Only proxy blob storage URLs
    try {
        const urlObj = new URL(url, window.location.origin);
        if (isBlobStorageHost(urlObj.hostname)) {
            // Use the pathname (without query params) as a stable cache key.
            // This means the same blob path always returns the same proxy URL,
            // even when the SAS token (query params) rotates between listings.
            const cacheKey = urlObj.origin + urlObj.pathname;
            const cached = proxyUrlCache.get(cacheKey);
            if (cached) return cached;

            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
            proxyUrlCache.set(cacheKey, proxyUrl);
            return proxyUrl;
        }
    } catch {
        // not a valid URL, return as-is
    }
    return url;
}

/**
 * Get filename from a file object
 * Supports multiple file formats: media items, user files, etc.
 * Returns the clean filename: URL-decoded and with blob hash prefix stripped.
 */
export function getFilename(file) {
    if (typeof file === "string") return file;
    const raw =
        file?.displayFilename ||
        file?.originalName ||
        file?.filename ||
        file?.name ||
        file?.path ||
        null;
    if (!raw) return null;
    try {
        return stripBlobHash(decodeURIComponent(raw));
    } catch {
        return stripBlobHash(raw);
    }
}

/**
 * Download multiple files as a ZIP archive
 * @param {Array} files - Array of file objects with url/azureUrl/gcs properties
 * @param {Object} options - Optional configuration
 * @param {Function} options.onError - Optional error callback
 * @param {Function} options.onProgress - Optional progress callback (receives boolean: true when starting, false when done)
 * @param {string} options.filenamePrefix - Optional prefix for the ZIP filename (default: "files_download")
 * @returns {Promise<void>}
 */
export async function downloadFilesAsZip(files, options = {}) {
    const { onError, onProgress, filenamePrefix = "files_download" } = options;

    try {
        // Extract URLs and filenames from files
        const fileData = files
            .map((file) => {
                const url = getFileUrl(file);
                const filename = getFilename(file);
                return url ? { url, filename: filename || null } : null;
            })
            .filter((data) => data !== null);

        if (fileData.length === 0) {
            throw new Error("No valid URLs found");
        }

        // Notify that download is starting
        if (onProgress) {
            onProgress(true);
        }

        try {
            // Use server-side proxy to create ZIP file
            const response = await fetch("/api/media-proxy", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ files: fileData }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `Server ZIP creation failed: ${response.status} - ${errorData.error || "Unknown error"}`,
                );
            }

            // Check if response is a ZIP file
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/zip")) {
                throw new Error("Server did not return a ZIP file");
            }

            // Create blob from response and trigger download
            const zipBlob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipBlob);

            // Use custom filename prefix with human-readable date/time
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");
            const day = String(now.getDate()).padStart(2, "0");
            const hours = String(now.getHours()).padStart(2, "0");
            const minutes = String(now.getMinutes()).padStart(2, "0");
            const seconds = String(now.getSeconds()).padStart(2, "0");
            const dateTime = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
            const filename = `${filenamePrefix}_${dateTime}.zip`;

            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the object URL
            URL.revokeObjectURL(link.href);
        } finally {
            // Notify that download is complete
            if (onProgress) {
                onProgress(false);
            }
        }
    } catch (error) {
        console.error("Error creating ZIP file:", error);
        // Notify that download is complete (even on error)
        if (onProgress) {
            onProgress(false);
        }
        if (onError) {
            onError(error);
        } else {
            // Fallback to individual downloads if ZIP fails
            files.forEach((file) => {
                const url = getFileUrl(file);
                if (url) {
                    const link = document.createElement("a");
                    link.href = getDownloadUrl(url);
                    link.download = getFilename(file) || "";
                    link.style.display = "none";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        }
    }
}

/**
 * Check if download is within limits
 * @param {Array} files - Array of file objects
 * @param {Object} options - Optional configuration
 * @param {number} options.maxFiles - Maximum number of files (default: 100)
 * @param {number} options.maxTotalSizeMB - Maximum total size in MB (default: 1000)
 * @returns {{allowed: boolean, error?: string, details?: string, errorKey?: string, detailsKey?: string, detailsParams?: Object}}
 */
export function checkDownloadLimits(files, options = {}) {
    const MAX_FILES = options.maxFiles || 100;
    const MAX_TOTAL_SIZE_MB = options.maxTotalSizeMB || 1000;

    if (files.length > MAX_FILES) {
        return {
            allowed: false,
            errorKey: "Too many files selected",
            detailsKey: "Maximum {{maxFiles}} files allowed for ZIP download",
            detailsParams: { maxFiles: MAX_FILES },
            // Legacy: keep English strings for backwards compatibility
            error: "Too many files selected",
            details: `Maximum ${MAX_FILES} files allowed for ZIP download`,
        };
    }

    // Estimate total size (rough calculation)
    // Assume 5MB average per file if size is not available
    const estimatedSizeMB = files.reduce((sum, file) => {
        const sizeBytes = file?.size || file?.bytes || 0;
        const sizeMB = sizeBytes / (1024 * 1024);
        return sum + (sizeMB || 5); // Default to 5MB if size unknown
    }, 0);

    if (estimatedSizeMB > MAX_TOTAL_SIZE_MB) {
        return {
            allowed: false,
            errorKey: "Total file size too large",
            detailsKey:
                "Selected files are {{size}}MB, maximum allowed is {{maxSize}}MB",
            detailsParams: {
                size: Math.round(estimatedSizeMB),
                maxSize: MAX_TOTAL_SIZE_MB,
            },
            // Legacy: keep English strings for backwards compatibility
            error: "Total file size too large",
            details: `Selected files are approximately ${Math.round(estimatedSizeMB)}MB, maximum allowed is ${MAX_TOTAL_SIZE_MB}MB.`,
        };
    }

    return { allowed: true };
}
