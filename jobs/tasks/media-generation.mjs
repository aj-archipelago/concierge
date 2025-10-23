import { BaseTask } from "./base-task.mjs";
import {
    IMAGE_FLUX,
    IMAGE_GEMINI_25,
    IMAGE_QWEN,
    IMAGE_SEEDREAM4,
    VIDEO_VEO,
    VIDEO_SEEDANCE,
} from "../graphql.mjs";
import MediaItem from "../../app/api/models/media-item.mjs";

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
        const { taskId, metadata } = job.data;
        const {
            prompt,
            outputType,
            model,
            inputImageUrl,
            inputImageUrl2,
            inputImageUrl3,
            settings,
        } = metadata;

        metadata.taskId = taskId;

        if (!prompt) {
            throw new Error("Prompt is required for media generation");
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
                throw new Error(
                    `GraphQL errors: ${JSON.stringify(result.errors)}`,
                );
            }
        } catch (error) {
            console.error(
                `[MediaGenerationHandler] GraphQL error:`,
                error.message,
            );
            throw error;
        }

        const resultKey = this.getResultKey(outputType, modelName);
        const result = data?.[resultKey]?.result;

        if (!result) {
            console.debug(
                `[MediaGenerationHandler] No result returned from service`,
            );
            throw new Error("No result returned from media generation service");
        }

        return result;
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
            metadata.model === "gemini-25-flash-image-preview" &&
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
                            try {
                                await MediaItem.findOneAndUpdate(
                                    { user: userId, taskId: metadata.taskId },
                                    {
                                        status: "failed",
                                        error: {
                                            code: "GEMINI_RETRY_FAILED",
                                            message:
                                                "Gemini failed to generate image after 3 retries",
                                        },
                                    },
                                    { new: true, runValidators: true },
                                );
                            } catch (updateError) {
                                console.error(
                                    "Error updating media item with retry failure:",
                                    updateError,
                                );
                            }
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
                    try {
                        await MediaItem.findOneAndUpdate(
                            { user: userId, taskId: metadata.taskId },
                            {
                                status: "failed",
                                error: {
                                    code: "GEMINI_RETRY_FAILED",
                                    message:
                                        "Gemini failed to generate image after 3 retries",
                                },
                            },
                            { new: true, runValidators: true },
                        );
                    } catch (updateError) {
                        console.error(
                            "Error updating media item with retry failure:",
                            updateError,
                        );
                    }
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
        let actualErrorMessage = error.message || "Media generation failed";
        let errorCode = error.code || "TASK_FAILED";

        // Handle Veo error format: "Veo operation completed but no videos returned: {...}"
        if (
            typeof error === "string" &&
            error.includes("Veo operation completed but no videos returned:")
        ) {
            try {
                // Extract the JSON part after the colon
                const jsonStart = error.indexOf("{");
                if (jsonStart !== -1) {
                    const jsonString = error.substring(jsonStart);
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
            try {
                await MediaItem.findOneAndUpdate(
                    { user: userId, taskId: metadata.taskId },
                    {
                        status: "failed",
                        error: {
                            code: errorCode,
                            message: actualErrorMessage,
                        },
                    },
                    { new: true, runValidators: true },
                );
            } catch (updateError) {
                console.error(
                    "Error updating media item with error status:",
                    updateError,
                );
            }
        }

        return { error: actualErrorMessage };
    }

    async processMediaData(dataObject, infoObject, metadata) {
        try {
            let mediaUrl = null;

            // Handle Gemini special case first
            if (
                metadata.model === "gemini-25-flash-image-preview" &&
                infoObject?.artifacts
            ) {
                mediaUrl = await this.processGeminiArtifacts(
                    infoObject.artifacts,
                );
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

            // Upload to cloud storage if we have a valid URL
            let cloudUrls = null;
            if (mediaUrl && typeof mediaUrl === "string") {
                try {
                    cloudUrls = await this.uploadMediaToCloud(mediaUrl);
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

            return {
                url: finalUrl,
                azureUrl: cloudUrls?.azureUrl,
                gcsUrl: cloudUrls?.gcsUrl,
                ...(dataObject?.id && { id: dataObject.id }),
                ...(dataObject?.model && { model: dataObject.model }),
                ...(dataObject?.version && { version: dataObject.version }),
            };
        } catch (error) {
            console.error("Error processing media data:", error);
            return dataObject;
        }
    }

    async processGeminiArtifacts(artifacts) {
        try {
            if (Array.isArray(artifacts)) {
                const imageArtifact = artifacts.find(
                    (artifact) => artifact.type === "image",
                );

                if (imageArtifact) {
                    if (imageArtifact.data) {
                        try {
                            const dataUrl = `data:${imageArtifact.mimeType || "image/png"};base64,${imageArtifact.data}`;

                            const cloudUrls =
                                await this.uploadMediaToCloud(dataUrl);

                            if (cloudUrls) {
                                const finalUrl =
                                    cloudUrls.azureUrl || cloudUrls.gcsUrl;
                                return finalUrl;
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

    async uploadMediaToCloud(mediaUrl) {
        try {
            if (!process.env.CORTEX_MEDIA_API_URL) {
                throw new Error(
                    "CORTEX_MEDIA_API_URL environment variable is not set",
                );
            }

            const serverUrl = process.env.CORTEX_MEDIA_API_URL;

            if (mediaUrl.startsWith("data:")) {
                return await this.uploadBase64Data(mediaUrl, serverUrl);
            } else {
                return await this.uploadRegularUrl(mediaUrl, serverUrl);
            }
        } catch (error) {
            console.error("Error uploading media to cloud:", error);
            throw error;
        }
    }

    async uploadBase64Data(mediaUrl, serverUrl) {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();

        const formData = new FormData();
        const mimeType = mediaUrl.split(";")[0].split(":")[1];
        const extension = mimeType.split("/")[1] || "bin";
        const filename = `media.${extension}`;
        formData.append("file", blob, filename);

        const uploadResponse = await fetch(serverUrl, {
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

    async uploadRegularUrl(mediaUrl, serverUrl) {
        const url = new URL(serverUrl);
        url.searchParams.set("fetch", mediaUrl);

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
            ].filter(Boolean);

            const inheritedTags = await this.getInheritedTags(
                userId,
                inputImageUrls,
                metadata.inputTags,
            );

            const updateData = {
                status: "completed",
                completed: Math.floor(Date.now() / 1000),
                url: dataObject.url,
                azureUrl: dataObject.azureUrl,
                gcsUrl: dataObject.gcsUrl,
                // Video-specific fields
                duration: dataObject.duration,
                generateAudio: dataObject.generateAudio,
                resolution: dataObject.resolution,
                cameraFixed: dataObject.cameraFixed,
                // Inherit tags from input images
                tags: inheritedTags,
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
                    prompt: metadata.prompt,
                    type: metadata.outputType,
                    model: metadata.model,
                    ...updateData,
                    inputImageUrl: metadata.inputImageUrl,
                    inputImageUrl2: metadata.inputImageUrl2,
                    inputImageUrl3: metadata.inputImageUrl3,
                    settings: metadata.settings,
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
