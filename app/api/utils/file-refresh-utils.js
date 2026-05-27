import File from "../models/file";
import { resolveAndHealFile } from "./file-resolution-utils.js";

/**
 * Validate and refresh a single file
 * Handles legacy files that exist in generic FileStoreMap but not in workspace contextId
 * @param {Object} file - File document
 * @param {Object} storageTarget - Storage target for file scoping
 * @param {string} mediaHelperUrl - Media helper URL
 * @param {Object} options - Optional validation options
 * @param {Array} options.fallbackStorageTargets - Additional storage targets to try before failing
 * @returns {Promise<Object>} Result with fileId and status
 */
export async function validateAndRefreshFile(
    file,
    storageTarget,
    mediaHelperUrl,
    { fallbackStorageTargets = [] } = {},
) {
    void mediaHelperUrl;

    const result = await resolveAndHealFile(file, {
        storageTarget,
        fallbackStorageTargets,
        allowUrlRefresh: true,
        persistResolvedFile: async (updateFields) => {
            await File.findByIdAndUpdate(file._id, updateFields);
        },
    });

    if (result.status === "resolved") {
        return { fileId: file._id, status: "exists" };
    }

    if (result.status === "refreshed") {
        return { fileId: file._id, status: "refreshed" };
    }

    await File.findByIdAndUpdate(file._id, {
        error:
            file.url || file.hash || file.blobPath
                ? "File not found and could not be re-uploaded"
                : "File has no URL and could not be validated",
    });
    return { fileId: file._id, status: "error" };
}
