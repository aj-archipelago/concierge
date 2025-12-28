/**
 * Utility functions for downloading files, including bulk ZIP downloads
 */

/**
 * Get file URL from a file object
 * Supports multiple file formats: media items, user files, etc.
 */
export function getFileUrl(file) {
    if (typeof file === "string") return file;
    return file?.azureUrl || file?.url || file?.gcs || null;
}

/**
 * Get filename from a file object
 * Supports multiple file formats: media items, user files, etc.
 */
export function getFilename(file) {
    if (typeof file === "string") return file;
    return (
        file?.displayFilename ||
        file?.originalName ||
        file?.filename ||
        file?.name ||
        file?.path ||
        null
    );
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
        console.log("Creating ZIP with", files.length, "files");

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

        console.log("Requesting server-side ZIP creation...");

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

        console.log(
            "ZIP file received from server, initiating download...",
        );

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
            console.log("ZIP download initiated successfully");
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
            console.log("Falling back to individual downloads...");
            files.forEach((file) => {
                const url = getFileUrl(file);
                if (url) {
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "";
                    link.style.display = "none";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        }
        throw error;
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
            detailsKey: "Selected files are {{size}}MB, maximum allowed is {{maxSize}}MB",
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

