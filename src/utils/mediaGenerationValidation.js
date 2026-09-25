export const REFERENCE_VIDEO_REQUIRED =
    "Attach a reference video to edit or extend it.";

export function requiresReferenceVideo(modelId, modelSettings = {}) {
    return (
        modelId === "replicate-seedance-2.5" &&
        ["edit", "extend"].includes(modelSettings.generationMode)
    );
}

export function assertMediaGenerationInputs(metadata = {}) {
    const settings = metadata.settings?.models?.[metadata.model] || {};
    if (!requiresReferenceVideo(metadata.model, settings)) return;
    const hasVideo = Object.entries(metadata).some(
        ([key, value]) =>
            /^inputVideoUrl(?:[2-9]|10)?$/.test(key) &&
            typeof value === "string" &&
            value.trim(),
    );
    if (!hasVideo) {
        const error = new Error(REFERENCE_VIDEO_REQUIRED);
        error.status = 400;
        error.code = "REFERENCE_VIDEO_REQUIRED";
        throw error;
    }
}
