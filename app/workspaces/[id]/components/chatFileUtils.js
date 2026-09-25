/**
 * Utility functions for deleting files from chat messages
 */
import { getFileDeletionRouting } from "../../../../src/utils/storageTargets";

// Errors must reach callers so failed deletions stay visible and retryable.
export async function deleteFileFromCloud(hashOrOpts, contextIdArg = null) {
    const file =
        typeof hashOrOpts === "object" && hashOrOpts !== null
            ? hashOrOpts
            : { hash: hashOrOpts, contextId: contextIdArg };
    if (!file.hash && !file.blobPath) throw new Error("Missing file location");
    const url = new URL("/api/files/delete", window.location.origin);
    url.searchParams.set(
        file.blobPath ? "blobPath" : "hash",
        file.blobPath || file.hash,
    );
    for (const [key, value] of Object.entries(getFileDeletionRouting(file)))
        url.searchParams.set(key, value);
    const response = await fetch(url.toString(), { method: "DELETE" });
    if (!response.ok)
        throw new Error(`File deletion failed (${response.status})`);
    return true;
}

async function deleteFileBatch(files, defaults) {
    const response = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            files: files.map((file) => ({
                blobPath: file.blobPath,
                ...getFileDeletionRouting(file, defaults),
            })),
        }),
    });
    if (!response.ok)
        throw new Error(`File deletion failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== files.length) {
        throw new Error("Incomplete file deletion response");
    }
    return data.results;
}

/**
 * Check if a file URL exists by making a server-side request
 * This avoids CORS issues and doesn't rely on hash database
 * @param {string} url - File URL to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
export async function checkFileUrlExists(url) {
    const result = await resolveFileReference(url);
    return result.exists;
}

/**
 * Resolve a file reference through the server-side compat layer.
 * Prefers canonical CFH lookup when hash/blobPath/routing are available, and
 * falls back to a raw URL existence probe for legacy URLs.
 * @param {string|Object} input - URL string or options object
 * @returns {Promise<{exists: boolean, file: Object|null, source: string|null}>}
 */
export async function resolveFileReference(input) {
    const requestBody =
        typeof input === "string"
            ? { url: input }
            : input && typeof input === "object"
              ? input
              : null;

    if (
        !requestBody ||
        (!requestBody.url && !requestBody.hash && !requestBody.blobPath)
    ) {
        return {
            exists: false,
            file: null,
            source: null,
        };
    }

    try {
        // Use POST to avoid logging sensitive SAS URLs in server logs
        const response = await fetch("/api/files/check-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            console.warn(`Failed to check file URL: ${response.statusText}`);
            return {
                exists: false,
                file: null,
                source: null,
            };
        }

        const data = await response.json().catch(() => null);
        return {
            exists: data?.exists === true,
            file: data?.file || null,
            source: data?.source || null,
        };
    } catch (error) {
        console.error("Error checking file URL:", error);
        return {
            exists: false,
            file: null,
            source: null,
        };
    }
}

/**
 * Create a placeholder replacement for a deleted file
 * Includes metadata to show a visual indicator in the UI while still sending text to LLM
 * @param {Object} fileObj - The file object parsed from message payload
 * @param {Function} t - Translation function
 * @param {string} filename - Optional filename (if not provided, extracts from fileObj)
 * @returns {string} - Replacement payload item
 */
export function createFilePlaceholder(fileObj, t, filename = null) {
    const deletedFileInfo =
        filename ||
        fileObj.displayFilename ||
        fileObj.originalFilename ||
        fileObj.filename ||
        "file";

    return JSON.stringify({
        type: "text",
        text: t("File deleted by user: {{filename}}", {
            filename: deletedFileInfo,
        }),
        hideFromClient: true, // Hide text from UI, but send to LLM
        isDeletedFile: true, // Flag to show visual indicator in UI
        deletedFilename: deletedFileInfo, // Preserve filename for display
        originalFileType: fileObj.type, // Preserve original file type (image_url or file)
    });
}

/**
 * Delete a file from a chat message payload item
 * Deletes from cloud storage and returns the replacement payload item
 * @param {Object} fileObj - The file object parsed from message payload
 * @param {Function} t - Translation function
 * @param {string} filename - Optional filename (if not provided, extracts from fileObj)
 * @returns {Promise<string | null>} - Replacement payload item or null to remove
 */
export async function deleteFileFromChatPayload(fileObj, t, filename = null) {
    if (!fileObj || !["image_url", "file"].includes(fileObj.type)) {
        return null;
    }

    // Delete from cloud storage
    // Note: This function doesn't receive contextId, so it will use default user.contextId
    // For chat files, use purgeFiles instead which accepts contextId
    if (fileObj.hash || fileObj.blobPath) {
        await deleteFileFromCloud({
            ...fileObj,
        });
    }

    // Create replacement message
    return createFilePlaceholder(fileObj, t, filename);
}

/**
 * Unified function to purge files from all locations:
 * - Cloud storage (if hash exists)
 * - Memory files collection (if contextId/contextKey available)
 * - Chat messages (if chatId/messages/updateChatHook available)
 *
 * This ensures consistent deletion behavior across all scenarios.
 * Processes all files in a single chat update to avoid race conditions.
 *
 * @param {Object} options - Configuration object
 * @param {Array} options.fileObjs - Array of file objects to purge
 * @param {Object} options.apolloClient - Apollo client for memory files operations (optional)
 * @param {string} options.contextId - Context ID for memory files (optional)
 * @param {string} options.contextKey - Context key for memory files (optional)
 * @param {string} options.chatId - Chat ID for updating messages (optional)
 * @param {Array} options.messages - Current messages array (optional)
 * @param {Object} options.updateChatHook - Hook for updating chat (optional)
 * @param {Function} options.t - Translation function
 * @param {Function} options.getFilename - Optional function to get filename from file object (for bulk operations)
 * @param {boolean} options.skipCloudDelete - If true, skip cloud deletion (e.g., files already gone)
 * @param {boolean} options.skipUserFileCollection - If true, skip file collection update (CFH handles it automatically)
 * @returns {Promise<Object>} - Result object with success flags and updated messages (if applicable)
 */
export async function purgeFiles({
    fileObjs,
    apolloClient = null,
    contextId = null,
    contextKey = null,
    chatId = null,
    messages = null,
    updateChatHook = null,
    t,
    getFilename = null,
    skipCloudDelete = false,
    skipUserFileCollection = false,
}) {
    // Normalize to array
    const files = Array.isArray(fileObjs) ? fileObjs : [fileObjs];

    if (
        files.length === 0 ||
        !files.every((f) => f && ["image_url", "file"].includes(f?.type))
    ) {
        return { success: false, error: "Invalid file objects" };
    }

    const results = {
        cloudDeleted: 0,
        userFileCollectionRemoved: false,
        chatUpdated: false,
        updatedMessages: null,
    };

    const deletedFiles = [];
    const failedFiles = [];
    results.deletedFiles = deletedFiles;
    results.failedFiles = failedFiles;
    if (skipCloudDelete) {
        deletedFiles.push(...files);
    } else {
        // Each bounded request scans compatibility records once. Send batches
        // sequentially to avoid amplifying storage/Redis load for a large selection.
        const located = files.filter((file) => file.blobPath);
        for (let offset = 0; offset < located.length; offset += 500) {
            const batch = located.slice(offset, offset + 500);
            try {
                const outcomes = await deleteFileBatch(batch, {
                    contextId,
                    chatId,
                });
                batch.forEach((file, index) => {
                    (outcomes[index]?.deleted === true
                        ? deletedFiles
                        : failedFiles
                    ).push(file);
                });
            } catch {
                failedFiles.push(...batch);
            }
        }
        // Historical hash-only attachments are compatibility reads/mutations,
        // never a fallback after an exact path fails.
        for (const file of files.filter((file) => !file.blobPath)) {
            try {
                await deleteFileFromCloud({ contextId, chatId, ...file });
                deletedFiles.push(file);
            } catch {
                failedFiles.push(file);
            }
        }
        results.cloudDeleted = deletedFiles.length;
    }
    results.userFileCollectionRemoved =
        !skipUserFileCollection && !failedFiles.length;

    // 3. Replace in chat messages with placeholders (single update for all files)
    if (
        deletedFiles.length &&
        chatId &&
        messages &&
        Array.isArray(messages) &&
        updateChatHook
    ) {
        try {
            const identifiers = (file) => {
                // A known location takes precedence over deprecated hashes.
                const url = file.url || file.image_url?.url;
                if (url) {
                    try {
                        const parsed = new URL(url);
                        parsed.search = "";
                        parsed.hash = "";
                        return [`url:${parsed.toString()}`];
                    } catch {
                        /* legacy malformed URL */
                    }
                }
                if (file.blobPath) return [`path:${file.blobPath}`];
                return file.hash ? [`hash:${file.hash}`] : [];
            };
            const fileIdentifiers = new Map();
            deletedFiles.forEach((file) => {
                identifiers(file).forEach((key) =>
                    fileIdentifiers.set(key, file),
                );
                if (file.blobPath)
                    fileIdentifiers.set(`path:${file.blobPath}`, file);
            });

            const updatedMessages = messages.map((message) => {
                if (!Array.isArray(message.payload)) return message;

                const updatedPayload = message.payload.map((payloadItem) => {
                    try {
                        const payloadObj = JSON.parse(payloadItem);
                        if (
                            (payloadObj.type === "image_url" ||
                                payloadObj.type === "file") &&
                            !payloadObj.hideFromClient
                        ) {
                            const matchingFileObj =
                                identifiers(payloadObj)
                                    .map((key) => fileIdentifiers.get(key))
                                    .find(Boolean) ||
                                (!payloadObj.url &&
                                !payloadObj.image_url?.url &&
                                payloadObj.blobPath
                                    ? fileIdentifiers.get(
                                          `path:${payloadObj.blobPath}`,
                                      )
                                    : null);
                            if (matchingFileObj) {
                                const filename =
                                    matchingFileObj && getFilename
                                        ? getFilename(matchingFileObj)
                                        : payloadObj.displayFilename ||
                                          payloadObj.originalFilename ||
                                          payloadObj.filename ||
                                          "file";

                                return createFilePlaceholder(
                                    payloadObj,
                                    t,
                                    filename,
                                );
                            }
                        }
                    } catch (e) {
                        // Not a JSON object, keep as is
                    }
                    return payloadItem;
                });

                return { ...message, payload: updatedPayload };
            });

            await updateChatHook.mutateAsync({
                chatId: String(chatId),
                messageUpdates: updatedMessages.filter(
                    (message, index) => message !== messages[index],
                ),
            });

            results.chatUpdated = true;
            results.updatedMessages = updatedMessages;
        } catch (error) {
            results.chatUpdateFailed = true;
        }
    }

    results.success = !failedFiles.length && !results.chatUpdateFailed;
    if (!results.success) {
        const error = new Error(
            "Some files could not be deleted or their messages updated",
        );
        error.results = results;
        throw error;
    }
    return results;
}

/**
 * Convenience wrapper for purging a single file
 * @param {Object} options - Same as purgeFiles, but fileObj instead of fileObjs, and filename instead of getFilename
 */
export async function purgeFile({ fileObj, filename = null, ...rest }) {
    if (!fileObj || !["image_url", "file"].includes(fileObj?.type)) {
        return { success: false, error: "Invalid file object" };
    }

    const result = await purgeFiles({
        fileObjs: [fileObj],
        getFilename: filename ? () => filename : null,
        ...rest,
    });

    // Convert bulk result format to single-file format for backward compatibility
    return {
        cloudDeleted: result.cloudDeleted > 0,
        userFileCollectionRemoved: result.userFileCollectionRemoved,
        chatUpdated: result.chatUpdated,
        updatedMessages: result.updatedMessages,
    };
}
