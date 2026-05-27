import { hashMediaFile } from "./mediaUtils";
import {
    buildMediaHelperFileParams,
    buildMediaHelperListParams,
    getStorageContextId,
} from "./storageTargets";

/**
 * Build folder-storage query/form params for file uploads.
 * @param {string|null} userId - The user's contextId (used as userId)
 * @param {string|null} chatId - The active chat ID (null for global scope)
 * @param {Object} options - Additional routing options
 * @param {string|null} options.workspaceId - Workspace ID for applet or workspace-artifact scope
 * @param {string|null} options.fileScope - File scope override (default: derived from chatId)
 * @returns {Object} Folder storage params
 */
export function buildFolderParams(
    userIdOrStorageTarget,
    chatId,
    { workspaceId, fileScope, storageTarget, contextId } = {},
) {
    const target =
        storageTarget ||
        (typeof userIdOrStorageTarget === "object" &&
        userIdOrStorageTarget !== null
            ? userIdOrStorageTarget
            : null);

    return buildMediaHelperFileParams({
        storageTarget: target,
        userId: target ? null : userIdOrStorageTarget,
        chatId,
        workspaceId,
        fileScope,
        contextId,
    });
}

/**
 * List all files in a user's folder storage tree.
 * Returns flat array of file objects with full blob paths.
 * @param {string} userId - The user's contextId (used as userId)
 * @param {Object} options - Options
 * @param {string} options.serverUrl - Server URL (default: "/media-helper")
 * @param {string} options.fileScope - Scope filter: 'all', 'global', 'chat', 'workspace' (default: 'all')
 * @param {string} options.chatId - Chat ID (required when fileScope='chat')
 * @returns {Promise<{folderPath: string, files: Array, count: number}>}
 */
export async function listUserFolder(userId, options = {}) {
    const {
        serverUrl = "/media-helper",
        storageTarget = null,
        fileScope = "all",
        chatId = null,
        workspaceId = null,
        appletId = null,
    } = options;
    const listParams = buildMediaHelperListParams({
        storageTarget,
        userContextId: userId,
        contextId: userId,
        fileScope,
        chatId,
        workspaceId,
        appletId,
    });

    const url = new URL(serverUrl, window.location.origin);
    url.searchParams.set("listFolder", "true");
    if (listParams.userId) {
        url.searchParams.set("userId", listParams.userId);
    }
    if (listParams.fileScope) {
        url.searchParams.set("fileScope", listParams.fileScope);
    }
    if (listParams.chatId) {
        url.searchParams.set("chatId", listParams.chatId);
    }
    if (listParams.workspaceId) {
        url.searchParams.set("workspaceId", listParams.workspaceId);
    }
    if (listParams.appletId) {
        url.searchParams.set("appletId", listParams.appletId);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Failed to list folder: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Check if a file exists by hash
 * @param {string} fileHash - The file hash
 * @param {Object} options - Options
 * @param {string} options.contextId - Optional contextId for file scoping
 * @param {string} options.userId - Optional userId for folder-based storage
 * @param {string} options.chatId - Optional chatId for chat-scoped storage
 * @param {string} options.fileScope - Optional file scope ('chat' or 'global')
 * @param {string} options.serverUrl - Server URL (default: "/media-helper")
 * @param {AbortSignal} options.signal - Optional abort signal
 * @returns {Promise<Object|null>} File data if exists, null otherwise
 */
export async function checkFileByHash(fileHash, options = {}) {
    const {
        storageTarget = null,
        serverUrl = "/media-helper",
        signal = null,
    } = options;
    const routingParams = buildMediaHelperFileParams({
        storageTarget,
        ...options,
    });

    try {
        const checkUrl = new URL(serverUrl, window.location.origin);
        checkUrl.searchParams.set("hash", fileHash);
        checkUrl.searchParams.set("checkHash", "true");
        for (const [key, value] of Object.entries(routingParams)) {
            checkUrl.searchParams.set(key, value);
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

export async function checkFileByBlobPath(blobPath, options = {}) {
    if (!blobPath) return null;

    const {
        storageTarget = null,
        serverUrl = "/media-helper",
        signal = null,
    } = options;
    const routingParams = buildMediaHelperFileParams({
        storageTarget,
        ...options,
    });

    try {
        const checkUrl = new URL(serverUrl, window.location.origin);
        checkUrl.searchParams.set("blobPath", blobPath);
        for (const [key, value] of Object.entries(routingParams)) {
            checkUrl.searchParams.set(key, value);
        }

        const checkResponse = await fetch(checkUrl.toString(), {
            signal,
        });

        if (checkResponse.ok) {
            const data = await checkResponse.json().catch(() => null);
            if (data && data.url) {
                return data;
            }
        }
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }
        if (error.response?.status !== 404) {
            console.error("Error checking file blob path:", error);
        }
    }

    return null;
}

/**
 * Upload a file to the media helper service
 * @param {File} file - The file to upload
 * @param {Object} options - Upload options
 * @param {string} options.userId - Optional userId for folder-based storage
 * @param {string} options.chatId - Optional chatId for chat-scoped storage
 * @param {string} options.workspaceId - Optional workspaceId for workspace-scoped storage
 * @param {string} options.fileScope - Optional file scope ('chat' or 'global')
 * @param {boolean} options.checkHash - Whether to check if file exists by hash first (default: true)
 * @param {Function} options.onProgress - Progress callback (percentage: number) => void
 * @param {AbortSignal} options.signal - Optional abort signal
 * @param {string} options.serverUrl - Server URL (default: "/media-helper")
 * @param {Function} options.getXHR - Optional callback to get the XHR object for custom handling
 * @returns {Promise<Object>} Upload result with url, hash, converted, displayFilename, etc.
 * @throws {Error} If upload fails
 */
export async function uploadFileToMediaHelper(file, options = {}) {
    const {
        storageTarget = null,
        checkHash = true,
        onProgress = null,
        signal = null,
        serverUrl = "/media-helper",
        getXHR = null,
        subPath = null,
    } = options;
    const routingParams = buildMediaHelperFileParams({
        storageTarget,
        ...options,
    });
    const targetContextId =
        storageTarget || routingParams.fileScope
            ? getStorageContextId({
                  storageTarget,
                  ...options,
              })
            : options.contextId;

    // Generate file hash
    const fileHash = await hashMediaFile(file);

    // Check if file already exists by hash
    if (checkHash) {
        const existingFile = await checkFileByHash(fileHash, {
            storageTarget,
            ...routingParams,
            serverUrl,
            signal,
        });
        if (existingFile) {
            return existingFile;
        }
    }

    // File doesn't exist or hash check disabled, proceed with upload
    // IMPORTANT: Append metadata fields BEFORE the file.
    // Busboy processes multipart parts in order, so fields must come first
    // to be available when the file event fires in the handler.
    const formData = new FormData();
    formData.append("hash", fileHash);
    if (targetContextId) {
        formData.append("contextId", targetContextId);
    }
    // Folder-based storage fields
    for (const [key, value] of Object.entries(routingParams)) {
        if (key === "contextId") continue;
        formData.append(key, value);
    }
    if (subPath) {
        formData.append("subPath", subPath);
    }
    // File stream must be last so busboy field events fire first
    formData.append("file", file, file.name);

    const uploadUrl = new URL(serverUrl, window.location.origin);
    uploadUrl.searchParams.set("hash", fileHash);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Expose XHR to caller if requested (for custom progress handling)
        if (getXHR) {
            getXHR(xhr);
        }

        // Handle abort signal
        let abortHandler;
        if (signal) {
            abortHandler = () => {
                xhr.abort();
                reject(new Error("Upload aborted"));
            };
            signal.addEventListener("abort", abortHandler);
        }

        // Monitor upload progress
        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    // Always pass percentage - it's the most common use case
                    // and works with React state setters
                    const percentage = Math.round(
                        (event.loaded / event.total) * 100,
                    );
                    onProgress(percentage);
                }
            };
        }

        const cleanup = () => {
            if (signal && abortHandler) {
                signal.removeEventListener("abort", abortHandler);
            }
        };

        // Handle upload response
        xhr.onload = () => {
            cleanup();
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
            cleanup();
            reject(new Error("File upload failed"));
        };

        // Handle abort
        xhr.onabort = () => {
            cleanup();
            reject(new Error("Upload aborted"));
        };

        // Start upload
        xhr.open("POST", uploadUrl.toString(), true);
        xhr.send(formData);
    });
}
