import { NextResponse } from "next/server";
import { getClient } from "../../../../src/graphql";
import AppletFile from "../../models/applet-file.js";
import File from "../../models/file.js";
import Task from "../../models/task.mjs";
import { isYoutubeUrl } from "../../../../src/utils/urlUtils.js";
import { createAppletUserStorageTarget } from "../../../../src/utils/storageTargets.js";
import { sanitizeMediaSettings } from "../../../../src/utils/mediaGenerationSettings.js";
import { getCurrentUser } from "../../utils/auth.js";
import { resolveAndHealFile } from "../../utils/file-resolution-utils.js";
import {
    PUBLIC_MEDIA_URL_ERROR,
    validatePublicMediaUrl,
} from "../../utils/publicMediaUrlValidation.js";
import { createBackgroundTask } from "../../utils/tasks";
import {
    assertTranscribeModelOptionEnabled,
    getConfiguredTranscribeModelOption,
    getTranscribeDefaultModelOption,
    getTranscribeTaskTimeout,
    normalizeTranscribeTaskMetadata,
} from "../../utils/transcribe-model-options.js";
import { validateAppletAccess } from "../access.js";
import {
    fetchAppletMediaModelMetadata,
    findAllowedModel,
} from "../model-utils.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

const TRANSCRIBE_RESPONSE_FORMATS = new Set(["", "vtt", "formatted"]);
const SUBTITLE_FORMATS = new Set(["srt", "vtt"]);
const MEDIA_MODEL_CATEGORIES = new Set([
    "image",
    "video",
    "audio",
    "tts",
    "upscaling",
]);
const MEDIA_SETTING_FIELDS = [
    "aspectRatio",
    "duration",
    "outputFormat",
    "outputQuality",
    "quality",
    "negativePrompt",
    "negative_prompt",
    "numberResults",
    "seed",
    "optimizePrompt",
    "generateAudio",
    "forceInstrumental",
    "processingType",
    "scene",
    "targetResolution",
    "targetFps",
    "enhanceModel",
    "upscaleFactor",
    "subjectDetection",
    "faceEnhancement",
    "faceEnhancementCreativity",
    "faceEnhancementStrength",
    "cutFirstSecond",
    "noOp",
    "resolution",
    "cameraFixed",
    "image_size",
    "imageSize",
    "width",
    "height",
    "size",
    "lyrics",
    "isInstrumental",
    "lyricsOptimizer",
    "audioUrl",
    "inputAudioUrl",
    "audioFormat",
    "sampleRate",
    "bitrate",
    "voiceName",
    "speaker1Name",
    "speaker1VoiceName",
    "speaker2Name",
    "speaker2VoiceName",
    "mode",
    "language",
    "speaker",
    "referenceText",
    "styleInstruction",
    "voiceDescription",
    "voice",
    "voiceScript",
    "voiceLanguage",
    "voicePrompt",
    "videoPrompt",
    "strengthNegativePrompt",
    "disableSafetyFilter",
    "disablePromptUpsampling",
    "stability",
    "similarityBoost",
    "style",
    "speed",
    "previousText",
    "nextText",
    "languageCode",
    "voiceId",
    "customVoiceId",
    "volume",
    "pitch",
    "emotion",
    "channel",
    "languageBoost",
    "subtitleEnable",
    "englishNormalization",
];
const MODEL_OPTION_ERROR =
    "modelOption must be one of: Whisper, NeuralSpace, Gemini, MAI-Transcribe-1.5, xAI, xAI + Gemini";
const MAX_PUBLIC_MEDIA_URL_LENGTH = 4096;
const MAX_SUBTITLE_TEXT_LENGTH = 250000;
const MAX_MEDIA_PROMPT_LENGTH = 50000;
const MAX_LANGUAGE_LENGTH = 64;
const MAX_TRACK_NAME_LENGTH = 120;
const MAX_SUBTITLE_NAME_LENGTH = 120;
const MAX_OUTPUT_FOLDER_LENGTH = 512;
const MAX_LINE_COUNT = 50;
const MAX_LINE_WIDTH = 200;
const MAX_WORDS_PER_LINE = 50;
const MAX_INPUT_IMAGE_REFERENCES = 14;
const MAX_INPUT_VIDEO_REFERENCES = 1;
const ACTIVE_MEDIA_TASK_STATUSES = ["pending", "in_progress"];

function validationError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function assertMaxLength(value, name, maxLength) {
    if (maxLength && value.length > maxLength) {
        throw validationError(
            `${name} must be ${maxLength} characters or less`,
        );
    }
}

function getOptionalString(body, key, options = {}) {
    const value = body[key];
    if (value == null) return undefined;
    if (typeof value !== "string") {
        throw validationError(`${key} must be a string`);
    }
    assertMaxLength(value, key, options.maxLength);
    return value;
}

function getOptionalPlainObject(body, key) {
    const value = body[key];
    if (value == null) return undefined;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw validationError(`${key} must be an object`);
    }
    return value;
}

function requireString(value, name, options = {}) {
    if (!value || typeof value !== "string") {
        throw validationError(`${name} is required`);
    }
    assertMaxLength(value, name, options.maxLength);
    return value;
}

function normalizeOutputFolder(value) {
    if (value == null || value === "") return undefined;
    if (typeof value !== "string") {
        throw validationError("outputFolder must be a string");
    }
    assertMaxLength(value, "outputFolder", MAX_OUTPUT_FOLDER_LENGTH * 2);
    const normalized = value
        .trim()
        .split("\\")
        .join("/")
        .split("/")
        .filter(Boolean)
        .join("/");
    assertMaxLength(normalized, "outputFolder", MAX_OUTPUT_FOLDER_LENGTH);
    return normalized || undefined;
}

function normalizeMediaOutputType(value) {
    if (value == null || value === "") return null;
    if (typeof value !== "string") {
        throw validationError("outputType must be a string");
    }
    const normalized =
        value === "music" || value === "speech" ? "audio" : value;
    if (!["image", "video", "audio"].includes(normalized)) {
        throw validationError("outputType must be one of: image, video, audio");
    }
    return normalized;
}

function mediaOutputTypeForCategory(category, model = null) {
    if (category === "tts") return "audio";
    if (category === "upscaling") {
        return model?.mediaDefaults?.inputImages ? "image" : "video";
    }
    return category;
}

function getOptionalPositiveInteger(body, key, maxValue) {
    const value = body[key];
    if (value == null || value === "") return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw validationError(`${key} must be a positive integer`);
    }
    if (maxValue && number > maxValue) {
        throw validationError(`${key} must be ${maxValue} or less`);
    }
    return number;
}

function normalizeTranscribeResponseFormat(value) {
    if (value == null) return "vtt";
    if (value === "text" || value === "plain" || value === "plain_text") {
        return "";
    }
    if (typeof value !== "string" || !TRANSCRIBE_RESPONSE_FORMATS.has(value)) {
        throw validationError(
            "responseFormat must be one of: vtt, formatted, text",
        );
    }
    return value;
}

function normalizeSubtitleFormat(value) {
    const format = value == null || value === "" ? "srt" : value;
    if (typeof format !== "string" || !SUBTITLE_FORMATS.has(format)) {
        throw validationError("format must be one of: srt, vtt");
    }
    return format;
}

async function requirePublicMediaUrl(url) {
    const result = await validatePublicMediaUrl(url);
    if (!result.ok) {
        throw validationError(PUBLIC_MEDIA_URL_ERROR);
    }
    return result.url;
}

function getRequestOrigins(request) {
    const origins = new Set();

    try {
        origins.add(new URL(request.url).origin);
    } catch {
        // ignore malformed internal request URLs
    }

    const forwardedHost = request.headers?.get?.("x-forwarded-host");
    const host = forwardedHost || request.headers?.get?.("host");
    if (host) {
        const requestProtocol = new URL(request.url).protocol;
        const proto =
            request.headers?.get?.("x-forwarded-proto") ||
            requestProtocol.slice(0, -1);
        origins.add(
            `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`,
        );
    }

    return origins;
}

function getAppletFileRef(body, request, appletId) {
    if (body.fileId != null) {
        if (typeof body.fileId !== "string" || !body.fileId.trim()) {
            throw validationError("fileId must be a non-empty string");
        }
        return body.fileId.trim();
    }

    if (!body.url || typeof body.url !== "string") return null;

    let parsed;
    try {
        parsed = new URL(body.url, request.url);
    } catch {
        return null;
    }

    if (!getRequestOrigins(request).has(parsed.origin)) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
        parts.length !== 6 ||
        parts[0] !== "api" ||
        parts[1] !== "canvas-applets" ||
        parts[3] !== "files" ||
        parts[5] !== "content"
    ) {
        return null;
    }
    if (parts[2] !== appletId) {
        throw validationError("file URL must belong to this applet");
    }
    if (parsed.searchParams.get("scope") === "shared") {
        throw validationError("shared applet files are not supported here");
    }
    try {
        return decodeURIComponent(parts[4]);
    } catch {
        throw validationError("file URL contains an invalid file ID");
    }
}

async function resolveAppletFileMediaUrl(fileId, { appletId, user }) {
    const fileStore = await AppletFile.findOne({
        appletId,
        userId: user._id,
    }).populate("files");
    const file = fileStore?.files?.find((candidate) => {
        const id = candidate?._id?.toString?.() || String(candidate?._id || "");
        return id === fileId;
    });

    if (!file) {
        throw validationError("file not found");
    }

    const storageTarget = createAppletUserStorageTarget(
        user.contextId,
        appletId,
    );
    const resolved = await resolveAndHealFile(file, {
        storageTarget,
        allowUrlRefresh: false,
        persistResolvedFile: async (updateFields) => {
            await File.findByIdAndUpdate(file._id, updateFields);
        },
    });

    if (!resolved?.accessUrl) {
        throw validationError("failed to resolve file from storage");
    }

    return requirePublicMediaUrl(resolved.accessUrl);
}

async function resolveTranscribeMediaUrl(body, { request, appletId, user }) {
    const fileId = getAppletFileRef(body, request, appletId);
    if (fileId) {
        return {
            url: await resolveAppletFileMediaUrl(fileId, { appletId, user }),
            enforcePublicUrl: false,
        };
    }

    const url = await requirePublicMediaUrl(
        requireString(body.url, "url", {
            maxLength: MAX_PUBLIC_MEDIA_URL_LENGTH,
        }),
    );
    return {
        url,
        enforcePublicUrl: !isYoutubeUrl(url),
    };
}

async function resolveMediaReferenceUrl(
    reference,
    { request, appletId, user },
) {
    const body =
        typeof reference === "string" ? { url: reference } : reference || {};

    if (body.fileId) {
        return {
            url: await resolveAppletFileMediaUrl(
                requireString(body.fileId, "fileId"),
                { appletId, user },
            ),
            enforcePublicUrl: false,
        };
    }

    const rawUrl = body.url || body.azureUrl || body.gcsUrl;
    if (!rawUrl || typeof rawUrl !== "string") {
        throw validationError("media reference url or fileId is required");
    }
    if (body.gcsUrl === rawUrl && rawUrl.startsWith("gs://")) {
        return {
            url: rawUrl,
            enforcePublicUrl: false,
        };
    }

    const appletFileId = getAppletFileRef({ url: rawUrl }, request, appletId);
    if (appletFileId) {
        return {
            url: await resolveAppletFileMediaUrl(appletFileId, {
                appletId,
                user,
            }),
            enforcePublicUrl: false,
        };
    }

    return {
        url: await requirePublicMediaUrl(
            requireString(rawUrl, "url", {
                maxLength: MAX_PUBLIC_MEDIA_URL_LENGTH,
            }),
        ),
        enforcePublicUrl: true,
    };
}

function asReferenceArray(body, arrayKey, flatPrefix, maxCount) {
    const references = [];
    const arrayValue = body[arrayKey];
    if (arrayValue != null) {
        if (!Array.isArray(arrayValue)) {
            throw validationError(`${arrayKey} must be an array`);
        }
        references.push(...arrayValue);
    }

    for (let index = 0; index < maxCount; index += 1) {
        const suffix = index === 0 ? "" : String(index + 1);
        const urlKey = `${flatPrefix}Url${suffix}`;
        if (body[urlKey]) {
            references.push({
                url: body[urlKey],
                role: body[`${flatPrefix}Role${suffix}`],
                blobPath: body[`${flatPrefix}BlobPath${suffix}`],
                hash: body[`${flatPrefix}Hash${suffix}`],
            });
        }
    }

    return references.slice(0, maxCount);
}

function getReferenceFieldName(base, index) {
    return index === 0 ? base : `${base}${index + 1}`;
}

function copyReferenceMetadata(target, reference, index, prefix) {
    const role =
        reference.role || reference.inputImageRole || reference.inputVideoRole;
    const blobPath =
        reference.blobPath ||
        reference[`${prefix}BlobPath`] ||
        reference.inputImageBlobPath ||
        reference.inputVideoBlobPath;
    const hash =
        reference.hash ||
        reference[`${prefix}Hash`] ||
        reference.inputImageHash ||
        reference.inputVideoHash;

    if (role) target[getReferenceFieldName(`${prefix}Role`, index)] = role;
    if (blobPath)
        target[getReferenceFieldName(`${prefix}BlobPath`, index)] = blobPath;
    if (hash) target[getReferenceFieldName(`${prefix}Hash`, index)] = hash;
}

async function addResolvedReferences(
    metadata,
    references,
    { request, appletId, user, prefix, maxCount },
) {
    for (
        let index = 0;
        index < Math.min(references.length, maxCount);
        index += 1
    ) {
        const reference =
            typeof references[index] === "string"
                ? { url: references[index] }
                : references[index] || {};
        const resolved = await resolveMediaReferenceUrl(reference, {
            request,
            appletId,
            user,
        });
        metadata[getReferenceFieldName(`${prefix}Url`, index)] = resolved.url;
        copyReferenceMetadata(metadata, reference, index, prefix);
    }
}

function getInputAudioReference(body) {
    if (body.inputAudio) return body.inputAudio;
    if (body.inputAudioUrl || body.inputAudioFileId) {
        return {
            url: body.inputAudioUrl,
            fileId: body.inputAudioFileId,
            blobPath: body.inputAudioBlobPath,
            hash: body.inputAudioHash,
        };
    }
    return null;
}

function getTopLevelMediaSettings(body) {
    const settings = {};
    for (const field of MEDIA_SETTING_FIELDS) {
        if (body[field] !== undefined) settings[field] = body[field];
    }
    return settings;
}

function buildMediaGenerationSettings(body, model) {
    const settings = {
        ...(getOptionalPlainObject(body, "settings") || {}),
    };
    const existingModels =
        settings.models &&
        typeof settings.models === "object" &&
        !Array.isArray(settings.models)
            ? settings.models
            : {};
    const modelSettings = {
        ...(existingModels[model] || {}),
        ...(getOptionalPlainObject(body, "modelSettings") || {}),
        ...getTopLevelMediaSettings(body),
    };

    if (Object.keys(modelSettings).length > 0) {
        settings.models = {
            ...existingModels,
            [model]: modelSettings,
        };
    }

    return sanitizeMediaSettings(settings);
}

function resolveRequestedMediaKind(body) {
    const rawKind = body.mediaKind || body.category || body.outputKind;
    if (!rawKind) return null;
    if (typeof rawKind !== "string" || !MEDIA_MODEL_CATEGORIES.has(rawKind)) {
        throw validationError(
            "mediaKind must be one of: image, video, audio, tts, upscaling",
        );
    }
    return rawKind;
}

function pickDefaultMediaModel(models, { outputType, mediaKind }) {
    const targetCategory = mediaKind || outputType || "image";
    return (
        models.find(
            (model) => model.category === targetCategory && model.isDefault,
        ) ||
        models.find((model) => model.category === targetCategory) ||
        models.find(
            (model) =>
                mediaOutputTypeForCategory(model.category, model) ===
                outputType,
        ) ||
        models.find((model) => model.isDefault) ||
        models[0]
    );
}

async function resolveMediaGenerationModel(body) {
    const metadata = await fetchAppletMediaModelMetadata(getClient());
    const models = metadata.models || [];
    const requestedOutputType = normalizeMediaOutputType(body.outputType);
    const mediaKind = resolveRequestedMediaKind(body);
    const requestedModel = getOptionalString(body, "model", {
        maxLength: MAX_LANGUAGE_LENGTH,
    });
    const model = requestedModel
        ? findAllowedModel(metadata, requestedModel)
        : pickDefaultMediaModel(models, {
              outputType: requestedOutputType,
              mediaKind,
          });

    if (requestedModel && !model) {
        throw validationError("model must be an available media model");
    }
    if (!model) {
        throw validationError("No media generation model is available");
    }

    const outputType =
        requestedOutputType ||
        mediaOutputTypeForCategory(model.category, model);
    if (outputType !== mediaOutputTypeForCategory(model.category, model)) {
        throw validationError(
            `model category ${model.category} cannot generate ${outputType}`,
        );
    }

    return { model, outputType };
}

async function buildMediaGenerationTask(body, context) {
    const { model, outputType } = await resolveMediaGenerationModel(body);
    const prompt = getOptionalString(body, "prompt", {
        maxLength: MAX_MEDIA_PROMPT_LENGTH,
    });
    const displayPrompt = getOptionalString(body, "displayPrompt", {
        maxLength: MAX_MEDIA_PROMPT_LENGTH,
    });
    const inputImages = asReferenceArray(
        body,
        "inputImages",
        "inputImage",
        MAX_INPUT_IMAGE_REFERENCES,
    );
    const inputVideos = asReferenceArray(
        body,
        "inputVideos",
        "inputVideo",
        MAX_INPUT_VIDEO_REFERENCES,
    );
    const inputAudio = getInputAudioReference(body);

    if (
        !prompt &&
        inputImages.length === 0 &&
        inputVideos.length === 0 &&
        !inputAudio
    ) {
        throw validationError("prompt or an input reference is required");
    }

    const settings = buildMediaGenerationSettings(body, model.modelId);
    const outputFolder = normalizeOutputFolder(body.outputFolder);
    const metadata = {
        prompt: prompt || "",
        ...(displayPrompt && { displayPrompt }),
        outputType,
        model: model.modelId,
        settings,
        skipUserState: true,
        ...(outputFolder && { outputFolder }),
    };

    if (Array.isArray(body.inputTags)) {
        metadata.inputTags = body.inputTags
            .filter((tag) => typeof tag === "string" && tag.trim())
            .slice(0, 50);
    }

    await addResolvedReferences(metadata, inputImages, {
        ...context,
        prefix: "inputImage",
        maxCount: MAX_INPUT_IMAGE_REFERENCES,
    });
    await addResolvedReferences(metadata, inputVideos, {
        ...context,
        prefix: "inputVideo",
        maxCount: MAX_INPUT_VIDEO_REFERENCES,
    });
    if (inputAudio) {
        const resolved = await resolveMediaReferenceUrl(inputAudio, context);
        metadata.inputAudioUrl = resolved.url;
        if (inputAudio.blobPath || inputAudio.inputAudioBlobPath) {
            metadata.inputAudioBlobPath =
                inputAudio.blobPath || inputAudio.inputAudioBlobPath;
        }
        if (inputAudio.hash || inputAudio.inputAudioHash) {
            metadata.inputAudioHash =
                inputAudio.hash || inputAudio.inputAudioHash;
        }
    }

    return {
        type: "media-generation",
        metadata,
    };
}

function resolveTranscribeModelOption(body, url) {
    const modelOption = getOptionalString(body, "modelOption", {
        maxLength: MAX_LANGUAGE_LENGTH,
    });
    const requested = modelOption;
    if (
        (body.wordTimestamped === true || body.highlightWords === true) &&
        !isYoutubeUrl(url)
    ) {
        const wordTimestampModel =
            getConfiguredTranscribeModelOption("xAI + Gemini");
        const requestedModel = requested
            ? getConfiguredTranscribeModelOption(requested)
            : null;
        if (wordTimestampModel && (!requested || requestedModel === "Gemini")) {
            return wordTimestampModel;
        }
    }

    if (requested) {
        try {
            assertTranscribeModelOptionEnabled(requested);
        } catch (error) {
            throw validationError(error.message);
        }
        const configured = getConfiguredTranscribeModelOption(requested);
        if (!configured) {
            throw validationError(MODEL_OPTION_ERROR);
        }
        return configured;
    }

    const resolved = isYoutubeUrl(url)
        ? "Gemini"
        : getConfiguredTranscribeModelOption("xAI + Gemini") ||
          getTranscribeDefaultModelOption();
    try {
        assertTranscribeModelOptionEnabled(resolved);
    } catch (error) {
        throw validationError(error.message);
    }
    return resolved;
}

async function buildTranscribeTask(body, { request, appletId, user }) {
    const media = await resolveTranscribeMediaUrl(body, {
        request,
        appletId,
        user,
    });
    const { url } = media;

    const highlightWords = body.highlightWords === true;
    const metadata = normalizeTranscribeTaskMetadata({
        url,
        language:
            getOptionalString(body, "language", {
                maxLength: MAX_LANGUAGE_LENGTH,
            }) || "",
        wordTimestamped: body.wordTimestamped === true || highlightWords,
        responseFormat: normalizeTranscribeResponseFormat(body.responseFormat),
        maxLineCount: highlightWords
            ? undefined
            : getOptionalPositiveInteger(body, "maxLineCount", MAX_LINE_COUNT),
        maxLineWidth: highlightWords
            ? undefined
            : getOptionalPositiveInteger(body, "maxLineWidth", MAX_LINE_WIDTH),
        maxWordsPerLine: highlightWords
            ? undefined
            : getOptionalPositiveInteger(
                  body,
                  "maxWordsPerLine",
                  MAX_WORDS_PER_LINE,
              ),
        highlightWords,
        modelOption: resolveTranscribeModelOption(body, url),
        trackName: getOptionalString(body, "trackName", {
            maxLength: MAX_TRACK_NAME_LENGTH,
        }),
        isAlternative: body.isAlternative === true,
        isYoutube: isYoutubeUrl(url),
        contextId: user.contextId,
        enforcePublicUrl: media.enforcePublicUrl,
        skipUserState: true,
    });

    return {
        type: "transcribe",
        metadata,
        timeout: getTranscribeTaskTimeout(metadata.modelOption),
    };
}

function buildSubtitleTranslateTask(body) {
    const text = requireString(body.text, "text", {
        maxLength: MAX_SUBTITLE_TEXT_LENGTH,
    });
    const to = requireString(body.to, "to", {
        maxLength: MAX_LANGUAGE_LENGTH,
    });
    const format = normalizeSubtitleFormat(body.format);
    const name =
        getOptionalString(body, "name", {
            maxLength: MAX_SUBTITLE_NAME_LENGTH,
        }) || `${to} Subtitle Translation`;

    return {
        type: "subtitle-translate",
        metadata: {
            text,
            to,
            format,
            name,
            skipUserState: true,
        },
    };
}

async function buildTask(body, context) {
    switch (body.operation) {
        case "transcribe":
            return buildTranscribeTask(body, context);
        case "translate-subtitles":
            return buildSubtitleTranslateTask(body);
        case "create-media":
        case "create":
        case "generate":
            return buildMediaGenerationTask(body, context);
        default:
            throw validationError(
                "operation must be one of: transcribe, translate-subtitles, create-media",
            );
    }
}

function resolveTaskApi(operation) {
    switch (operation) {
        case "transcribe":
            return "media.transcribe";
        case "translate-subtitles":
            return "media.translateSubtitles";
        case "create-media":
        case "create":
        case "generate":
            return "media.create";
        default:
            throw validationError(
                "operation must be one of: transcribe, translate-subtitles, create-media",
            );
    }
}

async function getActiveMediaTaskLimitResponse({ appletId, userId }) {
    const activeCount = await Task.countDocuments({
        owner: userId,
        type: { $in: ["transcribe", "subtitle-translate", "media-generation"] },
        status: { $in: ACTIVE_MEDIA_TASK_STATUSES },
        "invokedFrom.source": "applet_sdk",
        "invokedFrom.appletId": appletId,
    });
    if (activeCount < APPLET_SDK_LIMITS.mediaTask.concurrent) return null;

    return NextResponse.json(
        {
            error: "Too many active media tasks. Wait for one to finish before starting another.",
            code: "APPLET_MEDIA_TASK_LIMITED",
        },
        { status: 429 },
    );
}

export async function POST(request) {
    try {
        const body = await request.json();
        const appletId = requireString(body.appletId, "appletId");
        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        let api;
        try {
            api = resolveTaskApi(body.operation);
        } catch (error) {
            if (error.status === 400) {
                return NextResponse.json(
                    { error: error.message },
                    { status: 400 },
                );
            }
            throw error;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api,
            limits: APPLET_SDK_LIMITS.mediaTask,
            run: async () => {
                let taskSpec;
                try {
                    taskSpec = await buildTask(body, {
                        request,
                        appletId,
                        user,
                    });
                } catch (error) {
                    if (error.status === 400) {
                        return NextResponse.json(
                            { error: error.message },
                            { status: 400 },
                        );
                    }
                    throw error;
                }

                const activeLimitResponse =
                    await getActiveMediaTaskLimitResponse({
                        appletId,
                        userId: user._id,
                    });
                if (activeLimitResponse) return activeLimitResponse;

                const result = await createBackgroundTask({
                    userId: user._id,
                    type: taskSpec.type,
                    metadata: taskSpec.metadata,
                    ...(taskSpec.timeout ? { timeout: taskSpec.timeout } : {}),
                    synchronous: false,
                    invokedFrom: {
                        source: "applet_sdk",
                        appletId,
                    },
                });

                return NextResponse.json({
                    taskId: String(result.taskId),
                    ...(result.job?.id ? { jobId: String(result.job.id) } : {}),
                });
            },
        });
    } catch (error) {
        if (error.status === 400) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("Error in applet media task:", error);
        return NextResponse.json(
            { error: "Failed to start applet media task" },
            { status: 500 },
        );
    }
}
