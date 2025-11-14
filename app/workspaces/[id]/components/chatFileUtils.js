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

        const response = await fetch(deleteUrl.toString(), { method: "DELETE" });

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
    const deletedFileInfo =
        filename || fileObj.originalFilename || fileObj.filename || "file";

    return JSON.stringify({
        type: "text",
        text: t("File deleted by user: {{filename}}", { filename: deletedFileInfo }),
        hideFromClient: true,
    });
}

