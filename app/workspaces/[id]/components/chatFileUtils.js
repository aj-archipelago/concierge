/**
 * Utility functions for deleting files from chat messages
 */

/**
 * Delete a file from cloud storage using the CFH API
 * @param {string} hash - File hash to delete
 * @returns {Promise<void>} - Resolves even if deletion fails (errors are logged)
 */
export async function deleteFileFromCloud(hash) {
    if (!hash) return;

    try {
        const deleteUrl = new URL("/api/files/delete", window.location.origin);
        deleteUrl.searchParams.set("hash", hash);

        const response = await fetch(deleteUrl.toString(), {
            method: "DELETE",
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.warn(
                `Failed to delete file from cloud: ${response.statusText}. ${errorBody}`,
            );
        } else {
            console.log(`Successfully deleted file ${hash} from cloud storage`);
        }
    } catch (error) {
        console.error("Error deleting file from cloud storage:", error);
    }
}

/**
 * Check if a file URL exists by making a server-side request
 * This avoids CORS issues and doesn't rely on hash database
 * @param {string} url - File URL to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
export async function checkFileUrlExists(url) {
    if (!url) return false;

    try {
        const checkUrl = new URL(
            "/api/files/check-url",
            window.location.origin,
        );
        checkUrl.searchParams.set("url", url);

        const response = await fetch(checkUrl.toString(), {
            method: "GET",
        });

        if (!response.ok) {
            console.warn(`Failed to check file URL: ${response.statusText}`);
            return false;
        }

        const data = await response.json().catch(() => null);
        return data?.exists === true;
    } catch (error) {
        console.error("Error checking file URL:", error);
        return false;
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
    if (fileObj.hash) {
        await deleteFileFromCloud(fileObj.hash);
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

    // 1. Delete from cloud storage (in parallel)
    if (!skipCloudDelete) {
        await Promise.allSettled(
            files
                .filter((fileObj) => fileObj?.hash)
                .map((fileObj) => deleteFileFromCloud(fileObj.hash)),
        );
        results.cloudDeleted = files.filter((f) => f?.hash).length;
    }

    // 2. CFH automatically updates Redis on delete, so no manual collection update needed
    results.userFileCollectionRemoved = !skipUserFileCollection;

    // 3. Replace in chat messages with placeholders (single update for all files)
    if (chatId && messages && Array.isArray(messages) && updateChatHook) {
        try {
            // Create a Set of file identifiers for fast lookup
            const fileIdentifiers = new Set();
            files.forEach((fileObj) => {
                if (fileObj?.hash) fileIdentifiers.add(`hash:${fileObj.hash}`);
                if (fileObj?.url) fileIdentifiers.add(`url:${fileObj.url}`);
                if (fileObj?.gcs) fileIdentifiers.add(`gcs:${fileObj.gcs}`);
                if (fileObj?.image_url?.url)
                    fileIdentifiers.add(`image_url:${fileObj.image_url.url}`);
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
                            const matches =
                                (payloadObj.hash &&
                                    fileIdentifiers.has(
                                        `hash:${payloadObj.hash}`,
                                    )) ||
                                (payloadObj.url &&
                                    fileIdentifiers.has(
                                        `url:${payloadObj.url}`,
                                    )) ||
                                (payloadObj.gcs &&
                                    fileIdentifiers.has(
                                        `gcs:${payloadObj.gcs}`,
                                    )) ||
                                (payloadObj.image_url?.url &&
                                    fileIdentifiers.has(
                                        `image_url:${payloadObj.image_url.url}`,
                                    ));

                            if (matches) {
                                // Find matching fileObj for filename
                                const matchingFileObj = files.find(
                                    (fileObj) =>
                                        (fileObj.hash &&
                                            payloadObj.hash === fileObj.hash) ||
                                        (fileObj.url &&
                                            payloadObj.url === fileObj.url) ||
                                        (fileObj.gcs &&
                                            payloadObj.gcs === fileObj.gcs) ||
                                        (fileObj.image_url?.url &&
                                            payloadObj.image_url?.url ===
                                                fileObj.image_url.url),
                                );

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
                messages: updatedMessages,
            });

            results.chatUpdated = true;
            results.updatedMessages = updatedMessages;
        } catch (error) {
            console.error(
                "Failed to update chat with file placeholders:",
                error,
            );
        }
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
