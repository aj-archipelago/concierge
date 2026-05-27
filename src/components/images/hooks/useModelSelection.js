import { useCallback, useEffect, useMemo } from "react";
import { useMediaModels } from "../../../../app/queries/modelMetadata";

export const useModelSelection = ({
    settings,
    selectedModel,
    setSelectedModel,
    setOutputType,
    setQuality,
    getModelSettings,
}) => {
    const { data: mediaModels } = useMediaModels();

    // Build a lookup map for O(1) model metadata access
    const modelMap = useMemo(() => {
        if (!mediaModels) return new Map();
        return new Map(mediaModels.map((m) => [m.modelId, m]));
    }, [mediaModels]);

    // Keep all configured models visible; reference compatibility is surfaced
    // by MediaPage warnings and enforced at request construction time.
    const getAvailableModels = useCallback(() => {
        const allModels = Object.keys(settings.models || {});

        // Group models into media categories by type
        const groupModels = (models) => {
            const image = [];
            const video = [];
            const audio = [];
            const tts = [];
            for (const id of models) {
                const type =
                    settings.models?.[id]?.type ||
                    modelMap.get(id)?.category ||
                    "image";
                if (type === "video") {
                    video.push(id);
                } else if (type === "tts") {
                    tts.push(id);
                } else if (type === "audio") {
                    audio.push(id);
                } else {
                    image.push(id);
                }
            }
            const sortByDisplayName = (a, b) =>
                (modelMap.get(a)?.displayName || a).localeCompare(
                    modelMap.get(b)?.displayName || b,
                );
            image.sort(sortByDisplayName);
            video.sort(sortByDisplayName);
            audio.sort(sortByDisplayName);
            tts.sort(sortByDisplayName);
            return { image, video, audio, tts };
        };

        return groupModels(allModels);
    }, [settings, modelMap]);

    // Keep selection valid if model configuration changes.
    useEffect(() => {
        // Don't pick anything until the API model list has loaded — without
        // it we can't honor `isDefault`, and `Object.keys(settings.models)`
        // sorted by raw modelId would (incorrectly) prefer whichever id is
        // alphabetically first. MediaPage's own default-setter handles the
        // initial selection once mediaModels is populated.
        if (!mediaModels?.length) return;

        const availableModels = getAvailableModels();
        const allAvailableModels = [
            ...availableModels.image,
            ...availableModels.video,
            ...availableModels.audio,
            ...availableModels.tts,
        ];

        // Check if current model still exists in the configured model list.
        const isCurrentModelAvailable =
            allAvailableModels.includes(selectedModel);

        if (!isCurrentModelAvailable) {
            // Prefer the API-flagged default before the alphabetical first.
            const newModel =
                mediaModels.find(
                    (m) =>
                        m.isDefault && allAvailableModels.includes(m.modelId),
                )?.modelId || allAvailableModels[0];

            if (newModel) {
                setSelectedModel(newModel);
                // Update output type based on the new model
                const newModelSettings = getModelSettings(settings, newModel);
                if (newModelSettings.type === "image") {
                    setQuality(newModelSettings.quality || "draft");
                }
                setOutputType(newModelSettings.type || "image");
            }
        }
    }, [
        settings,
        selectedModel,
        mediaModels,
        getAvailableModels,
        setSelectedModel,
        setOutputType,
        setQuality,
        getModelSettings,
    ]);

    return {
        getAvailableModels,
    };
};
