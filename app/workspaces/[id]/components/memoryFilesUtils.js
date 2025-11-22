import { QUERIES } from "@/src/graphql";

/**
 * Helper function to match a memoryFile with a message file payload
 * Matches by url, gcs, or hash
 */
export function matchesFile(memoryFile, filePayloadObj) {
    if (!memoryFile || !filePayloadObj) return false;

    return (
        (memoryFile.url &&
            filePayloadObj.url &&
            memoryFile.url === filePayloadObj.url) ||
        (memoryFile.gcs &&
            filePayloadObj.gcs &&
            memoryFile.gcs === filePayloadObj.gcs) ||
        (memoryFile.hash &&
            filePayloadObj.hash &&
            memoryFile.hash === filePayloadObj.hash)
    );
}

/**
 * Read memoryFiles from Cortex
 */
export async function readMemoryFiles(apolloClient, contextId, contextKey) {
    if (!contextId) {
        return [];
    }

    try {
        const memoryData = await apolloClient.query({
            query: QUERIES.SYS_READ_MEMORY,
            variables: { contextId, contextKey, section: "memoryFiles" },
            fetchPolicy: "network-only",
        });

        if (memoryData.data?.sys_read_memory?.result) {
            try {
                const parsed = JSON.parse(
                    memoryData.data.sys_read_memory.result,
                );
                // Handle new format: { version, files }
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed) &&
                    parsed.files
                ) {
                    return Array.isArray(parsed.files) ? parsed.files : [];
                }
                // Handle old format: just an array (backward compatibility)
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                return [];
            } catch (e) {
                console.error("Error parsing memoryFiles:", e);
                return [];
            }
        }
        return [];
    } catch (error) {
        console.error("Failed to read memory files:", error);
        return [];
    }
}

/**
 * Generate a new version identifier
 * Uses timestamp + random component to ensure uniqueness even with clock skew
 * Format: timestamp-randomsuffix (e.g., "1734432000000-a1b2c3d4")
 */
function generateVersion() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
}

/**
 * Parse memory files data from JSON string or parsed object
 * Handles both new format ({ version, files }) and old format (array)
 * @param {any} parsed - Parsed JSON object or array
 * @returns {{ files: Array, version: string }} - Parsed files and version
 */
function parseMemoryFilesData(parsed) {
    let files = [];
    let version = generateVersion();

    // Handle new format: { version, files }
    if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.files
    ) {
        files = Array.isArray(parsed.files) ? parsed.files : [];
        version = parsed.version || generateVersion();
    }
    // Handle old format: just an array (backward compatibility)
    else if (Array.isArray(parsed)) {
        files = parsed;
        version = generateVersion(); // Assign new version for migration
    }
    // Invalid format
    else {
        files = [];
        version = generateVersion();
    }

    return { files, version };
}

/**
 * Load memoryFiles with version for optimistic locking
 * Returns both files and version
 */
export async function loadMemoryFilesWithVersion(
    apolloClient,
    contextId,
    contextKey,
) {
    if (!contextId) {
        return { files: [], version: generateVersion() };
    }

    try {
        const memoryData = await apolloClient.query({
            query: QUERIES.SYS_READ_MEMORY,
            variables: { contextId, contextKey, section: "memoryFiles" },
            fetchPolicy: "network-only",
        });

        let files = [];
        let version = generateVersion();

        if (memoryData.data?.sys_read_memory?.result) {
            try {
                const parsed = JSON.parse(
                    memoryData.data.sys_read_memory.result,
                );
                const parsedData = parseMemoryFilesData(parsed);
                files = parsedData.files;
                version = parsedData.version;
            } catch (e) {
                console.error("Error parsing memoryFiles:", e);
                files = [];
                version = generateVersion();
            }
        }
        return { files, version };
    } catch (error) {
        // Collection doesn't exist yet, start with empty array
        console.error("Failed to read memory files:", error);
        return { files: [], version: generateVersion() };
    }
}

/**
 * Save memoryFiles to Cortex with version check for optimistic locking
 * @param {Object} apolloClient - Apollo client instance
 * @param {string} contextId - Context ID
 * @param {string} contextKey - Context key
 * @param {Array} files - Array of files to save
 * @param {string|null} expectedVersion - Expected version to verify before saving (null to skip check)
 * @returns {boolean} - Returns true if save succeeded, false if version mismatch
 */
export async function saveMemoryFilesWithVersion(
    apolloClient,
    contextId,
    contextKey,
    files,
    expectedVersion = null,
) {
    if (!contextId) {
        return true;
    }

    try {
        // If expectedVersion is provided, verify it matches RIGHT before saving
        // This minimizes the race condition window
        if (expectedVersion !== null) {
            // Read directly from memory (bypass cache) to get the absolute latest version
            const memoryData = await apolloClient.query({
                query: QUERIES.SYS_READ_MEMORY,
                variables: { contextId, contextKey, section: "memoryFiles" },
                fetchPolicy: "network-only",
            });

            let currentVersion = null;
            let collectionExists = false;
            let isOldFormat = false;

            if (memoryData.data?.sys_read_memory?.result) {
                const memoryContent = memoryData.data.sys_read_memory.result;
                if (
                    memoryContent &&
                    memoryContent.trim() !== "" &&
                    memoryContent.trim() !== "[]"
                ) {
                    collectionExists = true;
                    try {
                        const parsed = JSON.parse(memoryContent);
                        // Handle new format: { version, files }
                        if (
                            parsed &&
                            typeof parsed === "object" &&
                            !Array.isArray(parsed) &&
                            parsed.version
                        ) {
                            currentVersion = parsed.version;
                        }
                        // Handle old format: just an array (no version yet)
                        else if (Array.isArray(parsed)) {
                            // Old format - we'll allow migration if the content matches
                            isOldFormat = true;
                            currentVersion = null;
                        }
                    } catch (e) {
                        // Invalid format - treat as version mismatch
                        currentVersion = null;
                    }
                }
            }

            // If collection doesn't exist yet (empty memoryContent or just "[]"), allow the save
            // since there's nothing to conflict with. The version check is only needed
            // when there's an existing collection that might have been modified.
            // Also allow save if we're migrating from old format (isOldFormat) - the migration
            // will happen on the next load, so we allow this save to proceed.
            if (
                collectionExists &&
                !isOldFormat &&
                currentVersion !== expectedVersion
            ) {
                // Version mismatch - return false to trigger retry
                return false;
            }
        }

        // Save in new format: { version, files }
        // Generate a new version identifier (timestamp + random to handle clock skew)
        const newVersion = generateVersion();
        const collectionData = {
            version: newVersion,
            files: Array.isArray(files) ? files : [],
        };

        await apolloClient.mutate({
            mutation: QUERIES.SYS_SAVE_MEMORY,
            variables: {
                contextId,
                contextKey,
                section: "memoryFiles",
                aiMemory: JSON.stringify(collectionData),
            },
        });

        return true;
    } catch (error) {
        console.error("Failed to save memory files:", error);
        throw error;
    }
}

/**
 * Save memoryFiles to Cortex (backward compatible wrapper)
 * Uses optimistic locking internally
 */
export async function saveMemoryFiles(
    apolloClient,
    contextId,
    contextKey,
    files,
) {
    if (!contextId) {
        return;
    }

    // Use the locking version with no version check (for backward compatibility)
    await saveMemoryFilesWithVersion(
        apolloClient,
        contextId,
        contextKey,
        files,
        null,
    );
}

/**
 * Modify memoryFiles collection with optimistic locking and retry
 * @param {Object} apolloClient - Apollo client instance
 * @param {string} contextId - Context ID
 * @param {string} contextKey - Context key
 * @param {Function} modifierCallback - Function that takes files array and returns modified array
 * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
 * @returns {Promise<Array>} - Returns the modified files array
 */
export async function modifyMemoryFilesWithLock(
    apolloClient,
    contextId,
    contextKey,
    modifierCallback,
    maxRetries = 5,
) {
    if (!contextId) {
        throw new Error("contextId is required");
    }

    if (typeof modifierCallback !== "function") {
        throw new Error("modifierCallback must be a function");
    }

    let versionMismatchCount = 0;
    let otherErrorCount = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Load collection with version (skip cache to get latest version)
            const { files, version } = await loadMemoryFilesWithVersion(
                apolloClient,
                contextId,
                contextKey,
            );

            // Create a copy to avoid mutating the original
            const collectionCopy = [...files];

            // Execute the modifier callback
            const modifiedCollection = await modifierCallback(collectionCopy);

            // Validate that callback returned an array
            if (!Array.isArray(modifiedCollection)) {
                throw new Error("modifierCallback must return an array");
            }

            // Try to save with version check
            const saved = await saveMemoryFilesWithVersion(
                apolloClient,
                contextId,
                contextKey,
                modifiedCollection,
                version,
            );

            if (saved) {
                // Success! Return the modified collection
                return modifiedCollection;
            }

            // Version mismatch - will retry on next iteration
            versionMismatchCount++;
            // Add a small delay to reduce contention (exponential backoff)
            if (attempt < maxRetries - 1) {
                const delay = Math.min(10 * Math.pow(2, attempt), 100); // Max 100ms
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        } catch (error) {
            // Track non-version-mismatch errors
            otherErrorCount++;
            // For non-version-mismatch errors, we might want to retry or fail immediately
            // For now, we'll retry a few times then throw
            if (attempt === maxRetries - 1) {
                // Build informative error message
                const errorParts = [];
                if (versionMismatchCount > 0) {
                    errorParts.push(
                        `${versionMismatchCount} version mismatch(es)`,
                    );
                }
                if (otherErrorCount > 0) {
                    errorParts.push(
                        `${otherErrorCount} other error(s) (${error.message || "unknown error"})`,
                    );
                }
                const errorDetails =
                    errorParts.length > 0 ? `: ${errorParts.join(", ")}` : "";
                throw new Error(
                    `Failed to modify memory files collection after ${maxRetries} attempts${errorDetails}`,
                );
            }
            // Small delay before retry
            const delay = Math.min(10 * Math.pow(2, attempt), 100);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    // If we get here, all retries failed due to version mismatches
    throw new Error(
        `Failed to modify memory files collection after ${maxRetries} attempts due to concurrent modifications (${versionMismatchCount} version mismatch(es))`,
    );
}

/**
 * Remove a file from memoryFiles by matching it with a file object
 * Returns the updated files array
 */
export async function removeFileFromMemory(
    apolloClient,
    contextId,
    contextKey,
    fileToRemove,
) {
    if (!contextId || !fileToRemove) {
        return [];
    }

    try {
        const currentFiles = await readMemoryFiles(
            apolloClient,
            contextId,
            contextKey,
        );

        const filteredFiles = currentFiles.filter((memFile) => {
            return !matchesFile(memFile, fileToRemove);
        });

        if (filteredFiles.length !== currentFiles.length) {
            await saveMemoryFiles(
                apolloClient,
                contextId,
                contextKey,
                filteredFiles,
            );
        }

        return filteredFiles;
    } catch (error) {
        console.error("Failed to remove file from memory files:", error);
        throw error;
    }
}

/**
 * Get file URL from a memoryFile object
 */
export function getFileUrl(file) {
    if (typeof file === "string") return file;
    return file.url || file.gcs || null;
}

/**
 * Get filename from a memoryFile object
 */
export function getFilename(file) {
    if (typeof file === "string") return file;
    return file.filename || file.name || file.path || "Unnamed file";
}

/**
 * Get file extension from a filename (handles edge cases like hidden files, multiple dots)
 * @param {string} filename - The filename to extract extension from
 * @returns {string} - The extension without the dot, or empty string if no extension
 */
export function getFileExtension(filename) {
    if (!filename || typeof filename !== "string") return "";

    // Handle paths by getting just the basename
    const basename = filename.split("/").pop() || filename;

    // Find the last dot
    const lastDotIndex = basename.lastIndexOf(".");

    // If no dot, or dot is at position 0 (hidden file like .gitignore), no extension
    if (lastDotIndex <= 0) return "";

    // Return extension without the dot
    return basename.slice(lastDotIndex + 1).toLowerCase();
}
