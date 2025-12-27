import { BaseTask } from "./base-task.mjs";
import {
    IMAGE_FLUX,
    IMAGE_GEMINI_25,
    IMAGE_GEMINI_3,
    IMAGE_QWEN,
    IMAGE_SEEDREAM4,
    VIDEO_VEO,
    VIDEO_SEEDANCE,
} from "../graphql.mjs";
import MediaItem from "../../app/api/models/media-item.mjs";

// User model for getting contextId
let User;
async function initializeUserModel() {
    if (!User) {
        const userModule = await import("../../app/api/models/user.mjs");
        User = userModule.default;
    }
    return User;
}

// Model configuration mapping
const MODEL_CONFIG = {
    // Image models
    "gemini-25-flash-image-preview": {
        query: IMAGE_GEMINI_25,
        resultKey: "image_gemini_25",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings =
                settings?.models?.["gemini-25-flash-image-preview"] || {};
            const variables = {
                text: prompt,
                async: true,
                optimizePrompt: modelSettings.optimizePrompt !== false, // Default to true if not specified
            };

            // Only add input_image parameters if they exist
            // Note: The UI should already be passing GCS URLs for Gemini models
            if (inputImages[0]) {
                variables.input_image = inputImages[0];
            }
            if (inputImages[1]) {
                variables.input_image_2 = inputImages[1];
            }
            // Gemini supports up to 3 input images, but we're not using the third one

            return variables;
        },
    },
    "gemini-3-pro-image-preview": {
        query: IMAGE_GEMINI_3,
        resultKey: "image_gemini_3",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings =
                settings?.models?.["gemini-3-pro-image-preview"] || {};
            const variables = {
                text: prompt,
                async: true,
                optimizePrompt: modelSettings.optimizePrompt !== false, // Default to true if not specified
            };

            // Add aspectRatio if specified
            if (modelSettings.aspectRatio) {
                variables.aspectRatio = modelSettings.aspectRatio;
            }

            // Add image_size if specified
            if (modelSettings.image_size) {
                variables.image_size = modelSettings.image_size;
            }

            // Add up to 14 input images
            // Note: The UI should already be passing GCS URLs for Gemini models
            if (inputImages[0]) {
                variables.input_image = inputImages[0];
            }
            if (inputImages[1]) {
                variables.input_image_2 = inputImages[1];
            }
            if (inputImages[2]) {
                variables.input_image_3 = inputImages[2];
            }
            if (inputImages[3]) {
                variables.input_image_4 = inputImages[3];
            }
            if (inputImages[4]) {
                variables.input_image_5 = inputImages[4];
            }
            if (inputImages[5]) {
                variables.input_image_6 = inputImages[5];
            }
            if (inputImages[6]) {
                variables.input_image_7 = inputImages[6];
            }
            if (inputImages[7]) {
                variables.input_image_8 = inputImages[7];
            }
            if (inputImages[8]) {
                variables.input_image_9 = inputImages[8];
            }
            if (inputImages[9]) {
                variables.input_image_10 = inputImages[9];
            }
            if (inputImages[10]) {
                variables.input_image_11 = inputImages[10];
            }
            if (inputImages[11]) {
                variables.input_image_12 = inputImages[11];
            }
            if (inputImages[12]) {
                variables.input_image_13 = inputImages[12];
            }
            if (inputImages[13]) {
                variables.input_image_14 = inputImages[13];
            }

            return variables;
        },
    },
    "replicate-qwen-image": {
        query: IMAGE_QWEN,
        resultKey: "image_qwen",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => ({
            text: prompt,
            model: "replicate-qwen-image",
            async: true,
        }),
    },
    "replicate-qwen-image-edit-plus": {
        query: IMAGE_QWEN,
        resultKey: "image_qwen",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => ({
            text: prompt,
            model: "replicate-qwen-image-edit-plus",
            async: true,
            input_image: inputImages[0] || "",
            input_image_2: inputImages[1] || "",
            input_image_3: inputImages[2] || "",
        }),
    },
    "replicate-qwen-image-edit-2511": {
        query: IMAGE_QWEN,
        resultKey: "image_qwen",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-qwen-image-edit-2511"
            ] || {
                aspectRatio: "match_input_image",
                output_format: "webp",
                output_quality: 95,
                go_fast: true,
                disable_safety_checker: false,
            };
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImages[0]) {
                aspectRatio = "1:1";
            }
            return {
                text: prompt,
                model: "replicate-qwen-image-edit-2511",
                async: true,
                input_image: inputImages[0] || "",
                input_image_2: inputImages[1] || "",
                input_image_3: inputImages[2] || "",
                aspectRatio: aspectRatio,
                output_format: modelSettings.output_format,
                output_quality: modelSettings.output_quality,
                go_fast: modelSettings.go_fast,
                disable_safety_checker: modelSettings.disable_safety_checker,
            };
        },
    },
    "replicate-seedream-4": {
        query: IMAGE_SEEDREAM4,
        resultKey: "image_seedream4",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings =
                settings?.models?.["replicate-seedream-4"] || {};
            return {
                text: prompt,
                model: "replicate-seedream-4",
                async: true,
                size: modelSettings.size || "2K",
                width: modelSettings.width || 2048,
                height: modelSettings.height || 2048,
                aspectRatio: modelSettings.aspectRatio || "4:3",
                maxImages:
                    modelSettings.maxImages || modelSettings.numberResults || 1,
                numberResults:
                    modelSettings.numberResults || modelSettings.maxImages || 1,
                input_image: inputImages[0] || "",
                input_image_1: inputImages[0] || "",
                input_image_2: inputImages[1] || "",
                input_image_3: inputImages[2] || "",
                sequentialImageGeneration:
                    modelSettings.sequentialImageGeneration || "disabled",
                seed: modelSettings.seed || 0,
            };
        },
    },
    "replicate-flux-kontext-max": {
        query: IMAGE_FLUX,
        resultKey: "image_flux",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-flux-kontext-max"
            ] || { aspectRatio: "match_input_image" };
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImages[0]) {
                aspectRatio = "1:1";
            }
            return {
                text: prompt,
                async: true,
                model: "replicate-flux-kontext-max",
                input_image: inputImages[0] || "",
                input_image_2: inputImages[1] || "",
                input_image_3: inputImages[2] || "",
                aspectRatio: aspectRatio,
            };
        },
    },
    "replicate-multi-image-kontext-max": {
        query: IMAGE_FLUX,
        resultKey: "image_flux",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-multi-image-kontext-max"
            ] || { aspectRatio: "1:1" };
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImages[0]) {
                aspectRatio = "1:1";
            }
            return {
                text: prompt,
                async: true,
                model: "replicate-multi-image-kontext-max",
                input_image: inputImages[0] || "",
                input_image_2: inputImages[1] || "",
                input_image_3: inputImages[2] || "",
                aspectRatio: aspectRatio,
            };
        },
    },
    "replicate-flux-11-pro": {
        query: IMAGE_FLUX,
        resultKey: "image_flux",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-flux-11-pro"
            ] || { aspectRatio: "1:1" };
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImages[0]) {
                aspectRatio = "1:1";
            }
            return {
                text: prompt,
                async: true,
                model: "replicate-flux-11-pro",
                input_image: inputImages[0] || "",
                input_image_2: inputImages[1] || "",
                input_image_3: inputImages[2] || "",
                aspectRatio: aspectRatio,
            };
        },
    },
    "replicate-flux-2-pro": {
        query: IMAGE_FLUX,
        resultKey: "image_flux",
        type: "image",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-flux-2-pro"
            ] || {
                aspectRatio: "1:1",
                resolution: "1 MP",
                output_format: "webp",
                output_quality: 80,
                safety_tolerance: 2,
            };
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImages[0]) {
                aspectRatio = "1:1";
            }
            const variables = {
                text: prompt,
                async: true,
                model: "replicate-flux-2-pro",
                aspectRatio: aspectRatio,
                resolution: modelSettings.resolution || "1 MP",
                output_format: modelSettings.output_format || "webp",
                output_quality: modelSettings.output_quality || 80,
                safety_tolerance: modelSettings.safety_tolerance || 2,
            };
            // Add input images if provided (flux-2-pro supports up to 8 via input_images array)
            if (inputImages.length > 0) {
                variables.input_images = inputImages.slice(0, 8);
            }
            return variables;
        },
    },
    // Video models
    "replicate-seedance-1-pro": {
        query: VIDEO_SEEDANCE,
        resultKey: "video_seedance",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-seedance-1-pro"
            ] || {
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                model: "replicate-seedance-1-pro",
                resolution: modelSettings.resolution,
                aspectRatio: modelSettings.aspectRatio,
                duration: modelSettings.duration,
                camera_fixed: modelSettings.cameraFixed,
                image: inputImages[0] || "",
                seed: -1,
            };
        },
    },
    "replicate-seedance-1.5-pro": {
        query: VIDEO_SEEDANCE,
        resultKey: "video_seedance",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "replicate-seedance-1.5-pro"
            ] || {
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                model: "replicate-seedance-1.5-pro",
                aspectRatio: modelSettings.aspectRatio,
                duration: modelSettings.duration,
                camera_fixed: modelSettings.cameraFixed,
                generate_audio: modelSettings.generateAudio,
                image: inputImages[0] || "",
                seed: -1,
            };
        },
    },
    // Veo models (default for video)
    "veo-2.0-generate": {
        query: VIDEO_VEO,
        resultKey: "video_veo",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.["veo-2.0-generate"] || {
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                image: formatImageForVeo(inputImages[0]),
                video: "",
                lastFrame: "",
                model: "veo-2.0-generate",
                aspectRatio: modelSettings.aspectRatio,
                durationSeconds: modelSettings.duration,
                enhancePrompt: true,
                generateAudio: modelSettings.generateAudio,
                negativePrompt: "",
                personGeneration: "allow_all",
                sampleCount: 1,
                storageUri: "",
                location: "us-central1",
                seed: -1,
            };
        },
    },
    "veo-3.0-generate": {
        query: VIDEO_VEO,
        resultKey: "video_veo",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.["veo-3.0-generate"] || {
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                image: formatImageForVeo(inputImages[0]),
                video: "",
                lastFrame: "",
                model: "veo-3.0-generate",
                aspectRatio: modelSettings.aspectRatio,
                durationSeconds: modelSettings.duration,
                enhancePrompt: true,
                generateAudio: modelSettings.generateAudio,
                negativePrompt: "",
                personGeneration: "allow_all",
                sampleCount: 1,
                storageUri: "",
                location: "us-central1",
                seed: -1,
            };
        },
    },
    "veo-3.1-generate": {
        query: VIDEO_VEO,
        resultKey: "video_veo",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.["veo-3.1-generate"] || {
                aspectRatio: "16:9",
                duration: 8,
                generateAudio: true,
                resolution: "1080p",
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                image: formatImageForVeo(inputImages[0]),
                video: "",
                lastFrame: "",
                model: "veo-3.1-generate",
                aspectRatio: modelSettings.aspectRatio,
                durationSeconds: modelSettings.duration,
                enhancePrompt: true,
                generateAudio: modelSettings.generateAudio,
                negativePrompt: "",
                personGeneration: "allow_all",
                sampleCount: 1,
                storageUri: "",
                location: "us-central1",
                seed: -1,
            };
        },
    },
    "veo-3.1-fast-generate": {
        query: VIDEO_VEO,
        resultKey: "video_veo",
        type: "video",
        buildVariables: (prompt, settings, inputImages) => {
            const modelSettings = settings?.models?.[
                "veo-3.1-fast-generate"
            ] || {
                aspectRatio: "16:9",
                duration: 8,
                generateAudio: true,
                resolution: "1080p",
                cameraFixed: false,
            };
            return {
                text: prompt,
                async: true,
                image: formatImageForVeo(inputImages[0]),
                video: "",
                lastFrame: "",
                model: "veo-3.1-fast-generate",
                aspectRatio: modelSettings.aspectRatio,
                durationSeconds: modelSettings.duration,
                enhancePrompt: true,
                generateAudio: modelSettings.generateAudio,
                negativePrompt: "",
                personGeneration: "allow_all",
                sampleCount: 1,
                storageUri: "",
                location: "us-central1",
                seed: -1,
            };
        },
    },
};

// Utility functions
const formatImageForVeo = (imageUrl) => {
    if (!imageUrl) return "";

    // Check if it's already in gs:// format
    if (imageUrl.startsWith("gs://")) {
        const extension = imageUrl.split(".").pop().toLowerCase();
        const mimeType =
            {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
            }[extension] || "image/jpeg";

        return JSON.stringify({ gcsUri: imageUrl, mimeType });
    }

    try {
        const url = new URL(imageUrl);
        if (url.hostname === "storage.googleapis.com") {
            const gcsUri = `gs://${url.pathname.substring(1)}`;
            const extension = url.pathname.split(".").pop().toLowerCase();
            const mimeType =
                {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    webp: "image/webp",
                    gif: "image/gif",
                }[extension] || "image/jpeg";

            return JSON.stringify({ gcsUri, mimeType });
        }
    } catch (error) {
        console.warn("Error parsing image URL for Veo format:", error);
    }

    return imageUrl;
};

const convertGcsToHttp = (gcsUri) => {
    return gcsUri.replace("gs://", "https://storage.googleapis.com/");
};

const extractVideoUrl = (video) => {
    if (video.bytesBase64Encoded) {
        return `data:video/mp4;base64,${video.bytesBase64Encoded}`;
    } else if (video.gcsUri) {
        return convertGcsToHttp(video.gcsUri);
    }
    return null;
};

class MediaGenerationHandler extends BaseTask {
    get displayName() {
        return "Media generation";
    }

    get isRetryable() {
        return true;
    }

    getModelConfig(model, outputType) {
        // Return specific model config or default based on output type
        if (MODEL_CONFIG[model]) {
            return MODEL_CONFIG[model];
        }

        // Default fallbacks
        if (outputType === "image") {
            return MODEL_CONFIG["replicate-flux-11-pro"];
        } else {
            return MODEL_CONFIG["veo-3.0-generate"];
        }
    }

    getResultKey(outputType, model) {
        const config = this.getModelConfig(model, outputType);
        return config.resultKey;
    }

    async startRequest(job) {
        const { taskId, metadata, userId } = job.data;
        const {
            prompt,
            outputType,
            model,
            inputImageUrl,
            inputImageUrl2,
            inputImageUrl3,
            inputImageUrl4,
            inputImageUrl5,
            inputImageUrl6,
            inputImageUrl7,
            inputImageUrl8,
            inputImageUrl9,
            inputImageUrl10,
            inputImageUrl11,
            inputImageUrl12,
            inputImageUrl13,
            inputImageUrl14,
            settings,
        } = metadata;

        metadata.taskId = taskId;
        metadata.userId = userId;

        if (!prompt) {
            const error = new Error("Prompt is required for media generation");
            await this.updateMediaItemOnError(
                metadata,
                error,
                "VALIDATION_ERROR",
            );
            throw error;
        }

        const modelName =
            model ||
            (outputType === "image"
                ? "replicate-flux-11-pro"
                : "replicate-seedance-1-pro");
        const config = this.getModelConfig(modelName, outputType);

        const inputImages = [
            inputImageUrl,
            inputImageUrl2,
            inputImageUrl3,
            inputImageUrl4,
            inputImageUrl5,
            inputImageUrl6,
            inputImageUrl7,
            inputImageUrl8,
            inputImageUrl9,
            inputImageUrl10,
            inputImageUrl11,
            inputImageUrl12,
            inputImageUrl13,
            inputImageUrl14,
        ].filter(Boolean);

        const variables = config.buildVariables(prompt, settings, inputImages);

        let data;
        try {
            const result = await job.client.query({
                query: config.query,
                variables,
                fetchPolicy: "no-cache",
            });
            data = result.data;

            if (result.errors) {
                console.debug(
                    `[MediaGenerationHandler] GraphQL errors encountered`,
                    result.errors,
                );
                const error = new Error(
                    `GraphQL errors: ${JSON.stringify(result.errors)}`,
                );
                await this.updateMediaItemOnError(
                    metadata,
                    error,
                    "GRAPHQL_ERROR",
                );
                throw error;
            }
        } catch (error) {
            console.error(
                `[MediaGenerationHandler] GraphQL error:`,
                error.message,
                metadata,
            );
            // Update MediaItem if not already updated
            await this.updateMediaItemOnError(
                metadata,
                error,
                "REQUEST_FAILED",
            );
            throw error;
        }

        const resultKey = this.getResultKey(outputType, modelName);
        const result = data?.[resultKey]?.result;

        if (!result) {
            console.debug(
                `[MediaGenerationHandler] No result returned from service`,
            );
            const error = new Error(
                "No result returned from media generation service",
            );
            await this.updateMediaItemOnError(metadata, error, "NO_RESULT");
            throw error;
        }

        return result;
    }

    async updateOrCreateMediaItemWithError(
        userId,
        metadata,
        errorCode,
        errorMessage,
    ) {
        if (!userId || !metadata?.taskId) {
            return;
        }

        try {
            const error = {
                code: errorCode,
                message: errorMessage || "Media generation failed",
            };

            const mediaItem = await MediaItem.findOneAndUpdate(
                { user: userId, taskId: metadata.taskId },
                {
                    status: "failed",
                    error,
                },
                { new: true, runValidators: true },
            );

            // Create media item if it doesn't exist yet
            if (!mediaItem) {
                const newMediaItem = new MediaItem({
                    user: userId,
                    taskId: metadata.taskId,
                    cortexRequestId: metadata.taskId,
                    prompt: metadata.prompt || "",
                    type: metadata.outputType || "image",
                    model: metadata.model || "",
                    status: "failed",
                    error,
                    settings: metadata.settings,
                    // Only include encrypted inputImageUrl fields if they have values (CSFLE can't encrypt null)
                    ...(metadata.inputImageUrl && {
                        inputImageUrl: metadata.inputImageUrl,
                    }),
                    ...(metadata.inputImageUrl2 && {
                        inputImageUrl2: metadata.inputImageUrl2,
                    }),
                    ...(metadata.inputImageUrl3 && {
                        inputImageUrl3: metadata.inputImageUrl3,
                    }),
                });
                await newMediaItem.save();
            }
        } catch (updateError) {
            console.error(
                "Error updating/creating media item with error status:",
                updateError,
            );
        }
    }

    async updateMediaItemOnError(metadata, error, errorCode) {
        console.log("Updating media item with error status:", metadata);
        const userId = metadata.userId;
        if (!userId) {
            return;
        }

        const errorMessage =
            error?.message || error?.toString() || "Media generation failed";
        console.log(
            "Updating media item with error status:",
            errorCode,
            errorMessage,
        );
        await this.updateOrCreateMediaItemWithError(
            userId,
            metadata,
            errorCode,
            errorMessage,
        );
    }

    async retryGeminiRequest(job, retryCount = 0) {
        const { metadata } = job.data;
        const {
            prompt,
            outputType,
            model,
            inputImageUrl,
            inputImageUrl2,
            inputImageUrl3,
            inputImageUrl4,
            inputImageUrl5,
            inputImageUrl6,
            inputImageUrl7,
            inputImageUrl8,
            inputImageUrl9,
            inputImageUrl10,
            inputImageUrl11,
            inputImageUrl12,
            inputImageUrl13,
            inputImageUrl14,
            settings,
        } = metadata;

        const modelName =
            model ||
            (outputType === "image"
                ? "replicate-flux-11-pro"
                : "replicate-seedance-1-pro");
        const config = this.getModelConfig(modelName, outputType);

        const inputImages = [
            inputImageUrl,
            inputImageUrl2,
            inputImageUrl3,
            inputImageUrl4,
            inputImageUrl5,
            inputImageUrl6,
            inputImageUrl7,
            inputImageUrl8,
            inputImageUrl9,
            inputImageUrl10,
            inputImageUrl11,
            inputImageUrl12,
            inputImageUrl13,
            inputImageUrl14,
        ].filter(Boolean);
        const variables = config.buildVariables(prompt, settings, inputImages);

        try {
            const result = await job.client.query({
                query: config.query,
                variables,
                fetchPolicy: "no-cache",
            });

            if (result.errors) {
                console.debug(
                    `[MediaGenerationHandler] GraphQL errors in retry ${retryCount + 1}:`,
                    result.errors,
                );
                throw new Error(
                    `GraphQL errors: ${JSON.stringify(result.errors)}`,
                );
            }

            return result.data;
        } catch (error) {
            console.error(
                `[MediaGenerationHandler] Gemini retry ${retryCount + 1} failed:`,
                error.message,
            );
            throw error;
        }
    }

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        const userId = metadata.userId;

        // Check if this is a Gemini model that needs retry due to missing artifacts
        if (
            (metadata.model === "gemini-25-flash-image-preview" ||
                metadata.model === "gemini-3-pro-image-preview") &&
            !infoObject?.artifacts
        ) {
            const retryCount = metadata.geminiRetryCount || 0;
            const maxRetries = 3;

            if (retryCount < maxRetries) {
                // Update retry count in metadata
                metadata.geminiRetryCount = retryCount + 1;

                // Create a new job for retry
                const retryJob = {
                    data: {
                        taskId,
                        metadata: {
                            ...metadata,
                            geminiRetryCount: retryCount + 1,
                        },
                    },
                    client,
                };

                try {
                    // Wait a bit before retrying (exponential backoff)
                    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    const retryData = await this.retryGeminiRequest(
                        retryJob,
                        retryCount,
                    );

                    // Process the retry response
                    if (userId) {
                        const processedData = await this.processMediaData(
                            retryData,
                            infoObject,
                            metadata,
                        );

                        // Check if the retry also failed to produce artifacts
                        if (
                            !processedData ||
                            (!processedData.url &&
                                !processedData.azureUrl &&
                                !processedData.gcsUrl)
                        ) {
                            throw new Error(
                                "Retry failed to produce artifacts",
                            );
                        }

                        await this.handleMediaGenerationCompletion(
                            userId,
                            processedData,
                            metadata,
                        );

                        const result = {
                            message: "Media generation completed successfully",
                            type: metadata.outputType,
                            model: metadata.model,
                            prompt: metadata.prompt,
                            url: processedData?.url,
                            azureUrl: processedData?.azureUrl,
                            gcsUrl: processedData?.gcsUrl,
                        };

                        return result;
                    }
                } catch (retryError) {
                    console.error(
                        `[MediaGenerationHandler] Gemini retry ${retryCount + 1} failed:`,
                        retryError.message,
                    );

                    // If this was the last retry, fall through to error handling
                    if (retryCount + 1 >= maxRetries) {
                        if (userId) {
                            await this.updateOrCreateMediaItemWithError(
                                userId,
                                metadata,
                                "GEMINI_RETRY_FAILED",
                                "Gemini failed to generate image after 3 retries",
                            );
                        }

                        return {
                            error: "Gemini failed to generate image after 3 retries",
                            type: metadata.outputType,
                            model: metadata.model,
                            prompt: metadata.prompt,
                        };
                    }
                }
            } else {
                if (userId) {
                    await this.updateOrCreateMediaItemWithError(
                        userId,
                        metadata,
                        "GEMINI_RETRY_FAILED",
                        "Gemini failed to generate image after 3 retries",
                    );
                }

                return {
                    error: "Gemini failed to generate image after 3 retries",
                    type: metadata.outputType,
                    model: metadata.model,
                    prompt: metadata.prompt,
                };
            }
        }

        let processedData = null;
        if (userId) {
            processedData = await this.processMediaData(
                dataObject,
                infoObject,
                metadata,
            );
            await this.handleMediaGenerationCompletion(
                userId,
                processedData,
                metadata,
            );
        }

        const result = {
            message: "Media generation completed successfully",
            type: metadata.outputType,
            model: metadata.model,
            prompt: metadata.prompt,
            url: processedData?.url,
            azureUrl: processedData?.azureUrl,
            gcsUrl: processedData?.gcsUrl,
        };

        return result;
    }

    async handleError(taskId, error, metadata, client) {
        const userId = metadata.userId;

        // Extract the actual error message from Veo error responses
        let actualErrorMessage =
            error?.message || error?.toString() || "Media generation failed";
        let errorCode = error?.code || "TASK_FAILED";

        // Handle Veo error format: "Veo operation completed but no videos returned: {...}"
        const errorString =
            typeof error === "string" ? error : error?.message || "";
        if (
            errorString.includes(
                "Veo operation completed but no videos returned:",
            )
        ) {
            try {
                // Extract the JSON part after the colon
                const jsonStart = errorString.indexOf("{");
                if (jsonStart !== -1) {
                    const jsonString = errorString.substring(jsonStart);
                    const veoError = JSON.parse(jsonString);

                    // Extract the nested error message
                    if (veoError.error && veoError.error.message) {
                        actualErrorMessage = veoError.error.message;
                        errorCode = veoError.error.code || "VEO_ERROR";
                    }
                }
            } catch (parseError) {
                console.error("Error parsing Veo error:", parseError);
                // Fall back to the original error message
            }
        }

        if (userId) {
            await this.updateOrCreateMediaItemWithError(
                userId,
                metadata,
                errorCode,
                actualErrorMessage,
            );
        }

        return { error: actualErrorMessage };
    }

    async cancelRequest(taskId, client) {
        // Update MediaItem when task is cancelled
        try {
            const Task = (await import("../../app/api/models/task.mjs"))
                .default;
            const task = await Task.findOne({ _id: taskId });

            if (!task || !task.owner) {
                return;
            }

            await this.updateOrCreateMediaItemWithError(
                task.owner.toString(),
                { taskId },
                "TASK_CANCELLED",
                "Task was cancelled",
            );
        } catch (error) {
            console.error("Error updating MediaItem on cancellation:", error);
            // Don't throw - cancellation should succeed even if MediaItem update fails
        }
    }

    async processMediaData(dataObject, infoObject, metadata) {
        try {
            let mediaUrl = null;

            // Handle Gemini special case first - returns cloudUrls object directly
            let cloudUrls = null;
            const isGeminiModel =
                metadata.model === "gemini-25-flash-image-preview" ||
                metadata.model === "gemini-3-pro-image-preview";

            if (isGeminiModel && infoObject?.artifacts) {
                const geminiResult = await this.processGeminiArtifacts(
                    infoObject.artifacts,
                    metadata.userId,
                );
                // processGeminiArtifacts returns:
                // - { azureUrl, gcsUrl } object on success
                // - data URL string on upload failure (fallback)
                // - null if no artifacts
                if (geminiResult && typeof geminiResult === "object") {
                    cloudUrls = geminiResult;
                    mediaUrl = cloudUrls.azureUrl || cloudUrls.gcsUrl;
                } else if (typeof geminiResult === "string") {
                    // Fallback data URL - will be uploaded below
                    mediaUrl = geminiResult;
                }
            }

            // Handle Veo video responses
            if (
                !mediaUrl &&
                metadata.outputType === "video" &&
                metadata.model?.includes("veo")
            ) {
                mediaUrl = this.processVeoVideoResponse(dataObject);
            }

            // Handle standard image/video responses
            if (!mediaUrl) {
                mediaUrl = this.processStandardResponse(dataObject);
            }

            // Upload to cloud storage if we have a valid URL (skip if Gemini already uploaded)
            if (!cloudUrls && mediaUrl && typeof mediaUrl === "string") {
                // Get user's contextId for file scoping
                let contextId = null;
                if (metadata.userId) {
                    try {
                        await initializeUserModel();
                        const user = await User.findById(metadata.userId);
                        if (user?.contextId) {
                            contextId = user.contextId;
                        }
                    } catch (error) {
                        console.error(
                            "Error getting user contextId for media upload:",
                            error,
                        );
                        // Continue without contextId if lookup fails
                    }
                }

                try {
                    cloudUrls = await this.uploadMediaToCloud(
                        mediaUrl,
                        contextId,
                    );
                } catch (error) {
                    console.error("Failed to upload media to cloud:", error);
                }
            }

            // Return processed data with cloud URLs
            const isGoogleModel = metadata.model?.includes("veo");
            const finalUrl = isGoogleModel
                ? cloudUrls?.gcsUrl || mediaUrl
                : cloudUrls?.azureUrl ||
                  (mediaUrl && !mediaUrl.startsWith("data:")
                      ? mediaUrl
                      : undefined);

            // Only include URL fields if they have truthy values (CSFLE can't encrypt null/undefined)
            return {
                ...(finalUrl && { url: finalUrl }),
                ...(cloudUrls?.azureUrl && { azureUrl: cloudUrls.azureUrl }),
                ...(cloudUrls?.gcsUrl && { gcsUrl: cloudUrls.gcsUrl }),
                ...(dataObject?.id && { id: dataObject.id }),
                ...(dataObject?.model && { model: dataObject.model }),
                ...(dataObject?.version && { version: dataObject.version }),
            };
        } catch (error) {
            console.error("Error processing media data:", error);
            return dataObject;
        }
    }

    async processGeminiArtifacts(artifacts, userId = null) {
        try {
            if (Array.isArray(artifacts)) {
                const imageArtifact = artifacts.find(
                    (artifact) => artifact.type === "image",
                );

                if (imageArtifact) {
                    if (imageArtifact.data) {
                        try {
                            const dataUrl = `data:${imageArtifact.mimeType || "image/png"};base64,${imageArtifact.data}`;

                            // Get user's contextId for file scoping
                            let contextId = null;
                            if (userId) {
                                try {
                                    await initializeUserModel();
                                    const user = await User.findById(userId);
                                    if (user?.contextId) {
                                        contextId = user.contextId;
                                    }
                                } catch (error) {
                                    console.error(
                                        "Error getting user contextId for Gemini upload:",
                                        error,
                                    );
                                    // Continue without contextId if lookup fails
                                }
                            }

                            const cloudUrls = await this.uploadMediaToCloud(
                                dataUrl,
                                contextId,
                            );

                            if (cloudUrls) {
                                // Return the full cloudUrls object so we preserve both URLs
                                return cloudUrls;
                            }
                        } catch (uploadError) {
                            console.error(
                                "Failed to upload Gemini image to cloud:",
                                uploadError,
                            );

                            const fallbackUrl = `data:${imageArtifact.mimeType};base64,${imageArtifact.data}`;
                            return fallbackUrl;
                        }
                    } else {
                        console.warn(`Image artifact has no data field`);
                    }
                } else {
                    console.warn(`No image artifact found in artifacts array`);
                }
            } else {
                console.warn(`Artifacts is not an array:`, typeof artifacts);
            }
        } catch (e) {
            console.error("Error parsing Gemini infoObject artifacts:", e);
        }
        return null;
    }

    processVeoVideoResponse(dataObject) {
        // Check for direct Veo response structure
        if (
            dataObject?.response?.videos &&
            Array.isArray(dataObject.response.videos) &&
            dataObject.response.videos.length > 0
        ) {
            return extractVideoUrl(dataObject.response.videos[0]);
        }

        // Check for result wrapper structure
        if (
            dataObject?.result?.response?.videos &&
            Array.isArray(dataObject.result.response.videos) &&
            dataObject.result.response.videos.length > 0
        ) {
            return extractVideoUrl(dataObject.result.response.videos[0]);
        }

        // Fallback: check if data.result.output is a string that needs parsing
        if (
            dataObject?.result?.output &&
            typeof dataObject.result.output === "string"
        ) {
            try {
                const parsed = JSON.parse(dataObject.result.output);

                // Try different possible response structures
                const structures = [
                    parsed.response?.videos?.[0],
                    parsed.videos?.[0],
                    parsed.gcsUri ? { gcsUri: parsed.gcsUri } : null,
                    parsed.url ? { url: parsed.url } : null,
                ].filter(Boolean);

                for (const structure of structures) {
                    const url = extractVideoUrl(structure) || structure.url;
                    if (url) return url;
                }
            } catch (e) {
                console.error("Error parsing Veo video response:", e);
            }
        }

        return null;
    }

    processStandardResponse(dataObject) {
        // Try different possible structures
        if (dataObject?.output) {
            return Array.isArray(dataObject.output)
                ? dataObject.output[0]
                : dataObject.output;
        }
        if (dataObject?.result?.output) {
            return Array.isArray(dataObject.result.output)
                ? dataObject.result.output[0]
                : dataObject.result.output;
        }
        return null;
    }

    async uploadMediaToCloud(mediaUrl, contextId = null) {
        try {
            if (!process.env.CORTEX_MEDIA_API_URL) {
                throw new Error(
                    "CORTEX_MEDIA_API_URL environment variable is not set",
                );
            }

            const serverUrl = process.env.CORTEX_MEDIA_API_URL;

            if (mediaUrl.startsWith("data:")) {
                return await this.uploadBase64Data(
                    mediaUrl,
                    serverUrl,
                    contextId,
                );
            } else {
                return await this.uploadRegularUrl(
                    mediaUrl,
                    serverUrl,
                    contextId,
                );
            }
        } catch (error) {
            console.error("Error uploading media to cloud:", error);
            throw error;
        }
    }

    async uploadBase64Data(mediaUrl, serverUrl, contextId = null) {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();

        const formData = new FormData();
        const mimeType = mediaUrl.split(";")[0].split(":")[1];
        const extension = mimeType.split("/")[1] || "bin";
        const filename = `media.${extension}`;
        formData.append("file", blob, filename);

        // Add contextId if provided
        if (contextId) {
            formData.append("contextId", contextId);
        }

        const uploadUrl = new URL(serverUrl);
        if (contextId) {
            uploadUrl.searchParams.set("contextId", contextId);
        }

        const uploadResponse = await fetch(uploadUrl.toString(), {
            method: "POST",
            body: formData,
        });

        if (!uploadResponse.ok) {
            const errorBody = await uploadResponse.text();
            console.error(
                `Upload failed with status ${uploadResponse.status}: ${errorBody}`,
            );
            throw new Error(
                `Upload failed: ${uploadResponse.statusText}. Response body: ${errorBody}`,
            );
        }

        const data = await uploadResponse.json();

        const validatedUrls = this.validateCloudUrls(data);
        return validatedUrls;
    }

    async uploadRegularUrl(mediaUrl, serverUrl, contextId = null) {
        const url = new URL(serverUrl);
        url.searchParams.set("fetch", mediaUrl);

        // Add contextId if provided
        if (contextId) {
            url.searchParams.set("contextId", contextId);
        }

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Upload failed: ${response.statusText}. Response body: ${errorBody}`,
            );
        }

        const data = await response.json();
        return this.validateCloudUrls(data);
    }

    validateCloudUrls(data) {
        const hasAzureUrl =
            data.url && data.url.includes("blob.core.windows.net");
        const hasGcsUrl = data.gcs;

        if (!hasAzureUrl || !hasGcsUrl) {
            throw new Error(
                "Media file upload failed: Missing required storage URLs",
            );
        }

        return {
            azureUrl: data.url,
            gcsUrl: data.gcs,
        };
    }

    async getInheritedTags(userId, inputImageUrls, inputTags = []) {
        // Use tags passed from the frontend instead of querying encrypted URL fields
        if (inputTags && inputTags.length > 0) {
            return inputTags;
        }

        // Fallback: return empty array if no tags provided
        return [];
    }

    async handleMediaGenerationCompletion(userId, dataObject, metadata) {
        try {
            // Get inherited tags from input images
            const inputImageUrls = [
                metadata.inputImageUrl,
                metadata.inputImageUrl2,
                metadata.inputImageUrl3,
                metadata.inputImageUrl4,
                metadata.inputImageUrl5,
                metadata.inputImageUrl6,
                metadata.inputImageUrl7,
                metadata.inputImageUrl8,
                metadata.inputImageUrl9,
                metadata.inputImageUrl10,
                metadata.inputImageUrl11,
                metadata.inputImageUrl12,
                metadata.inputImageUrl13,
                metadata.inputImageUrl14,
            ].filter(Boolean);

            const inheritedTags = await this.getInheritedTags(
                userId,
                inputImageUrls,
                metadata.inputTags,
            );

            // Build update data - only include encrypted URL fields if they have values (CSFLE can't encrypt null)
            const updateData = {
                status: "completed",
                completed: Math.floor(Date.now() / 1000),
                // Inherit tags from input images
                tags: inheritedTags,
                // Only include encrypted URL fields if they have truthy values
                ...(dataObject.url && { url: dataObject.url }),
                ...(dataObject.azureUrl && { azureUrl: dataObject.azureUrl }),
                ...(dataObject.gcsUrl && { gcsUrl: dataObject.gcsUrl }),
                // Video-specific fields (not encrypted, so undefined is OK but be explicit)
                ...(dataObject.duration !== undefined && {
                    duration: dataObject.duration,
                }),
                ...(dataObject.generateAudio !== undefined && {
                    generateAudio: dataObject.generateAudio,
                }),
                ...(dataObject.resolution && {
                    resolution: dataObject.resolution,
                }),
                ...(dataObject.cameraFixed !== undefined && {
                    cameraFixed: dataObject.cameraFixed,
                }),
            };

            const mediaItem = await MediaItem.findOneAndUpdate(
                { user: userId, taskId: metadata.taskId },
                updateData,
                { new: true, runValidators: true },
            );

            if (!mediaItem) {
                // Create a new media item if it doesn't exist (fallback)
                const newMediaItem = new MediaItem({
                    user: userId,
                    taskId: metadata.taskId,
                    cortexRequestId: metadata.taskId,
                    prompt: metadata.prompt || "",
                    type: metadata.outputType || "image",
                    model: metadata.model || "",
                    ...updateData,
                    settings: metadata.settings,
                    // Only include encrypted inputImageUrl fields if they have values (CSFLE can't encrypt null)
                    ...(metadata.inputImageUrl && {
                        inputImageUrl: metadata.inputImageUrl,
                    }),
                    ...(metadata.inputImageUrl2 && {
                        inputImageUrl2: metadata.inputImageUrl2,
                    }),
                    ...(metadata.inputImageUrl3 && {
                        inputImageUrl3: metadata.inputImageUrl3,
                    }),
                });
                await newMediaItem.save();
            }
        } catch (error) {
            console.error("Error updating media item:", error);
            throw error;
        }
    }
}

const mediaGenerationHandler = new MediaGenerationHandler();
export default mediaGenerationHandler;
