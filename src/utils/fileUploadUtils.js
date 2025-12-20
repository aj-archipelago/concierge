import { hashMediaFile } from "./mediaUtils";

/**
 * Check if a file exists by hash
 * @param {string} fileHash - The file hash
 * @param {Object} options - Options
 * @param {string} options.contextId - Optional contextId for file scoping
 * @param {string} options.serverUrl - Server URL (default: "/media-helper")
 * @param {AbortSignal} options.signal - Optional abort signal
 * @returns {Promise<Object|null>} File data if exists, null otherwise
 */
export async function checkFileByHash(fileHash, options = {}) {
    const {
        contextId = null,
        serverUrl = "/media-helper",
        signal = null,
    } = options;

    try {
        const checkUrl = new URL(serverUrl, window.location.origin);
        checkUrl.searchParams.set("hash", fileHash);
        checkUrl.searchParams.set("checkHash", "true");
        if (contextId) {
            checkUrl.searchParams.set("contextId", contextId);
        }

        const checkResponse = await fetch(checkUrl.toString(), {
            signal,
        });

        if (checkResponse.ok) {
            const data = await checkResponse.json().catch(() => null);
            if (data && data.url) {
                return {
                    ...data,
                    hash: data.hash || fileHash,
                };
            }
        }
    } catch (error) {
        // If it's an abort, rethrow
        if (error.name === "AbortError") {
            throw error;
        }
        // Otherwise, return null (file doesn't exist or check failed)
        if (error.response?.status !== 404) {
            console.error("Error checking file hash:", error);
        }
    }

    return null;
}

/**
 * Upload a file to the media helper service
 * @param {File} file - The file to upload
 * @param {Object} options - Upload options
 * @param {string} options.contextId - Optional contextId for file scoping
 * @param {boolean} options.checkHash - Whether to check if file exists by hash first (default: true)
 * @param {Function} options.onProgress - Progress callback (event: ProgressEvent) => void, or (percentage: number) => void
 * @param {AbortSignal} options.signal - Optional abort signal
 * @param {string} options.serverUrl - Server URL (default: "/media-helper")
 * @param {Function} options.getXHR - Optional callback to get the XHR object for custom handling
 * @returns {Promise<Object>} Upload result with url, gcs, hash, converted, displayFilename, etc.
 * @throws {Error} If upload fails
 */
export async function uploadFileToMediaHelper(file, options = {}) {
    const {
        contextId = null,
        checkHash = true,
        onProgress = null,
        signal = null,
        serverUrl = "/media-helper",
        getXHR = null,
    } = options;

    // Generate file hash
    const fileHash = await hashMediaFile(file);

    // Check if file already exists by hash
    if (checkHash) {
        const existingFile = await checkFileByHash(fileHash, {
            contextId,
            serverUrl,
            signal,
        });
        if (existingFile) {
            return existingFile;
        }
    }

    // File doesn't exist or hash check disabled, proceed with upload
    const formData = new FormData();
    formData.append("hash", fileHash);
    formData.append("file", file, file.name);
    if (contextId) {
        formData.append("contextId", contextId);
    }

    const uploadUrl = new URL(serverUrl, window.location.origin);
    uploadUrl.searchParams.set("hash", fileHash);
    if (contextId) {
        uploadUrl.searchParams.set("contextId", contextId);
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Expose XHR to caller if requested (for custom progress handling)
        if (getXHR) {
            getXHR(xhr);
        }

        // Handle abort signal
        if (signal) {
            signal.addEventListener("abort", () => {
                xhr.abort();
                reject(new Error("Upload aborted"));
            });
        }

        // Monitor upload progress
        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    // Support both ProgressEvent and percentage callback
                    // Try calling with ProgressEvent first, fall back to percentage if it throws
                    try {
                        onProgress(event);
                        // If no exception, assume it handled the event successfully
                        return;
                    } catch (e) {
                        // If callback throws or doesn't accept event, try percentage
                        const percentage = Math.round(
                            (event.loaded / event.total) * 100,
                        );
                        onProgress(percentage);
                    }
                }
            };
        }

        // Handle upload response
        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    resolve({
                        ...data,
                        hash: data.hash || fileHash,
                    });
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to parse upload response: ${error.message}`,
                        ),
                    );
                }
            } else {
                reject(
                    new Error(
                        `Upload failed: ${xhr.statusText} (${xhr.status})`,
                    ),
                );
            }
        };

        // Handle upload errors
        xhr.onerror = () => {
            reject(new Error("File upload failed"));
        };

        // Handle abort
        xhr.onabort = () => {
            reject(new Error("Upload aborted"));
        };

        // Start upload
        xhr.open("POST", uploadUrl.toString(), true);
        xhr.send(formData);
    });
}
