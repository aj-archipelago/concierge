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
                const files = JSON.parse(
                    memoryData.data.sys_read_memory.result,
                );
                return Array.isArray(files) ? files : [];
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
 * Save memoryFiles to Cortex
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

    try {
        await apolloClient.mutate({
            mutation: QUERIES.SYS_SAVE_MEMORY,
            variables: {
                contextId,
                contextKey,
                section: "memoryFiles",
                aiMemory: JSON.stringify(files),
            },
        });
    } catch (error) {
        console.error("Failed to save memory files:", error);
        throw error;
    }
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
