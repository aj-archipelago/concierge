import { useCallback, useEffect } from "react";
import { groupAndSortModels } from "../config/models.js";

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
        // If no images, return all models (no restrictions)
        if (!sortedImages || sortedImages.length === 0) {
            const allModels = Object.keys(settings.models || {});
            return groupAndSortModels(allModels, settings);
        }

        // Use the selectedImagesObjects array for model selection
        const imageCount = selectedImagesObjects.filter(
            (img) => img.type === "image",
        ).length;
        const hasInputImage = imageCount === 1;
        const hasTwoInputImages = imageCount === 2;
        const hasThreeInputImages = imageCount === 3;
        const hasManyInputImages = imageCount >= 4 && imageCount <= 14;

        const allModels = Object.keys(settings.models || {});
        const availableModels = allModels.filter((modelName) => {
            const modelSettings = settings.models[modelName];
            const modelType = modelSettings?.type || "image";

            // Apply input condition restrictions
            if (modelType === "image") {
                // Gemini 3 Pro supports 1-14 input images
                if (modelName === "gemini-3-pro-image-preview") {
                    return imageCount >= 0 && imageCount <= 14;
                }

                if (hasManyInputImages) {
                    // Only gemini-3-pro-image-preview supports 4+ images
                    return modelName === "gemini-3-pro-image-preview";
                } else if (hasThreeInputImages) {
                    // Models that support 3 input images
                    return [
                        "gemini-25-flash-image-preview",
                        "gemini-3-pro-image-preview",
                        "replicate-qwen-image-edit-plus",
                        "replicate-seedream-4",
                    ].includes(modelName);
                } else if (hasTwoInputImages) {
                    // Multi-image models for 2 input images
                    return [
                        "replicate-multi-image-kontext-max",
                        "gemini-25-flash-image-preview",
                        "gemini-3-pro-image-preview",
                        "replicate-qwen-image-edit-plus",
                        "replicate-seedream-4",
                    ].includes(modelName);
                } else if (hasInputImage) {
                    // Image editing models for 1 input image
                    return [
                        "replicate-flux-kontext-max",
                        "gemini-25-flash-image-preview",
                        "gemini-3-pro-image-preview",
                        "replicate-qwen-image-edit-plus",
                        "replicate-seedream-4",
                    ].includes(modelName);
                } else {
                    // Image generation models for text-only
                    return [
                        "replicate-flux-11-pro",
                        "gemini-25-flash-image-preview",
                        "gemini-3-pro-image-preview",
                        "replicate-qwen-image",
                        "replicate-seedream-4",
                    ].includes(modelName);
                }
            } else {
                // Video models - only available for 0 or 1 input images
                if (hasTwoInputImages || hasThreeInputImages) {
                    return false; // No video models support 2+ input images
                } else if (hasInputImage) {
                    // Only Veo 2.0, Veo 3.0+ and Seedance support input images
                    return [
                        "veo-2.0-generate",
                        "veo-3.0-generate",
                        "veo-3.1-generate",
                        "veo-3.1-fast-generate",
                        "replicate-seedance-1-pro",
                    ].includes(modelName);
                } else {
                    // All video models available for text-only
                    return true;
                }
            }
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
