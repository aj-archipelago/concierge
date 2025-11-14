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
 * Check if a file URL exists by making a server-side request
 * This avoids CORS issues and doesn't rely on hash database
 * @param {string} url - File URL to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
export async function checkFileUrlExists(url) {
    if (!url) return false;

    try {
        const checkUrl = new URL("/api/files/check-url", window.location.origin);
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
        filename || fileObj.originalFilename || fileObj.filename || "file";

    return JSON.stringify({
        type: "text",
        text: t("File deleted by user: {{filename}}", { filename: deletedFileInfo }),
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

