import File from "../models/file";
import { uploadBufferToMediaService, hashBuffer } from "./upload-utils";

/**
 * Check if a file exists in the file handler system by hash
 * @param {string} hash - File hash (must be truthy)
 * @param {string} contextId - Context ID for file scoping
 * @param {string} mediaHelperUrl - Media helper URL
 * @returns {Promise<Object|null>} File data if exists, null otherwise
 */
async function checkFileExists(hash, contextId, mediaHelperUrl) {
    // If hash is missing, file cannot exist (legacy files without hash need re-upload)
    if (!hash) {
        return null;
    }

    try {
        const checkUrl = new URL(mediaHelperUrl);
        checkUrl.searchParams.set("hash", hash);
        checkUrl.searchParams.set("checkHash", "true");
        if (contextId) {
            checkUrl.searchParams.set("contextId", contextId);
        }

        const checkResponse = await fetch(checkUrl.toString());
        if (checkResponse.ok) {
            const data = await checkResponse.json().catch(() => null);
            if (data && data.url) {
                return data;
            }
        }
    } catch (error) {
        console.error(`Error checking file hash ${hash}:`, error.message);
    }
    return null;
}

/**
 * Attempt to re-upload a file from its last known URL
 * Downloads the file, hashes it, and uploads it using uploadBufferToMediaService
 * @param {Object} file - File document
 * @param {string} contextId - Context ID for file scoping
 * @param {string} mediaHelperUrl - Media helper URL (unused, kept for API consistency)
 * @returns {Promise<Object|null>} Upload data if successful, null otherwise
 */
async function refreshFileFromUrl(file, contextId, mediaHelperUrl) {
    if (!file.url) {
        return null;
    }

    try {
        // Download the file from the URL
        const response = await fetch(file.url);
        if (!response.ok) {
            console.error(
                `Failed to download file ${file._id} from ${file.url}: ${response.statusText}`,
            );
            return null;
        }

        // Convert response to buffer
        const arrayBuffer = await response.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        // Hash the buffer and check if file already exists in workspace contextId
        const hash = await hashBuffer(fileBuffer);
        const existingFile = await checkFileExists(
            hash,
            contextId,
            mediaHelperUrl,
        );
        if (existingFile) {
            // Already exists in workspace contextId
            return existingFile;
        }

        // Upload to workspace contextId (uploadBufferToMediaService handles deduplication)
        const uploadResult = await uploadBufferToMediaService(
            fileBuffer,
            {
                filename: file.originalName || file.filename,
                mimeType: file.mimeType,
                size: fileBuffer.length,
                hash: hash,
            },
            true, // permanent = true for workspace files
            contextId,
        );

        if (uploadResult.error) {
            console.error(
                `Error uploading file ${file._id}:`,
                uploadResult.error,
            );
            return null;
        }

        return uploadResult.data;
    } catch (error) {
        console.error(`Error re-uploading file ${file._id}:`, error.message);
    }
    return null;
}

/**
 * Validate and refresh a single file
 * Handles legacy files that exist in generic FileStoreMap but not in workspace contextId
 * @param {Object} file - File document
 * @param {string} contextId - Context ID for file scoping
 * @param {string} mediaHelperUrl - Media helper URL
 * @returns {Promise<Object>} Result with fileId and status
 */
export async function validateAndRefreshFile(file, contextId, mediaHelperUrl) {
    // Check if file exists in workspace contextId with stored hash
    if (file.hash) {
        const existingFile = await checkFileExists(
            file.hash,
            contextId,
            mediaHelperUrl,
        );

        if (existingFile) {
            // File exists and is kosher, clear any error
            if (file.error) {
                await File.findByIdAndUpdate(file._id, {
                    $unset: { error: "" },
                });
            }
            return { fileId: file._id, status: "exists" };
        }
    }

    // File doesn't exist in workspace contextId (or has no hash)
    // Download from last known URL and re-upload to workspace contextId
    if (!file.url) {
        await File.findByIdAndUpdate(file._id, {
            error: "File has no URL and could not be validated",
        });
        return { fileId: file._id, status: "error" };
    }

    const uploadData = await refreshFileFromUrl(
        file,
        contextId,
        mediaHelperUrl,
    );

    if (uploadData) {
        // Update file with new URLs and hash
        await File.findByIdAndUpdate(file._id, {
            url: uploadData.url,
            gcsUrl: uploadData.gcs || file.gcsUrl,
            hash: uploadData.hash,
            $unset: { error: "" },
        });
        return { fileId: file._id, status: "refreshed" };
    }

    // Download failed, mark as error
    await File.findByIdAndUpdate(file._id, {
        error: "File not found and could not be re-uploaded",
    });
    return { fileId: file._id, status: "error" };
}
