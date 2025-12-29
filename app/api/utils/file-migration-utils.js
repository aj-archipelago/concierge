import File from "../models/file.js";
import config from "../../../config";
import { validateAndRefreshFile } from "./file-refresh-utils";

/**
 * Generic file migration utility
 * Migrates files to a target contextId using validateAndRefreshFile
 * @param {Object} options - Migration options
 * @param {Function} options.getFiles - Function that returns array of File documents or file IDs
 * @param {string} options.targetContextId - Target context ID to migrate files to
 * @param {string} options.migrationName - Name for logging (e.g., "style guide", "workspace")
 * @returns {Promise<Object>} Migration result with migrated and errors counts
 */
export async function migrateFilesToContext({
    getFiles,
    targetContextId,
    migrationName = "file",
}) {
    try {
        const files = await getFiles();

        if (!files || files.length === 0) {
            return { migrated: 0, errors: 0 };
        }

        // If getFiles returns file IDs, fetch the File documents
        let fileDocuments = files;
        if (files.length > 0 && typeof files[0] === "string") {
            fileDocuments = await File.find({ _id: { $in: files } });
        } else if (files.length > 0 && files[0]._id && !files[0].hash) {
            // If files are populated but not File documents, extract file IDs
            const fileIds = files.map((f) => f.file || f._id).filter(Boolean);
            fileDocuments = await File.find({ _id: { $in: fileIds } });
        }

        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        let migrated = 0;
        let errors = 0;

        for (const file of fileDocuments) {
            if (!file) {
                continue;
            }

            try {
                // Use the same validation/refresh pattern
                // This will check if file exists in target context
                // and migrate it if it doesn't
                const result = await validateAndRefreshFile(
                    file,
                    targetContextId,
                    mediaHelperUrl,
                );

                if (result.status === "refreshed") {
                    migrated++;
                    console.log(
                        `Migrated ${migrationName} file ${file._id} to ${targetContextId}`,
                    );
                } else if (result.status === "error") {
                    errors++;
                    console.error(
                        `Failed to migrate ${migrationName} file ${file._id}`,
                    );
                }
                // If status is "exists", file already in correct context, skip
            } catch (error) {
                errors++;
                console.error(
                    `Error migrating ${migrationName} file ${file._id}:`,
                    error,
                );
            }
        }

        if (migrated > 0 || errors > 0) {
            console.log(
                `${migrationName} migration complete: ${migrated} migrated, ${errors} errors`,
            );
        }

        return { migrated, errors };
    } catch (error) {
        console.error(`Error during ${migrationName} file migration:`, error);
        throw error;
    }
}
