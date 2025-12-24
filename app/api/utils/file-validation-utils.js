import File from "../models/file";

/**
 * Filter out files that have an error state
 * @param {Array<string|Object>} fileIds - Array of file IDs or file objects
 * @returns {Promise<Array>} Array of valid file objects (without errors)
 */
export async function filterValidFiles(fileIds) {
    if (!fileIds || fileIds.length === 0) {
        return [];
    }

    const files = await Promise.all(
        fileIds.map(async (fileIdOrObject) => {
            const fileId =
                typeof fileIdOrObject === "string" ||
                fileIdOrObject instanceof String
                    ? fileIdOrObject
                    : fileIdOrObject._id || fileIdOrObject;
            const file = await File.findById(fileId);
            return file && !file.error ? file : null;
        }),
    );

    return files.filter((f) => f !== null);
}
