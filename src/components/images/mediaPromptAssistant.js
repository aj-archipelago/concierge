export function getMediaPromptReferenceUrl(media) {
    return media?.azureUrl || media?.url || media?.gcsUrl || "";
}

function getMediaPromptReferenceRole(media) {
    return (
        media?.referenceRole ||
        media?.inputImageRole ||
        media?.inputVideoRole ||
        media?.role ||
        ""
    );
}

export function buildMediaPromptAssistantVariables({
    prompt = "",
    mediaType,
    model,
    references = [],
}) {
    const promptReferences = references
        .map((reference) => ({
            url: getMediaPromptReferenceUrl(reference),
            role: getMediaPromptReferenceRole(reference),
        }))
        .filter((reference) => reference.url);

    return {
        prompt: prompt.trim(),
        mediaType,
        model,
        references: promptReferences.map((reference) => reference.url),
        referenceRoles: promptReferences
            .map((reference) => reference.role)
            .filter(Boolean),
        hasInputImages: promptReferences.some((reference) =>
            /\.(avif|gif|heic|heif|jpe?g|png|webp)(?:[?#].*)?$/i.test(
                reference.url,
            ),
        ),
        referenceCount: promptReferences.length,
    };
}
