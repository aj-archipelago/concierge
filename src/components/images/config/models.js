// Model configuration and utilities
export const MODEL_DISPLAY_NAMES = {
    "replicate-flux-11-pro": "Flux Pro",
    "replicate-flux-2-pro": "Flux 2 Pro",
    "replicate-flux-kontext-max": "Flux Kontext Max",
    "replicate-multi-image-kontext-max": "Multi-Image Kontext Max",
    "gemini-25-flash-image-preview": "Gemini 2.5 Flash Image",
    "gemini-3-pro-image-preview": "Gemini 3 Pro Image",
    "replicate-qwen-image": "Qwen Image",
    "replicate-qwen-image-edit-plus": "Qwen Image Edit Plus",
    "replicate-qwen-image-edit-2511": "Qwen Image Edit 2511",
    "replicate-seedream-4": "Seedream 4.0",
    "veo-2.0-generate": "Veo 2.0",
    "veo-3.0-generate": "Veo 3.0",
    "replicate-seedance-1-pro": "Seedance 1.0",
};

export const SUPPORTED_MODELS = [
    "replicate-flux-11-pro",
    "replicate-flux-2-pro",
    "replicate-flux-kontext-max",
    "replicate-multi-image-kontext-max",
    "gemini-25-flash-image-preview",
    "gemini-3-pro-image-preview",
    "replicate-qwen-image",
    "replicate-qwen-image-edit-plus",
    "replicate-qwen-image-edit-2511",
    "replicate-seedream-4",
    "veo-2.0-generate",
    "veo-3.0-generate",
    "veo-3.1-generate",
    "veo-3.1-fast-generate",
    "replicate-seedance-1-pro",
];

export const DEFAULT_MODEL_SETTINGS = {
    // Image models
    "replicate-flux-11-pro": {
        type: "image",
        inputImages: [0, 0],
        quality: "high",
        aspectRatio: "1:1",
    },
    "replicate-flux-2-pro": {
        type: "image",
        inputImages: [0, 8],
        quality: "high",
        aspectRatio: "1:1",
        resolution: "1 MP",
        output_format: "webp",
        output_quality: 80,
        safety_tolerance: 2,
    },
    "replicate-flux-kontext-max": {
        type: "image",
        inputImages: [1, 1],
        quality: "high",
        aspectRatio: "match_input_image",
    },
    "replicate-multi-image-kontext-max": {
        type: "image",
        inputImages: [2, 2],
        quality: "high",
        aspectRatio: "1:1",
    },
    "gemini-25-flash-image-preview": {
        type: "image",
        inputImages: [0, 3],
        quality: "high",
        aspectRatio: "1:1",
        optimizePrompt: true,
    },
    "gemini-3-pro-image-preview": {
        type: "image",
        inputImages: [0, 14],
        quality: "high",
        aspectRatio: "1:1",
        image_size: "2K",
        optimizePrompt: true,
    },
    "replicate-qwen-image": {
        type: "image",
        inputImages: [0, 0],
        quality: "high",
        aspectRatio: "16:9",
        negativePrompt: "",
        width: 1024,
        height: 1024,
        numberResults: 1,
        output_format: "webp",
        output_quality: 80,
        go_fast: true,
        guidance: 4,
        strength: 0.9,
        image_size: "optimize_for_quality",
        lora_scale: 1,
        enhance_prompt: false,
        num_inference_steps: 50,
        disable_safety_checker: false,
    },
    "replicate-qwen-image-edit-plus": {
        type: "image",
        inputImages: [1, 3],
        quality: "high",
        aspectRatio: "match_input_image",
        negativePrompt: "",
        width: 1024,
        height: 1024,
        numberResults: 1,
        output_format: "webp",
        output_quality: 95,
        go_fast: true,
        disable_safety_checker: false,
    },
    "replicate-qwen-image-edit-2511": {
        type: "image",
        inputImages: [1, 3],
        quality: "high",
        aspectRatio: "match_input_image",
        output_format: "webp",
        output_quality: 95,
        go_fast: true,
        disable_safety_checker: false,
    },
    "replicate-seedream-4": {
        type: "image",
        inputImages: [0, 3],
        quality: "high",
        aspectRatio: "4:3",
        size: "2K",
        width: 2048,
        height: 2048,
        maxImages: 1,
        numberResults: 1,
        sequentialImageGeneration: "disabled",
        seed: 0,
    },
    // Video models
    "veo-2.0-generate": {
        type: "video",
        inputImages: [0, 1],
        aspectRatio: "16:9",
        duration: 5,
        generateAudio: false,
        resolution: "1080p",
        cameraFixed: false,
    },
    "veo-3.0-generate": {
        type: "video",
        inputImages: [0, 1],
        aspectRatio: "16:9",
        duration: 8,
        generateAudio: true,
        resolution: "1080p",
        cameraFixed: false,
    },
    "veo-3.1-generate": {
        type: "video",
        inputImages: [0, 1],
        aspectRatio: "16:9",
        duration: 8,
        generateAudio: true,
        resolution: "1080p",
        cameraFixed: false,
    },
    "veo-3.1-fast-generate": {
        type: "video",
        inputImages: [0, 1],
        aspectRatio: "16:9",
        duration: 8,
        generateAudio: true,
        resolution: "1080p",
        cameraFixed: false,
    },
    "replicate-seedance-1-pro": {
        type: "video",
        inputImages: [0, 1],
        aspectRatio: "16:9",
        duration: 5,
        generateAudio: false,
        resolution: "1080p",
        cameraFixed: false,
    },
};

// Utility functions
export const getModelSettings = (settings, modelName) => {
    return (
        settings.models?.[modelName] ||
        DEFAULT_MODEL_SETTINGS[modelName] ||
        DEFAULT_MODEL_SETTINGS["gemini-25-flash-image-preview"]
    );
};

export const getModelDisplayName = (modelName) => {
    return MODEL_DISPLAY_NAMES[modelName] || modelName;
};

export const getModelType = (modelName, settings = {}) => {
    return (
        settings.models?.[modelName]?.type ||
        DEFAULT_MODEL_SETTINGS[modelName]?.type ||
        "image"
    );
};

export const groupAndSortModels = (models, settings) => {
    const imageModels = [];
    const videoModels = [];

    models.forEach((modelName) => {
        const modelSettings =
            settings.models?.[modelName] || DEFAULT_MODEL_SETTINGS[modelName];
        const modelType = modelSettings?.type || "image";

        if (modelType === "image") {
            imageModels.push(modelName);
        } else {
            videoModels.push(modelName);
        }
    });

    // Sort each group alphabetically by display name
    const sortByDisplayName = (a, b) =>
        getModelDisplayName(a).localeCompare(getModelDisplayName(b));
    imageModels.sort(sortByDisplayName);
    videoModels.sort(sortByDisplayName);

    return {
        image: imageModels,
        video: videoModels,
    };
};

export const getAvailableAspectRatios = (modelName) => {
    const modelType = DEFAULT_MODEL_SETTINGS[modelName]?.type || "image";

    if (modelType === "video") {
        if (modelName.startsWith("veo")) {
            return [
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
            ];
        } else {
            return [
                { value: "16:9", label: "16:9" },
                { value: "4:3", label: "4:3" },
                { value: "9:16", label: "9:16" },
                { value: "1:1", label: "1:1" },
                { value: "3:4", label: "3:4" },
                { value: "21:9", label: "21:9" },
                { value: "9:21", label: "9:21" },
            ];
        }
    } else {
        // Gemini 25 doesn't support aspect ratio control
        if (modelName === "gemini-25-flash-image-preview") {
            return [];
        }

        // Gemini 3 Pro supports aspect ratio control
        if (modelName === "gemini-3-pro-image-preview") {
            return [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
            ];
        }

        // Qwen models have specific aspect ratio support
        if (modelName === "replicate-qwen-image") {
            return [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
            ];
        }

        if (modelName === "replicate-qwen-image-edit-plus") {
            return [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
                { value: "match_input_image", label: "Match Input Image" },
            ];
        }

        if (modelName === "replicate-qwen-image-edit-2511") {
            return [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
                { value: "match_input_image", label: "Match Input Image" },
            ];
        }

        // Base aspect ratios for all other image models
        const baseRatios = [
            { value: "1:1", label: "1:1" },
            { value: "16:9", label: "16:9" },
            { value: "21:9", label: "21:9" },
            { value: "3:2", label: "3:2" },
            { value: "2:3", label: "2:3" },
            { value: "4:5", label: "4:5" },
            { value: "5:4", label: "5:4" },
            { value: "3:4", label: "3:4" },
            { value: "4:3", label: "4:3" },
            { value: "9:16", label: "9:16" },
            { value: "9:21", label: "9:21" },
        ];

        // Only Kontext models support "match_input_image"
        if (modelName.includes("kontext")) {
            baseRatios.push({
                value: "match_input_image",
                label: "Match Input Image",
            });
        }

        return baseRatios;
    }
};

export const getAvailableDurations = (modelName) => {
    if (
        modelName === "veo-3.0-generate" ||
        modelName === "veo-3.1-generate" ||
        modelName === "veo-3.1-fast-generate"
    ) {
        return [{ value: 8, label: "8s" }];
    } else if (modelName === "veo-2.0-generate") {
        return [
            { value: 5, label: "5s" },
            { value: 6, label: "6s" },
            { value: 7, label: "7s" },
            { value: 8, label: "8s" },
        ];
    } else if (modelName === "replicate-seedance-1-pro") {
        return [
            { value: 5, label: "5s" },
            { value: 10, label: "10s" },
        ];
    }
    return [];
};

export const mergeNewModels = (existingSettings) => {
    // Filter out deprecated models and add any missing supported models
    const cleanedModels = {};
    if (existingSettings.models) {
        Object.keys(existingSettings.models).forEach((modelName) => {
            if (SUPPORTED_MODELS.includes(modelName)) {
                cleanedModels[modelName] = existingSettings.models[modelName];
            }
        });
    }

    // Add any missing models from defaults
    const mergedSettings = {
        ...existingSettings,
        models: {
            ...cleanedModels,
            ...Object.keys(DEFAULT_MODEL_SETTINGS).reduce((acc, modelName) => {
                if (!cleanedModels[modelName]) {
                    acc[modelName] = DEFAULT_MODEL_SETTINGS[modelName];
                }
                return acc;
            }, {}),
        },
    };

    return mergedSettings;
};

export const migrateSettings = (oldSettings) => {
    if (oldSettings.models) {
        return oldSettings; // Already migrated
    }

    const newSettings = {
        models: {
            // Image models
            "replicate-flux-11-pro": {
                type: "image",
                quality: "high",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
            },
            "replicate-flux-2-pro": {
                type: "image",
                quality: "high",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
                resolution: "1 MP",
                output_format: "webp",
                output_quality: 80,
                safety_tolerance: 2,
            },
            "replicate-flux-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
            },
            "replicate-multi-image-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            "gemini-25-flash-image-preview": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
                optimizePrompt: true,
            },
            "gemini-3-pro-image-preview": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
                image_size: "2K",
                optimizePrompt: true,
            },
            "replicate-qwen-image": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
                negativePrompt: "",
                width: 1024,
                height: 1024,
                numberResults: 1,
                output_format: "webp",
                output_quality: 80,
                go_fast: true,
                guidance: 4,
                strength: 0.9,
                image_size: "optimize_for_quality",
                lora_scale: 1,
                enhance_prompt: false,
                num_inference_steps: 50,
                disable_safety_checker: false,
            },
            "replicate-qwen-image-edit-plus": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
                negativePrompt: "",
                width: 1024,
                height: 1024,
                numberResults: 1,
                output_format: "webp",
                output_quality: 95,
                go_fast: true,
                disable_safety_checker: false,
            },
            "replicate-qwen-image-edit-2511": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
                output_format: "webp",
                output_quality: 95,
                go_fast: true,
                disable_safety_checker: false,
            },
            "replicate-seedream-4": {
                type: "image",
                quality: "high",
                aspectRatio: "4:3",
                size: "2K",
                width: 2048,
                height: 2048,
                maxImages: 1,
                numberResults: 1,
                sequentialImageGeneration: "disabled",
                seed: 0,
            },
            // Video models
            "veo-2.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "veo-3.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: 8,
                generateAudio:
                    oldSettings.video?.defaultGenerateAudio !== false, // Default to true for Veo 3.0
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "veo-3.1-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: 8,
                generateAudio:
                    oldSettings.video?.defaultGenerateAudio !== false, // Default to true for Veo 3.1
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "veo-3.1-fast-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: 8,
                generateAudio:
                    oldSettings.video?.defaultGenerateAudio !== false, // Default to true for Veo 3.1 Fast
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "replicate-seedance-1-pro": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
        },
        // Keep legacy settings for backward compatibility
        image: oldSettings.image || {
            defaultQuality: "high",
            defaultModel: "gemini-25-flash-image-preview",
            defaultAspectRatio: "1:1",
        },
        video: oldSettings.video || {
            defaultModel: "replicate-seedance-1-pro",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
    };

    return newSettings;
};
