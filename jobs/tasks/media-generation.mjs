import { BaseTask } from "./base-task.mjs";
import { IMAGE_FLUX, IMAGE_GEMINI_25, IMAGE_QWEN, VIDEO_VEO, VIDEO_SEEDANCE } from "../graphql.mjs";
import UserState from "../../app/api/models/user-state.mjs";
import MediaItem from "../../app/api/models/media-item.mjs";

// Function to format image input for Veo models
const formatImageForVeo = (imageUrl) => {
    if (!imageUrl) return "";

    // Check if it's already in gs:// format
    if (imageUrl.startsWith("gs://")) {
        // Determine mime type from file extension
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
        // Extract the GCS URI from the URL
        // Assuming the URL is in format: https://storage.googleapis.com/bucket-name/path/to/image.jpg
        const url = new URL(imageUrl);
        if (url.hostname === "storage.googleapis.com") {
            // Convert to gs:// format
            const gcsUri = `gs://${url.pathname.substring(1)}`;
            // Determine mime type from file extension
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

    // If it's not a GCS URL or parsing fails, return the original URL as a fallback
    return imageUrl;
};

class MediaGenerationHandler extends BaseTask {
    get displayName() {
        return "Media generation";
    }

    get isRetryable() {
        return true;
    }

    getResultKey(outputType, model) {
        if (outputType === "image") {
            if (model === "gemini-25-flash-image-preview") {
                return "image_gemini_25";
            } else if (model === "replicate-qwen-image" || model === "replicate-qwen-image-edit-plus") {
                return "image_qwen";
            } else {
                return "image_flux";
            }
        } else {
            // Video models
            if (model === "replicate-seedance-1-pro") {
                return "video_seedance";
            } else {
                return "video_veo";
            }
        }
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

        // Add taskId to metadata for completion handling
        metadata.taskId = taskId;

        if (!prompt) {
            throw new Error("Prompt is required for media generation");
        }

        let variables = {};
        let query = null;

        if (outputType === "image") {
            // Image generation
            const modelName = model || "replicate-flux-11-pro";
            const modelSettings = settings?.models?.[modelName] || {
                aspectRatio: "1:1",
            };

            // Validate aspect ratio - "match_input_image" requires an input image
            let aspectRatio = modelSettings.aspectRatio;
            if (aspectRatio === "match_input_image" && !inputImageUrl) {
                // Fall back to a safe default if user selected "match_input_image" but no input image
                aspectRatio = "1:1";
            }

            // Select the appropriate query based on the model
            if (modelName === "gemini-25-flash-image-preview") {
                variables = {
                    text: prompt,
                    async: true,
                    input_image: inputImageUrl || "",
                    input_image_2: inputImageUrl2 || "",
                    input_image_3: "", // Gemini supports up to 3 input images
                    optimizePrompt: true,
                };
                query = IMAGE_GEMINI_25;
            } else if (modelName === "replicate-qwen-image" || modelName === "replicate-qwen-image-edit-plus") {
                // Set different defaults based on model type
                const isEditPlus = modelName === "replicate-qwen-image-edit-plus";
                
                // Start with minimal required parameters - text and model are required
                variables = {
                    text: prompt,
                    model: modelName, // model is required in IMAGE_QWEN query
                    async: true,
                };

                // Only add other parameters for edit-plus model
                if (isEditPlus) {
                    variables.input_image = inputImageUrl || "";
                    variables.input_image_2 = inputImageUrl2 || "";
                    variables.input_image_3 = inputImageUrl3 || "";
                }
                
                // Debug: Log the variables being sent
                console.log(`[DEBUG] Qwen variables for ${modelName}:`, JSON.stringify(variables, null, 2));
                
                query = IMAGE_QWEN; // Use IMAGE_QWEN query
            } else {
                // Default to IMAGE_FLUX for Flux models
                variables = {
                    text: prompt,
                    async: true,
                    model: modelName,
                    input_image: inputImageUrl || "",
                    input_image_2: inputImageUrl2 || "",
                    input_image_3: inputImageUrl3 || "",
                    aspectRatio: aspectRatio,
                };
                query = IMAGE_FLUX;
            }
        } else {
            // Video generation
            const modelName = model || "replicate-seedance-1-pro";
            const modelSettings = settings?.models?.[modelName] || {
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            };

            if (modelName === "replicate-seedance-1-pro") {
                variables = {
                    text: prompt,
                    async: true,
                    model: modelName,
                    resolution: modelSettings.resolution,
                    aspectRatio: modelSettings.aspectRatio,
                    duration: modelSettings.duration,
                    camera_fixed: modelSettings.cameraFixed,
                    image: inputImageUrl || "",
                    seed: -1,
                };
                query = VIDEO_SEEDANCE;
            } else {
                // Veo models
                // For VEO3 with input image, override generateAudio to false
                let generateAudio = modelSettings.generateAudio;
                if (modelName === "veo-3.0-generate" && inputImageUrl) {
                    generateAudio = false;
                }

                variables = {
                    text: prompt,
                    async: true,
                    image: formatImageForVeo(inputImageUrl),
                    video: "",
                    lastFrame: "",
                    model: modelName,
                    aspectRatio: modelSettings.aspectRatio,
                    durationSeconds: modelSettings.duration,
                    enhancePrompt: true,
                    generateAudio: generateAudio,
                    negativePrompt: "",
                    personGeneration: "allow_all",
                    sampleCount: 1,
                    storageUri: "",
                    location: "us-central1",
                    seed: -1,
                };
                query = VIDEO_VEO;
            }
        }

        let data;
        try {
            const result = await job.client.query({
                query,
                variables,
                fetchPolicy: "no-cache",
            });
            data = result.data;

            if (result.errors) {
                console.debug(
                    `[MediaGenerationHandler] GraphQL errors encountered`,
                    result.errors,
                );
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            console.log(`[DEBUG] GraphQL response data:`, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`[DEBUG] Full GraphQL error:`, error);
            console.error(`[DEBUG] Error message:`, error.message);
            console.error(`[DEBUG] Error networkError:`, error.networkError);
            if (error.networkError && error.networkError.result) {
                console.error(`[DEBUG] Network error result:`, JSON.stringify(error.networkError.result, null, 2));
            }
            throw error;
        }

        const resultKey = this.getResultKey(outputType, model);

        const result = data?.[resultKey]?.result;

        if (!result) {
            console.debug(
                `[MediaGenerationHandler] No result returned from service`,
                data,
            );
            throw new Error("No result returned from media generation service");
        }

        return result;
    }

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        // Get userId from the job data, not metadata
        const userId = metadata.userId;

        let processedData = null;
        if (userId) {
            // Handle cloud upload if needed
            processedData = await this.processMediaData(dataObject, infoObject, metadata);

            await this.handleMediaGenerationCompletion(
                userId,
                processedData,
                metadata,
            );
        }

        // Return only essential metadata instead of the full dataObject to avoid Cosmos DB size limits
        return {
            message: "Media generation completed successfully",
            type: metadata.outputType,
            model: metadata.model,
            prompt: metadata.prompt,
            // Include URLs if available, but not the full video data
            url: processedData?.url,
            azureUrl: processedData?.azureUrl,
            gcsUrl: processedData?.gcsUrl,
        };
    }

    async handleError(taskId, error, metadata, client) {
        // Get userId from the job data, not metadata
        const userId = metadata.userId;

        if (userId) {
            try {
                // Update the media item with error status
                await MediaItem.findOneAndUpdate(
                    { user: userId, taskId: metadata.taskId },
                    {
                        status: "failed",
                        error: {
                            code: error.code || "TASK_FAILED",
                            message: error.message || "Media generation failed",
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

        return { error: error.message };
    }

    async processMediaData(dataObject, infoObject, metadata) {
        try {
            let mediaUrl = null;

            // Handle different response structures based on media type
            if (
                metadata.outputType === "video" &&
                metadata.model?.includes("veo")
            ) {
                // Veo video response structure

                // Check for the direct Veo response structure (no result wrapper)
                if (
                    dataObject?.response?.videos &&
                    Array.isArray(dataObject.response.videos) &&
                    dataObject.response.videos.length > 0
                ) {
                    const video = dataObject.response.videos[0];

                    if (video.bytesBase64Encoded) {
                        mediaUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                    } else if (video.gcsUri) {
                        mediaUrl = video.gcsUri.replace(
                            "gs://",
                            "https://storage.googleapis.com/",
                        );
                    }
                }
                // Check for result wrapper structure
                else if (
                    dataObject?.result?.response?.videos &&
                    Array.isArray(dataObject.result.response.videos) &&
                    dataObject.result.response.videos.length > 0
                ) {
                    const video = dataObject.result.response.videos[0];
                    if (video.bytesBase64Encoded) {
                        mediaUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                    } else if (video.gcsUri) {
                        mediaUrl = video.gcsUri.replace(
                            "gs://",
                            "https://storage.googleapis.com/",
                        );
                    }
                }
                // Fallback: check if data.result.output is a string that needs parsing
                else if (
                    dataObject?.result?.output &&
                    typeof dataObject.result.output === "string"
                ) {
                    try {
                        const parsed = JSON.parse(dataObject.result.output);

                        // Try different possible response structures
                        let videoUrl = null;

                        // Structure 1: parsed.response.videos[0].gcsUri
                        if (
                            parsed.response?.videos &&
                            Array.isArray(parsed.response.videos) &&
                            parsed.response.videos.length > 0
                        ) {
                            const video = parsed.response.videos[0];
                            if (video.gcsUri) {
                                videoUrl = video.gcsUri.replace(
                                    "gs://",
                                    "https://storage.googleapis.com/",
                                );
                            } else if (video.bytesBase64Encoded) {
                                videoUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                            }
                        }

                        // Structure 2: parsed.videos[0].gcsUri (no response wrapper)
                        if (
                            !videoUrl &&
                            parsed.videos &&
                            Array.isArray(parsed.videos) &&
                            parsed.videos.length > 0
                        ) {
                            const video = parsed.videos[0];
                            if (video.gcsUri) {
                                videoUrl = video.gcsUri.replace(
                                    "gs://",
                                    "https://storage.googleapis.com/",
                                );
                            } else if (video.bytesBase64Encoded) {
                                videoUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                            }
                        }

                        // Structure 3: direct gcsUri in parsed
                        if (!videoUrl && parsed.gcsUri) {
                            videoUrl = parsed.gcsUri.replace(
                                "gs://",
                                "https://storage.googleapis.com/",
                            );
                        }

                        // Structure 4: direct URL in parsed
                        if (!videoUrl && parsed.url) {
                            videoUrl = parsed.url;
                        }

                        if (videoUrl) {
                            mediaUrl = videoUrl;
                        }
                    } catch (e) {
                        console.error("Error parsing Veo video response:", e);
                    }
                }
            } else {
                // Handle image generation - check for Gemini's infoObject artifacts first
                if (metadata.model === "gemini-25-flash-image-preview" && infoObject?.artifacts) {
                    try {
                        if (Array.isArray(infoObject.artifacts)) {
                            const imageArtifact = infoObject.artifacts.find(artifact => artifact.type === 'image');
                            if (imageArtifact && imageArtifact.data) {
                                // Upload base64 data directly to cloud storage instead of creating data URL
                                try {
                                    const dataUrl = `data:${imageArtifact.mimeType || 'image/png'};base64,${imageArtifact.data}`;
                                    const cloudUrls = await this.uploadMediaToCloud(dataUrl);
                                    if (cloudUrls) {
                                        mediaUrl = cloudUrls.azureUrl || cloudUrls.gcsUrl;
                                    }
                                } catch (uploadError) {
                                    console.error("Failed to upload Gemini image to cloud:", uploadError);
                                    // Fallback to data URL if upload fails
                                    mediaUrl = `data:${imageArtifact.mimeType};base64,${imageArtifact.data}`;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error parsing Gemini infoObject artifacts:", e);
                    }
                }
                
                // Standard image/video response structure
                // Try different possible structures
                if (!mediaUrl && dataObject?.output) {
                    mediaUrl = Array.isArray(dataObject.output)
                        ? dataObject.output[0]
                        : dataObject.output;
                } else if (!mediaUrl && dataObject?.result?.output) {
                    mediaUrl = Array.isArray(dataObject.result.output)
                        ? dataObject.result.output[0]
                        : dataObject.result.output;
                }
            }

            // Final fallback: check if the entire dataObject is the response
            if (
                !mediaUrl &&
                metadata.outputType === "video" &&
                metadata.model?.includes("veo")
            ) {
                if (
                    dataObject?.response?.videos &&
                    Array.isArray(dataObject.response.videos) &&
                    dataObject.response.videos.length > 0
                ) {
                    const video = dataObject.response.videos[0];
                    if (video.bytesBase64Encoded) {
                        mediaUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                    } else if (video.gcsUri) {
                        mediaUrl = video.gcsUri.replace(
                            "gs://",
                            "https://storage.googleapis.com/",
                        );
                    }
                }
            }

            // Upload to cloud storage if we have a valid URL
            let cloudUrls = null;
            if (mediaUrl && typeof mediaUrl === "string") {
                try {
                    cloudUrls = await this.uploadMediaToCloud(mediaUrl);
                } catch (error) {
                    console.error("Failed to upload media to cloud:", error);
                    // Continue without cloud URLs if upload fails
                }
            }

            // Return processed data with cloud URLs (without the full dataObject to avoid size issues)
            // For Google models (Veo), prioritize GCS URL
            const isGoogleModel = metadata.model?.includes("veo");

            return {
                // Only include essential fields, not the full dataObject
                url: isGoogleModel
                    ? cloudUrls?.gcsUrl || mediaUrl
                    : cloudUrls?.azureUrl ||
                      (mediaUrl && !mediaUrl.startsWith("data:")
                          ? mediaUrl
                          : undefined),
                azureUrl: cloudUrls?.azureUrl,
                gcsUrl: cloudUrls?.gcsUrl,
                // Include any other essential metadata from dataObject if needed
                ...(dataObject?.id && { id: dataObject.id }),
                ...(dataObject?.model && { model: dataObject.model }),
                ...(dataObject?.version && { version: dataObject.version }),
            };
        } catch (error) {
            console.error("Error processing media data:", error);
            return dataObject;
        }
    }

    async uploadMediaToCloud(mediaUrl) {
        try {
            // Use CORTEX_MEDIA_API_URL environment variable
            if (!process.env.CORTEX_MEDIA_API_URL) {
                throw new Error(
                    "CORTEX_MEDIA_API_URL environment variable is not set",
                );
            }
            // The CORTEX_MEDIA_API_URL already includes the full URL with query parameters
            const serverUrl = process.env.CORTEX_MEDIA_API_URL;

            // Handle base64 data URLs differently
            if (mediaUrl.startsWith("data:")) {
                // For base64 data URLs, we need to convert to blob and upload
                const response = await fetch(mediaUrl);
                const blob = await response.blob();

                // Create FormData with the blob
                const formData = new FormData();
                // Determine file extension from MIME type
                const mimeType = mediaUrl.split(';')[0].split(':')[1];
                const extension = mimeType.split('/')[1] || 'bin';
                const filename = `media.${extension}`;
                formData.append("file", blob, filename);

                const uploadResponse = await fetch(serverUrl, {
                    method: "POST",
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    const errorBody = await uploadResponse.text();
                    throw new Error(
                        `Upload failed: ${uploadResponse.statusText}. Response body: ${errorBody}`,
                    );
                }

                const data = await uploadResponse.json();

                // Validate that we have both Azure and GCS URLs
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
            } else {
                // Handle regular URLs
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

                // Validate that we have both Azure and GCS URLs
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
        } catch (error) {
            console.error("Error uploading media to cloud:", error);
            throw error;
        }
    }

    async handleMediaGenerationCompletion(userId, dataObject, metadata) {
        try {
            // Find and update the media item
            const mediaItem = await MediaItem.findOneAndUpdate(
                { user: userId, taskId: metadata.taskId },
                {
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
                },
                { new: true, runValidators: true },
            );

            if (!mediaItem) {
                console.warn(
                    `Media item not found for taskId: ${metadata.taskId}`,
                );
                // Create a new media item if it doesn't exist (fallback)
                const newMediaItem = new MediaItem({
                    user: userId,
                    taskId: metadata.taskId,
                    cortexRequestId: metadata.taskId,
                    prompt: metadata.prompt,
                    type: metadata.outputType,
                    model: metadata.model,
                    status: "completed",
                    completed: Math.floor(Date.now() / 1000),
                    url: dataObject.url,
                    azureUrl: dataObject.azureUrl,
                    gcsUrl: dataObject.gcsUrl,
                    inputImageUrl: metadata.inputImageUrl,
                    inputImageUrl2: metadata.inputImageUrl2,
                    settings: metadata.settings,
                    // Video-specific fields
                    duration: dataObject.duration,
                    generateAudio: dataObject.generateAudio,
                    resolution: dataObject.resolution,
                    cameraFixed: dataObject.cameraFixed,
                });
                await newMediaItem.save();
            }
        } catch (error) {
            console.error("Error updating media item:", error);
            throw error;
        }
    }
}

export default new MediaGenerationHandler();
