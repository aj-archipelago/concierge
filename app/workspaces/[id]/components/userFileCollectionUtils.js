import { QUERIES } from "@/src/graphql";

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
