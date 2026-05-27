import { BaseTask } from "./base-task.mjs";
import {
    MEDIA_GENERATE,
    MEDIA_PROMPT_TAGS,
    SYS_MODEL_METADATA,
} from "../graphql.mjs";
import MediaItem from "../../app/api/models/media-item.mjs";
import crypto from "crypto";
import {
    buildMediaHelperFileParams,
    createMediaStorageTarget,
} from "../../src/utils/storageTargets.js";
import { sanitizeMediaSettings } from "../../src/utils/mediaGenerationSettings.js";
import {
    mergeMediaTags,
    parseMediaPromptTagsResult,
} from "../../src/utils/mediaPromptTags.js";
import {
    getGeneratedMediaFilename,
    getGeneratedMediaTaskSuffix,
} from "../../src/utils/mediaGeneratedFilename.js";
import mime from "mime-types";

function normalizeOutputFolder(value) {
    const normalized = String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
    if (!normalized) return "";

    const segments = normalized.split("/").filter(Boolean);
    if (
        segments.some(
            (segment) =>
                segment === "." ||
                segment === ".." ||
                Array.from(segment).some(
                    (character) =>
                        '<>:"|?*'.includes(character) ||
                        character.charCodeAt(0) < 32,
                ),
        )
    ) {
        return "";
    }
    return segments.join("/");
}

function getBlobPathFilename(blobPath) {
    const filename = String(blobPath || "")
        .split("/")
        .filter(Boolean)
        .pop();
    if (!filename) return "";
    try {
        return decodeURIComponent(filename);
    } catch {
        return filename;
    }
}

function getExtensionFromContentType(contentType = "") {
    const normalized = String(contentType).split(";")[0].trim().toLowerCase();
    return mime.extension(normalized) || "";
}

function getExtensionFromUrl(mediaUrl, fallback = "") {
    try {
        const extension = new URL(mediaUrl).pathname.split(".").pop();
        if (extension && extension !== new URL(mediaUrl).pathname) {
            return extension.toLowerCase();
        }
    } catch {
        // Fall through to fallback.
    }
    return fallback;
}

function getMediaFolderTargetBlobPath(blobPath, outputFolder) {
    const normalizedOutputFolder = normalizeOutputFolder(outputFolder);
    const filename = getBlobPathFilename(blobPath);
    if (!blobPath || !normalizedOutputFolder || !filename) return "";

    const parts = String(blobPath).split("/").filter(Boolean);
    const mediaIndex = parts.indexOf("media");
    const baseParts =
        mediaIndex >= 0 ? parts.slice(0, mediaIndex + 1) : parts.slice(0, -1);

    return [
        ...baseParts,
        ...normalizedOutputFolder.split("/").filter(Boolean),
        filename,
    ].join("/");
}

// User model for getting contextId
let User;
async function initializeUserModel() {
    if (!User) {
        const userModule = await import("../../app/api/models/user.mjs");
        User = userModule.default;
    }
    return User;
}

// Cached metadata from API (15-minute TTL)
const METADATA_CACHE_TTL_MS = 15 * 60 * 1000;
let _metadataCache = null;
let _metadataCacheTime = 0;
const GRAPHQL_SUBMIT_MAX_ATTEMPTS = 3;
const GRAPHQL_SUBMIT_RETRY_DELAY_MS = 1500;
const MAX_INPUT_IMAGE_REFERENCES = 14;
const MAX_INPUT_VIDEO_REFERENCES = 1;

const ALLOWED_BLOB_DOMAINS = [
    "blob.core.windows.net",
    "storage.googleapis.com",
    "storage.cloud.google.com",
    "127.0.0.1",
    "localhost",
];

function isAllowedBlobDomain(hostname) {
    return ALLOWED_BLOB_DOMAINS.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
    });
}

function isTransientGraphqlSubmitError(error) {
    const message = error?.message || error?.toString() || "";
    return (
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("socket hang up")
    );
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getInputImageFieldName(base, index) {
    return index === 0 ? base : `${base}${index + 1}`;
}

function getInputVideoFieldName(base, index) {
    return index === 0 ? base : `${base}${index + 1}`;
}

function pickInputImageMetadataFields(metadata) {
    const fields = {};
    for (let index = 0; index < MAX_INPUT_IMAGE_REFERENCES; index++) {
        for (const base of ["inputImageUrl", "inputImageRole"]) {
            const fieldName = getInputImageFieldName(base, index);
            if (metadata?.[fieldName]) {
                fields[fieldName] = metadata[fieldName];
            }
        }
    }
    return fields;
}

function pickInputVideoMetadataFields(metadata) {
    const fields = {};
    for (let index = 0; index < MAX_INPUT_VIDEO_REFERENCES; index++) {
        for (const base of ["inputVideoUrl", "inputVideoRole"]) {
            const fieldName = getInputVideoFieldName(base, index);
            if (metadata?.[fieldName]) {
                fields[fieldName] = metadata[fieldName];
            }
        }
    }
    return fields;
}

function pickInputAudioMetadataFields(metadata) {
    const fields = {};
    for (const fieldName of [
        "inputAudioUrl",
        "inputAudioBlobPath",
        "inputAudioHash",
    ]) {
        if (metadata?.[fieldName]) {
            fields[fieldName] = metadata[fieldName];
        }
    }
    return fields;
}

function pickInputImageValues(metadata, base) {
    return Array.from({ length: MAX_INPUT_IMAGE_REFERENCES }, (_, index) => {
        return metadata?.[getInputImageFieldName(base, index)];
    });
}

function pickInputVideoValues(metadata, base) {
    return Array.from({ length: MAX_INPUT_VIDEO_REFERENCES }, (_, index) => {
        return metadata?.[getInputVideoFieldName(base, index)];
    });
}

function extractBlobPathFromUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        if (urlObj.protocol === "gs:") {
            return segments.map(decodeURIComponent).join("/") || null;
        }
        const isAzurite =
            urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(decodeURIComponent).join("/");
    } catch {
        return null;
    }
}

function extractHashFromBlobUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const lastSegment = urlObj.pathname.split("/").pop();
        if (!lastSegment) return null;
        const decoded = decodeURIComponent(lastSegment);
        const idx = decoded.indexOf("_");
        if (idx > 0) {
            const prefix = decoded.substring(0, idx);
            if (/^[0-9a-f]+$/i.test(prefix)) {
                return prefix;
            }
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

async function fetchShortLivedUrl({ blobPath, hash, contextId } = {}) {
    const attempts = [];
    if (blobPath) {
        attempts.push({ blobPath });
    }
    if (hash) {
        attempts.push({ hash });
    }

    try {
        const mediaHelperUrl = process.env.CORTEX_MEDIA_API_URL;
        if (!mediaHelperUrl) {
            console.warn(
                "[MediaGenerationHandler] CORTEX_MEDIA_API_URL not configured, using original URL",
            );
            return null;
        }

        for (const attempt of attempts) {
            const url = new URL(mediaHelperUrl);
            if (attempt.blobPath) {
                url.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                url.searchParams.set("hash", attempt.hash);
                url.searchParams.set("checkHash", "true");
            }
            if (contextId) {
                url.searchParams.set("contextId", contextId);
            }
            url.searchParams.set("shortLived", "true");
            url.searchParams.set("duration", "300");

            const response = await fetch(url.toString());
            if (!response.ok) {
                if (!attempt.hash || attempts.length === 1) {
                    const errorText = await response.text().catch(() => "");
                    console.warn(
                        "[MediaGenerationHandler] Short-lived URL fetch failed:",
                        response.status,
                        errorText,
                    );
                }
                continue;
            }

            const data = await response.json().catch(() => null);
            const resolvedUrl = data?.shortLivedUrl || data?.url || null;
            if (!resolvedUrl) {
                continue;
            }

            return {
                url: resolvedUrl,
                gcs: data?.gcs || null,
            };
        }

        return null;
    } catch (error) {
        console.warn(
            "[MediaGenerationHandler] Failed to fetch short-lived URL:",
            error?.message || error,
        );
        return null;
    }
}

async function fetchModelMetadata(client) {
    if (
        _metadataCache &&
        Date.now() - _metadataCacheTime < METADATA_CACHE_TTL_MS
    )
        return _metadataCache;
    try {
        const { data } = await client.query({
            query: SYS_MODEL_METADATA,
            fetchPolicy: "no-cache",
        });
        _metadataCache = JSON.parse(data.sys_model_metadata.result);
        _metadataCacheTime = Date.now();
        return _metadataCache;
    } catch (e) {
        console.warn(
            "[MediaGenerationHandler] Failed to fetch model metadata, using hardcoded config:",
            e.message,
        );
        return null;
    }
}

function normalizeInputImageReference(inputImage) {
    if (!inputImage || typeof inputImage === "string") {
        return {
            url: inputImage || "",
            blobPath: null,
            hash: null,
        };
    }

    return {
        url: inputImage.url || "",
        blobPath: inputImage.blobPath || null,
        hash: inputImage.hash || null,
    };
}

async function refreshInputImageUrl(inputImage, contextId, preferGcs = false) {
    const {
        url,
        blobPath: providedBlobPath,
        hash: providedHash,
    } = normalizeInputImageReference(inputImage);

    if (!url || !contextId) {
        return url;
    }

    if (!providedBlobPath && !providedHash) {
        try {
            const parsedUrl = new URL(url);
            if (!isAllowedBlobDomain(parsedUrl.hostname)) {
                return url;
            }
        } catch {
            return url;
        }
    }

    const blobPath = providedBlobPath || extractBlobPathFromUrl(url);
    const hash = providedHash || extractHashFromBlobUrl(url);
    if (!blobPath && !hash) {
        return url;
    }

    try {
        const refreshed = await fetchShortLivedUrl({
            blobPath,
            hash,
            contextId,
        });
        if (!refreshed) {
            return url;
        }
        return preferGcs
            ? refreshed.gcs || refreshed.url || url
            : refreshed.url || refreshed.gcs || url;
    } catch (error) {
        console.warn(
            "[MediaGenerationHandler] Failed to refresh input image URL:",
            error?.message || error,
        );
        return url;
    }
}

async function refreshInputImageUrls(inputImages, userId, preferGcs = false) {
    const fallbackUrls = (inputImages || [])
        .map((inputImage) => normalizeInputImageReference(inputImage).url)
        .filter(Boolean);

    if (!inputImages?.length || !userId) {
        return fallbackUrls;
    }

    try {
        await initializeUserModel();
        const user = await User.findById(userId).select("contextId").lean();
        if (!user?.contextId) {
            return fallbackUrls;
        }

        return Promise.all(
            inputImages.map((url) =>
                refreshInputImageUrl(url, user.contextId, preferGcs),
            ),
        );
    } catch (error) {
        console.warn(
            "[MediaGenerationHandler] Failed to load user context for input image refresh:",
            error?.message || error,
        );
        return fallbackUrls;
    }
}

async function refreshInputVideoUrls(inputVideos, userId, preferGcs = false) {
    const fallbackUrls = (inputVideos || [])
        .map((inputVideo) => normalizeInputImageReference(inputVideo).url)
        .filter(Boolean);

    if (!inputVideos?.length || !userId) {
        return fallbackUrls;
    }

    try {
        await initializeUserModel();
        const user = await User.findById(userId).select("contextId").lean();
        if (!user?.contextId) {
            return fallbackUrls;
        }

        return Promise.all(
            inputVideos.map((inputVideo) =>
                refreshInputImageUrl(inputVideo, user.contextId, preferGcs),
            ),
        );
    } catch (error) {
        console.warn(
            "[MediaGenerationHandler] Failed to load user context for input video refresh:",
            error?.message || error,
        );
        return fallbackUrls;
    }
}

async function refreshInputAudioUrls(inputAudio, userId) {
    const fallbackUrls = (inputAudio || [])
        .map((item) => normalizeInputImageReference(item).url)
        .filter(Boolean);

    if (!inputAudio?.length || !userId) {
        return fallbackUrls;
    }

    try {
        await initializeUserModel();
        const user = await User.findById(userId).select("contextId").lean();
        if (!user?.contextId) {
            return fallbackUrls;
        }

        return Promise.all(
            inputAudio.map((item) =>
                refreshInputImageUrl(item, user.contextId, false),
            ),
        );
    } catch (error) {
        console.warn(
            "[MediaGenerationHandler] Failed to load user context for input audio refresh:",
            error?.message || error,
        );
        return fallbackUrls;
    }
}

// Standard variable builder for all models — maps user settings to media_generate params
function buildMediaVariables(
    model,
    prompt,
    settings,
    inputImages,
    inputImageRoles,
    inputVideos,
    inputAudioUrl,
) {
    return {
        model,
        text: prompt,
        async: true,
        inputImages: inputImages || [],
        inputImageRoles: inputImageRoles || [],
        inputVideos: inputVideos || [],
        aspectRatio: settings.aspectRatio,
        duration: settings.duration,
        outputFormat: settings.outputFormat || settings.output_format,
        outputQuality: settings.outputQuality || settings.output_quality,
        quality: settings.quality, // model render quality preset (low|medium|high|auto)
        negativePrompt: settings.negativePrompt,
        numberResults: settings.numberResults,
        seed: settings.seed,
        optimizePrompt: settings.optimizePrompt,
        generateAudio: settings.generateAudio,
        forceInstrumental:
            settings.forceInstrumental ?? settings.force_instrumental,
        resolution: settings.resolution,
        cameraFixed: settings.cameraFixed,
        imageSize: settings.imageSize || settings.image_size,
        width: settings.width,
        height: settings.height,
        size: settings.size,
        lyrics: settings.lyrics,
        isInstrumental: settings.isInstrumental ?? settings.is_instrumental,
        lyricsOptimizer: settings.lyricsOptimizer ?? settings.lyrics_optimizer,
        audioUrl: settings.audioUrl || settings.audio_url,
        inputAudioUrl:
            inputAudioUrl || settings.inputAudioUrl || settings.input_audio_url,
        audioFormat: settings.audioFormat || settings.audio_format,
        sampleRate: settings.sampleRate || settings.sample_rate,
        bitrate: settings.bitrate,
        voiceName: settings.voiceName,
        speaker1Name: settings.speaker1Name,
        speaker1VoiceName: settings.speaker1VoiceName,
        speaker2Name: settings.speaker2Name,
        speaker2VoiceName: settings.speaker2VoiceName,
        mode: settings.mode,
        language: settings.language,
        speaker: settings.speaker,
        referenceText: settings.referenceText || settings.reference_text,
        styleInstruction:
            settings.styleInstruction || settings.style_instruction,
        voiceDescription:
            settings.voiceDescription || settings.voice_description,
        voice: settings.voice,
        stability: settings.stability,
        similarityBoost: settings.similarityBoost ?? settings.similarity_boost,
        style: settings.style,
        speed: settings.speed,
        previousText: settings.previousText || settings.previous_text,
        nextText: settings.nextText || settings.next_text,
        languageCode: settings.languageCode || settings.language_code,
        voiceId: settings.voiceId || settings.voice_id,
        customVoiceId: settings.customVoiceId || settings.custom_voice_id,
        volume: settings.volume,
        pitch: settings.pitch,
        emotion: settings.emotion,
        channel: settings.channel,
        languageBoost: settings.languageBoost || settings.language_boost,
        subtitleEnable: settings.subtitleEnable ?? settings.subtitle_enable,
        englishNormalization:
            settings.englishNormalization ?? settings.english_normalization,
    };
}

function describeAudioInputRequirement(min, max) {
    if (min === 1 && max === 1) return "exactly one selected audio item";
    if (min === max) return `${min} selected audio items`;
    if (min > 0 && Number.isFinite(max)) {
        return `between ${min} and ${max} selected audio items`;
    }
    if (min > 0) return `at least ${min} selected audio items`;
    return `no more than ${max} selected audio items`;
}

function getInputRequirementRange(requirement) {
    if (Array.isArray(requirement)) {
        return [
            Number(requirement[0] ?? 0) || 0,
            Number(requirement[1] ?? requirement[0] ?? 0),
        ];
    }
    if (requirement === undefined || requirement === null) return null;
    const value = Number(requirement);
    if (!Number.isFinite(value)) return null;
    return [value, value];
}

class MediaGenerationHandler extends BaseTask {
    get displayName() {
        return "Media generation";
    }

    get isRetryable() {
        return true;
    }

    getModelConfig(model, outputType, metadata) {
        const apiModel = metadata?.models?.find((m) => m.modelId === model);
        return {
            query: MEDIA_GENERATE,
            resultKey: "media_generate",
            type: apiModel?.category || outputType,
            buildVariables: (
                prompt,
                settings,
                inputImages,
                inputImageRoles,
                inputVideos,
                inputAudioUrl,
            ) => {
                const sanitizedSettings = sanitizeMediaSettings(settings || {});
                const ms = {
                    ...(apiModel?.mediaDefaults || {}),
                    ...(sanitizedSettings?.models?.[model] || {}),
                };
                return buildMediaVariables(
                    model,
                    prompt,
                    ms,
                    inputImages,
                    inputImageRoles,
                    inputVideos,
                    inputAudioUrl,
                );
            },
        };
    }

    getResultKey() {
        return "media_generate";
    }

    async startRequest(job) {
        const { taskId, metadata, userId } = job.data;
        const { prompt, outputType, model, settings } = metadata;

        metadata.taskId = taskId;
        metadata.userId = userId;

        const inputImageUrls = pickInputImageValues(metadata, "inputImageUrl");
        const hasInputImage = inputImageUrls.some(Boolean);
        const inputAudioUrl = metadata.inputAudioUrl || "";
        const hasInputAudio = Boolean(inputAudioUrl);
        const isImageOnlyAudioGeneration =
            outputType === "audio" && hasInputImage;

        if (!prompt && !isImageOnlyAudioGeneration && !hasInputAudio) {
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
        const apiMetadata = await fetchModelMetadata(job.client);
        const modelMeta = apiMetadata?.models?.find(
            (item) => item.modelId === modelName,
        );
        const config = this.getModelConfig(modelName, outputType, apiMetadata);
        const sanitizedSettings = sanitizeMediaSettings(settings || {});
        metadata.settings = sanitizedSettings;

        const inputImageBlobPaths = pickInputImageValues(
            metadata,
            "inputImageBlobPath",
        );
        const inputImageHashes = pickInputImageValues(
            metadata,
            "inputImageHash",
        );
        const inputImageRoles = pickInputImageValues(
            metadata,
            "inputImageRole",
        );
        const inputImages = inputImageUrls
            .map((url, index) => ({
                url,
                blobPath: inputImageBlobPaths[index],
                hash: inputImageHashes[index],
                role: inputImageRoles[index],
            }))
            .filter((item) => item.url);
        const refreshedInputImageRoles = inputImages.map(
            (inputImage) => inputImage.role || "",
        );
        const preferGcs = modelMeta?.preferredUrlFormat === "gcs";
        const refreshedInputImages = await refreshInputImageUrls(
            inputImages,
            userId,
            preferGcs,
        );
        const inputVideoUrls = pickInputVideoValues(metadata, "inputVideoUrl");
        const inputVideoBlobPaths = pickInputVideoValues(
            metadata,
            "inputVideoBlobPath",
        );
        const inputVideoHashes = pickInputVideoValues(
            metadata,
            "inputVideoHash",
        );
        const inputVideos = inputVideoUrls
            .map((url, index) => ({
                url,
                blobPath: inputVideoBlobPaths[index],
                hash: inputVideoHashes[index],
            }))
            .filter((item) => item.url);
        const refreshedInputVideos = await refreshInputVideoUrls(
            inputVideos,
            userId,
            preferGcs,
        );
        const inputAudio = inputAudioUrl
            ? [
                  {
                      url: inputAudioUrl,
                      blobPath: metadata.inputAudioBlobPath,
                      hash: metadata.inputAudioHash,
                  },
              ]
            : [];
        const audioRequirement =
            modelMeta?.mediaDefaults?.inputAudio ??
            sanitizedSettings?.models?.[modelName]?.inputAudio;
        const audioRequirementRange =
            getInputRequirementRange(audioRequirement);
        if (audioRequirementRange) {
            const [minAudio = 0, maxAudio = Number.POSITIVE_INFINITY] =
                audioRequirementRange;
            if (inputAudio.length < minAudio || inputAudio.length > maxAudio) {
                const displayName = modelMeta?.displayName || modelName;
                const error = new Error(
                    `${displayName} requires ${describeAudioInputRequirement(
                        minAudio,
                        maxAudio,
                    )}`,
                );
                await this.updateMediaItemOnError(
                    metadata,
                    error,
                    "VALIDATION_ERROR",
                );
                throw error;
            }
        }
        const refreshedInputAudioUrls = await refreshInputAudioUrls(
            inputAudio,
            userId,
        );

        const variables = config.buildVariables(
            prompt,
            sanitizedSettings,
            refreshedInputImages,
            refreshedInputImageRoles,
            refreshedInputVideos,
            refreshedInputAudioUrls[0],
        );

        console.log("[MediaGenerationHandler] Submitting media_generate", {
            model: modelName,
            outputType,
            variableKeys: Object.entries(variables)
                .filter(([, value]) => value !== undefined && value !== "")
                .map(([key]) => key),
            inputImagesCount: refreshedInputImages.length,
            inputImageRoles: refreshedInputImageRoles.filter(Boolean),
            inputVideosCount: refreshedInputVideos.length,
            hasInputAudio: Boolean(refreshedInputAudioUrls[0]),
            promptChars: prompt?.length || 0,
        });

        let data;
        for (
            let attempt = 1;
            attempt <= GRAPHQL_SUBMIT_MAX_ATTEMPTS;
            attempt++
        ) {
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
                    error.mediaItemErrorRecorded = true;
                    await this.updateMediaItemOnError(
                        metadata,
                        error,
                        "GRAPHQL_ERROR",
                    );
                    throw error;
                }
                break;
            } catch (error) {
                const retryable =
                    attempt < GRAPHQL_SUBMIT_MAX_ATTEMPTS &&
                    isTransientGraphqlSubmitError(error);
                console.error(`[MediaGenerationHandler] GraphQL error:`, {
                    attempt,
                    maxAttempts: GRAPHQL_SUBMIT_MAX_ATTEMPTS,
                    retryable,
                    errorMessage: error?.message || error?.toString(),
                    errorStack: error?.stack,
                    errorCode: error?.code,
                    errorName: error?.name,
                    model: modelName,
                    prompt: prompt?.substring(0, 100),
                    inputImagesCount: refreshedInputImages.length,
                    metadata: JSON.stringify(metadata).substring(0, 500),
                });

                if (retryable) {
                    await wait(GRAPHQL_SUBMIT_RETRY_DELAY_MS * attempt);
                    continue;
                }

                // Update MediaItem if not already updated
                if (!error?.mediaItemErrorRecorded) {
                    await this.updateMediaItemOnError(
                        metadata,
                        error,
                        "REQUEST_FAILED",
                    );
                }
                throw error;
            }
        }

        const resultKey = this.getResultKey();
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
                    prompt: metadata.displayPrompt || metadata.prompt || "",
                    type: metadata.outputType || "image",
                    model: metadata.model || "",
                    status: "failed",
                    error,
                    settings: metadata.settings,
                    // Only include encrypted input reference fields with values.
                    ...pickInputImageMetadataFields(metadata),
                    ...pickInputVideoMetadataFields(metadata),
                    ...pickInputAudioMetadataFields(metadata),
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

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        const userId = metadata.userId;

        let processedData = null;
        if (userId) {
            processedData = await this.processMediaData(
                dataObject,
                infoObject,
                metadata,
            );

            // Detect empty completion — media generation succeeded on Cortex but
            // no media data was received (e.g. WebSocket dropped during delivery)
            if (
                !processedData?.url &&
                !processedData?.azureUrl &&
                !processedData?.gcsUrl
            ) {
                console.error(
                    "[MediaGenerationHandler] No media URLs in completion data — result was likely lost in transit",
                    { model: metadata.model, prompt: metadata.prompt },
                );
                return {
                    error: "Media generation completed but no media data was received. Please try again.",
                };
            }

            await this.handleMediaGenerationCompletion(
                userId,
                processedData,
                metadata,
                client,
            );
        }

        const result = {
            message: "Media generation completed successfully",
            type: metadata.outputType,
            model: metadata.model,
            prompt: metadata.displayPrompt || metadata.prompt,
            url: processedData?.url,
            azureUrl: processedData?.azureUrl,
            gcsUrl: processedData?.gcsUrl,
            hash: processedData?.hash,
            blobPath: processedData?.blobPath,
        };

        console.log(
            "[MediaGenerationHandler] Returning completion result with hash:",
            result,
        );

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
            // The cortex media_generate router normalizes all responses to URLs
            // (direct URLs or data: URIs). No model-specific parsing needed.
            let mediaUrl = null;

            // dataObject is typically the raw result string from the router
            if (typeof dataObject === "string" && dataObject.length > 0) {
                mediaUrl = dataObject;
            } else if (dataObject?.output) {
                mediaUrl = Array.isArray(dataObject.output)
                    ? dataObject.output[0]
                    : dataObject.output;
            } else if (dataObject?.result?.output) {
                mediaUrl = Array.isArray(dataObject.result.output)
                    ? dataObject.result.output[0]
                    : dataObject.result.output;
            }

            // Upload to cloud storage
            let cloudUrls = null;
            if (mediaUrl && typeof mediaUrl === "string") {
                const routingParams =
                    await this.getUploadRoutingParams(metadata);

                try {
                    console.log(
                        "[MediaGenerationHandler] Uploading media to cloud with routing params:",
                        routingParams,
                    );
                    cloudUrls = await this.uploadMediaToCloud(
                        mediaUrl,
                        routingParams,
                        metadata.displayPrompt || metadata.prompt,
                        getGeneratedMediaTaskSuffix(metadata.taskId),
                    );
                    cloudUrls = await this.moveUploadedMediaToOutputFolder(
                        cloudUrls,
                        routingParams,
                        metadata.outputFolder,
                        process.env.CORTEX_MEDIA_API_URL,
                    );
                    console.log(
                        "[MediaGenerationHandler] Upload completed, cloudUrls:",
                        cloudUrls,
                    );
                } catch (error) {
                    console.error("Failed to upload media to cloud:", error);
                }
            }

            // Determine primary URL — prefer cloud URLs over raw media URL
            const finalUrl =
                cloudUrls?.azureUrl ||
                cloudUrls?.gcsUrl ||
                (mediaUrl && !mediaUrl.startsWith("data:")
                    ? mediaUrl
                    : undefined);

            // Only include URL fields if they have truthy values (CSFLE can't encrypt null/undefined)
            const processedData = {
                ...(finalUrl && { url: finalUrl }),
                ...(cloudUrls?.azureUrl && { azureUrl: cloudUrls.azureUrl }),
                ...(cloudUrls?.gcsUrl && { gcsUrl: cloudUrls.gcsUrl }),
                ...(cloudUrls?.hash && { hash: cloudUrls.hash }),
                ...(cloudUrls?.blobPath && { blobPath: cloudUrls.blobPath }),
            };

            console.log(
                "[MediaGenerationHandler] Processed media data:",
                processedData,
            );

            return processedData;
        } catch (error) {
            console.error("Error processing media data:", error);
            return dataObject;
        }
    }

    /**
     * Compute SHA-256 hash of buffer
     * @param {Buffer} buffer - The buffer to hash
     * @returns {string} - Hex string of hash
     */
    computeHash(buffer) {
        return crypto.createHash("sha256").update(buffer).digest("hex");
    }

    async getUploadRoutingParams(metadata = {}) {
        if (!metadata.userId) {
            return {};
        }

        try {
            await initializeUserModel();
            const user = await User.findById(metadata.userId);
            if (!user?.contextId) {
                return {};
            }

            return buildMediaHelperFileParams({
                storageTarget: createMediaStorageTarget(user.contextId),
            });
        } catch (error) {
            console.error(
                "Error getting user storage routing for media upload:",
                error,
            );
            return {};
        }
    }

    async uploadMediaToCloud(
        mediaUrl,
        routingParams = {},
        prompt = null,
        filenameSuffix = "",
    ) {
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
                    routingParams,
                    prompt,
                    filenameSuffix,
                );
            } else {
                return await this.uploadRegularUrl(
                    mediaUrl,
                    serverUrl,
                    routingParams,
                    prompt,
                    filenameSuffix,
                );
            }
        } catch (error) {
            console.error("Error uploading media to cloud:", error);
            throw error;
        }
    }

    async moveUploadedMediaToOutputFolder(
        cloudUrls,
        routingParams = {},
        outputFolder = "",
        serverUrl = "",
    ) {
        const targetBlobPath = getMediaFolderTargetBlobPath(
            cloudUrls?.blobPath,
            outputFolder,
        );
        if (!targetBlobPath || targetBlobPath === cloudUrls?.blobPath) {
            return cloudUrls;
        }

        const filename = getBlobPathFilename(cloudUrls.blobPath);
        const renameUrl = new URL(serverUrl);
        renameUrl.searchParams.set("rename", "true");
        renameUrl.searchParams.set("blobPath", cloudUrls.blobPath);
        renameUrl.searchParams.set("newFilename", filename);
        renameUrl.searchParams.set("targetBlobPath", targetBlobPath);
        for (const [key, value] of Object.entries(routingParams)) {
            renameUrl.searchParams.set(key, value);
        }

        const response = await fetch(renameUrl.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Move generated media failed: ${response.statusText}. Response body: ${errorBody}`,
            );
        }

        const data = await response.json();
        const movedData = data?.body || data;
        return {
            ...cloudUrls,
            ...(movedData.url && {
                azureUrl: movedData.url,
                url: movedData.url,
            }),
            ...(movedData.gcs && { gcsUrl: movedData.gcs }),
            ...(movedData.gcsUrl && { gcsUrl: movedData.gcsUrl }),
            blobPath: movedData.blobPath || movedData.name || targetBlobPath,
        };
    }

    async uploadBase64Data(
        mediaUrl,
        serverUrl,
        routingParams = {},
        prompt = null,
        filenameSuffix = "",
    ) {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();

        // Convert blob to buffer to compute hash
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const hash = this.computeHash(buffer);

        console.log(
            "[MediaGenerationHandler] Computed hash for base64 data:",
            hash,
        );

        const formData = new FormData();
        const mimeType = mediaUrl.split(";")[0].split(":")[1];
        const extension = mimeType.split("/")[1] || "bin";
        const filename = getGeneratedMediaFilename(prompt, extension, {
            uniqueSuffix: filenameSuffix || hash,
        });

        // CFH reads multipart fields before the file stream starts,
        // so routing metadata and hash must come first.
        formData.append("hash", hash);
        for (const [key, value] of Object.entries(routingParams)) {
            formData.append(key, value);
        }
        formData.append("file", blob, filename);

        const uploadUrl = new URL(serverUrl);
        for (const [key, value] of Object.entries(routingParams)) {
            uploadUrl.searchParams.set(key, value);
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

        // Include the hash we computed
        validatedUrls.hash = hash;

        return validatedUrls;
    }

    async uploadBufferData(
        buffer,
        serverUrl,
        routingParams = {},
        prompt = null,
        extension = "bin",
        hash = null,
        contentType = "application/octet-stream",
        filenameSuffix = "",
    ) {
        const mediaHash = hash || this.computeHash(buffer);
        const filename = getGeneratedMediaFilename(prompt, extension, {
            uniqueSuffix: filenameSuffix || mediaHash,
        });
        const blob = new Blob([buffer], { type: contentType });
        const formData = new FormData();

        // CFH reads multipart fields before the file stream starts,
        // so routing metadata and hash must come first.
        formData.append("hash", mediaHash);
        for (const [key, value] of Object.entries(routingParams)) {
            formData.append(key, value);
        }
        formData.append("file", blob, filename);

        const uploadUrl = new URL(serverUrl);
        for (const [key, value] of Object.entries(routingParams)) {
            uploadUrl.searchParams.set(key, value);
        }

        const uploadResponse = await fetch(uploadUrl.toString(), {
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
        const validatedUrls = this.validateCloudUrls(data);
        validatedUrls.hash = mediaHash;

        return validatedUrls;
    }

    async uploadRegularUrl(
        mediaUrl,
        serverUrl,
        routingParams = {},
        prompt = null,
        filenameSuffix = "",
    ) {
        // First, fetch the media to compute its hash
        const mediaResponse = await fetch(mediaUrl);
        if (!mediaResponse.ok) {
            throw new Error(
                `Failed to fetch media from URL: ${mediaResponse.statusText}`,
            );
        }

        const arrayBuffer = await mediaResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const hash = this.computeHash(buffer);
        const contentType =
            mediaResponse.headers.get("content-type") ||
            "application/octet-stream";
        const extension =
            getExtensionFromUrl(mediaUrl) ||
            getExtensionFromContentType(contentType) ||
            "mp4";

        console.log(
            "[MediaGenerationHandler] Computed hash for URL media:",
            hash,
        );

        // Now upload via the API
        const url = new URL(serverUrl);
        url.searchParams.set("fetch", mediaUrl);
        for (const [key, value] of Object.entries(routingParams)) {
            url.searchParams.set(key, value);
        }

        // Add hash to query params
        url.searchParams.set("hash", hash);

        // Pass descriptive filename derived from prompt
        if (prompt) {
            url.searchParams.set(
                "filename",
                getGeneratedMediaFilename(prompt, extension, {
                    uniqueSuffix: filenameSuffix || hash,
                }),
            );
        }

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.warn(
                `[MediaGenerationHandler] Remote fetch upload failed, falling back to multipart upload: ${response.status} ${errorBody}`,
            );
            return this.uploadBufferData(
                buffer,
                serverUrl,
                routingParams,
                prompt,
                extension,
                hash,
                contentType,
                filenameSuffix,
            );
        }

        const data = await response.json();
        const validatedUrls = this.validateCloudUrls(data);

        // Include the hash we computed
        validatedUrls.hash = hash;

        return validatedUrls;
    }

    validateCloudUrls(data) {
        // Handle nested body structure from some API responses
        const responseData = data.body || data;

        console.log(
            "[MediaGenerationHandler] Validating cloud URLs from response:",
            JSON.stringify(responseData),
        );

        const azureUrl = responseData.url;
        const gcsUrl = responseData.gcs || responseData.gcsUrl;
        const hash = responseData.hash;
        const blobPath =
            responseData.blobPath ||
            responseData.name ||
            extractBlobPathFromUrl(azureUrl) ||
            extractBlobPathFromUrl(gcsUrl);

        console.log("[MediaGenerationHandler] Extracted values:", {
            azureUrl,
            gcsUrl,
            hash,
            blobPath,
        });

        let azureHostname;
        let azurePort;
        if (typeof azureUrl === "string") {
            try {
                const parsedAzureUrl = new URL(azureUrl);
                azureHostname = parsedAzureUrl.hostname;
                azurePort = parsedAzureUrl.port;
            } catch (e) {
                // Invalid URL format; leave hostname/port undefined
            }
        }

        const hasAzureUrl =
            typeof azureUrl === "string" &&
            !!azureHostname &&
            // Standard Azure Blob Storage hostname: <account>.blob.core.windows.net
            ((azureHostname.endsWith(".blob.core.windows.net") &&
                // Ensure there is a non-empty account name before the suffix,
                // and that it is a single DNS label (no additional dots).
                azureHostname.slice(0, -".blob.core.windows.net".length)
                    .length > 0 &&
                !azureHostname
                    .slice(0, -".blob.core.windows.net".length)
                    .includes(".")) ||
                // Azurite local by IP
                (azureHostname === "127.0.0.1" && azurePort === "10000") ||
                // Azurite local by hostname
                (azureHostname === "localhost" && azurePort === "10000"));
        const hasGcsUrl =
            gcsUrl && typeof gcsUrl === "string" && gcsUrl.length > 0;

        // Require at least one valid URL (Azure OR GCS)
        if (!hasAzureUrl && !hasGcsUrl) {
            console.error(
                "[MediaGenerationHandler] Missing storage URLs. Response data:",
                JSON.stringify(responseData),
            );
            throw new Error(
                "Media file upload failed: Missing required storage URLs",
            );
        }

        const result = {
            ...(azureUrl && { azureUrl }),
            ...(gcsUrl && { gcsUrl }),
            ...(hash && { hash }),
            ...(blobPath && { blobPath }),
        };

        console.log("[MediaGenerationHandler] Returning cloud URLs:", result);

        return result;
    }

    async getInheritedTags(userId, inputImageUrls, inputTags = []) {
        // Use tags passed from the frontend instead of querying encrypted URL fields
        if (inputTags && inputTags.length > 0) {
            return mergeMediaTags(inputTags);
        }

        // Fallback: return empty array if no tags provided
        return [];
    }

    async getPromptTags(client, prompt) {
        const text = String(prompt || "").trim();
        if (!client || !text) {
            return [];
        }

        try {
            const { data } = await client.query({
                query: MEDIA_PROMPT_TAGS,
                variables: { text },
                fetchPolicy: "no-cache",
            });
            return parseMediaPromptTagsResult(data?.media_prompt_tags?.result);
        } catch (error) {
            console.warn(
                "[MediaGenerationHandler] Failed to auto-tag media prompt:",
                error?.message || error,
            );
            return [];
        }
    }

    async retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(
                    `[MediaGenerationHandler] DB operation attempt ${attempt}/${maxRetries} failed: ${error.message}`,
                );

                if (
                    error.name === "MongoNotConnectedError" ||
                    (error.message &&
                        (error.message.includes("not connected") ||
                            error.message.includes("must be connected") ||
                            error.message.includes("disconnected")))
                ) {
                    console.log(
                        "[MediaGenerationHandler] MongoDB connection issue, attempting to reconnect...",
                    );
                    try {
                        const mongoose = (await import("mongoose")).default;
                        if (mongoose.connection.readyState !== 1) {
                            if (mongoose.connection.readyState !== 0) {
                                await mongoose.connection
                                    .close()
                                    .catch(() => {});
                            }
                            const { connectToDatabase } = await import(
                                "../../src/db.mjs"
                            );
                            await connectToDatabase();
                            console.log(
                                "[MediaGenerationHandler] Successfully reconnected to MongoDB",
                            );
                        }
                    } catch (reconnectError) {
                        console.error(
                            "[MediaGenerationHandler] Failed to reconnect:",
                            reconnectError.message,
                        );
                    }
                }

                if (attempt < maxRetries) {
                    const currentRetryDelay = retryDelay;
                    await new Promise((resolve) =>
                        setTimeout(resolve, currentRetryDelay),
                    );
                    retryDelay *= 2;
                }
            }
        }
        throw lastError;
    }

    async handleMediaGenerationCompletion(
        userId,
        dataObject,
        metadata,
        client,
    ) {
        try {
            const inputImageMetadataFields =
                pickInputImageMetadataFields(metadata);
            const inputVideoMetadataFields =
                pickInputVideoMetadataFields(metadata);
            const inputAudioMetadataFields =
                pickInputAudioMetadataFields(metadata);
            const completedAt = Math.floor(Date.now() / 1000);

            const coreUpdateData = {
                status: "completed",
                completed: completedAt,
                ...(dataObject.url && { url: dataObject.url }),
                ...(dataObject.azureUrl && { azureUrl: dataObject.azureUrl }),
                ...(dataObject.gcsUrl && { gcsUrl: dataObject.gcsUrl }),
                ...(dataObject.hash && { hash: dataObject.hash }),
                ...(dataObject.blobPath && { blobPath: dataObject.blobPath }),
                ...(metadata.outputFolder && {
                    outputFolder: metadata.outputFolder,
                }),
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

            console.log(
                "[MediaGenerationHandler] Updating media item with completed output:",
                {
                    userId,
                    taskId: metadata.taskId,
                    updateData: coreUpdateData,
                },
            );

            let mediaItem = await this.retryDbOperation(() =>
                MediaItem.findOneAndUpdate(
                    { user: userId, taskId: metadata.taskId },
                    coreUpdateData,
                    { new: true, runValidators: true },
                ),
            );

            if (!mediaItem) {
                mediaItem = new MediaItem({
                    user: userId,
                    taskId: metadata.taskId,
                    cortexRequestId: metadata.taskId,
                    prompt: metadata.displayPrompt || metadata.prompt || "",
                    type: metadata.outputType || "image",
                    model: metadata.model || "",
                    ...coreUpdateData,
                    ...inputImageMetadataFields,
                    ...inputVideoMetadataFields,
                    ...inputAudioMetadataFields,
                    settings: metadata.settings,
                });
                await this.retryDbOperation(() => mediaItem.save());
            }

            console.log(
                "[MediaGenerationHandler] Media item output updated:",
                mediaItem
                    ? {
                          _id: mediaItem._id,
                          hash: mediaItem.hash,
                          blobPath: mediaItem.blobPath,
                          tags: mediaItem.tags,
                          url: mediaItem.url,
                          azureUrl: mediaItem.azureUrl,
                          gcsUrl: mediaItem.gcsUrl,
                      }
                    : "NOT FOUND",
            );

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
            const promptTags = await this.getPromptTags(
                client,
                metadata.prompt || metadata.displayPrompt,
            );
            const existingMediaItem = mediaItem;
            const tags = mergeMediaTags(
                existingMediaItem?.tags,
                inheritedTags,
                promptTags,
            );

            const taggedMediaItem = await this.retryDbOperation(() =>
                MediaItem.findOneAndUpdate(
                    { user: userId, taskId: metadata.taskId },
                    { tags },
                    { new: true, runValidators: true },
                ),
            );

            console.log(
                "[MediaGenerationHandler] Media item tags updated:",
                taggedMediaItem
                    ? {
                          _id: taggedMediaItem._id,
                          hash: taggedMediaItem.hash,
                          blobPath: taggedMediaItem.blobPath,
                          tags: taggedMediaItem.tags,
                      }
                    : "NOT FOUND",
            );
        } catch (error) {
            console.error("Error updating media item:", error);
            throw error;
        }
    }
}

const mediaGenerationHandler = new MediaGenerationHandler();
export default mediaGenerationHandler;
