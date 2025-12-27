import { QUERIES } from "@/src/graphql";

/**
 * Match a file from userFileCollection with a message file payload
 */
export function matchesFile(collectionFile, filePayloadObj) {
    if (!collectionFile || !filePayloadObj) return false;

    return (
        (collectionFile.url &&
            filePayloadObj.url &&
            collectionFile.url === filePayloadObj.url) ||
        (collectionFile.gcs &&
            filePayloadObj.gcs &&
            collectionFile.gcs === filePayloadObj.gcs) ||
        (collectionFile.hash &&
            filePayloadObj.hash &&
            collectionFile.hash === filePayloadObj.hash)
    );
}

/**
 * Read userFileCollection from Cortex
 */
export async function readUserFileCollection(
    apolloClient,
    contextId,
    contextKey,
) {
    if (!contextId) return [];

    try {
        const agentContext = [
            {
                contextId,
                contextKey: contextKey || null,
                default: true,
            },
        ];

        const result = await apolloClient.query({
            query: QUERIES.SYS_READ_FILE_COLLECTION,
            variables: { agentContext, useCache: false },
            fetchPolicy: "network-only",
        });

        const data = result.data?.sys_read_file_collection?.result;
        if (!data) return [];

        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read user file collection:", error);
        return [];
    }
}

/**
 * Update file metadata (displayFilename, tags, notes, mimeType, permanent, inCollection)
 */
export async function updateFileMetadata(
    apolloClient,
    contextId,
    contextKey,
    hash,
    metadata = {},
) {
    if (!contextId || !hash) {
        throw new Error("contextId and hash are required");
    }

    const agentContext = [
        {
            contextId,
            contextKey: contextKey || null,
            default: true,
        },
    ];

    return apolloClient.mutate({
        mutation: QUERIES.SYS_UPDATE_FILE_METADATA,
        variables: {
            agentContext,
            hash,
            displayFilename: metadata.displayFilename,
            tags: metadata.tags,
            notes: metadata.notes,
            mimeType: metadata.mimeType,
            permanent: metadata.permanent,
            inCollection: metadata.inCollection,
        },
    });
}

/**
 * Get file URL from a file object
 */
export function getFileUrl(file) {
    if (typeof file === "string") return file;
    return file.url || file.gcs || null;
}

/**
 * Get filename from a file object
 */
export function getFilename(file) {
    if (typeof file === "string") return file;
    return (
        file.displayFilename ||
        file.filename ||
        file.name ||
        file.path ||
        "Unnamed file"
    );
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename) {
    if (!filename || typeof filename !== "string") return "";

    const basename = filename.split("/").pop() || filename;
    const lastDotIndex = basename.lastIndexOf(".");

    if (lastDotIndex <= 0) return "";
    return basename.slice(lastDotIndex + 1).toLowerCase();
}
