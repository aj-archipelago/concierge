import { useCallback, useEffect } from "react";
import {
    groupAndSortModels,
    DEFAULT_MODEL_SETTINGS,
} from "../config/models.js";

export const useModelSelection = ({
    selectedImagesObjects,
    sortedImages,
    settings,
    selectedModel,
    setSelectedModel,
    setOutputType,
    setQuality,
    getModelSettings,
}) => {
    // Get available models based on current input conditions
    const getAvailableModels = useCallback(() => {
        // If no images in gallery, return all models (no restrictions)
        if (!sortedImages || sortedImages.length === 0) {
            const allModels = Object.keys(settings.models || {});
            return groupAndSortModels(allModels, settings);
        }

        const imageCount = selectedImagesObjects.filter(
            (img) => img.type === "image",
        ).length;

        const allModels = Object.keys(settings.models || {});
        const availableModels = allModels.filter((modelName) => {
            const defaultSettings = DEFAULT_MODEL_SETTINGS[modelName];
            const range = defaultSettings?.inputImages;

            if (!range) return true; // Unknown models default to available
            return imageCount >= range[0] && imageCount <= range[1];
        });

        return groupAndSortModels(availableModels, settings);
    }, [selectedImagesObjects, sortedImages, settings]);

    // Apply intelligent model selection based on input conditions
    useEffect(() => {
        const availableModels = getAvailableModels();
        const allAvailableModels = [
            ...availableModels.image,
            ...availableModels.video,
        ];

        // Check if current model is still available for current input conditions
        const isCurrentModelAvailable =
            allAvailableModels.includes(selectedModel);

        if (!isCurrentModelAvailable) {
            // Current model is no longer available, switch to appropriate model
            const newModel = allAvailableModels[0];

            if (newModel) {
                setSelectedModel(newModel);
                // Update output type based on the new model
                const newModelSettings = getModelSettings(settings, newModel);
                if (newModelSettings.type === "image") {
                    setOutputType("image");
                    setQuality(newModelSettings.quality || "draft");
                } else {
                    setOutputType("video");
                }
            }
        }
    }, [
        selectedImagesObjects,
        sortedImages,
        settings,
        selectedModel,
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
