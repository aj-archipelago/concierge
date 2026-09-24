import { createHash } from "node:crypto";
import { SYS_MODEL_METADATA } from "../../../src/graphql";
import { getClient } from "./cortex-client.js";
import Task from "../models/task.mjs";
import File from "../models/file.js";
import MediaItem from "../models/media-item.mjs";
import { withAssistantDispatchLock } from "./agent-tool-capabilities.mjs";
import { createBackgroundTask, getBackgroundTaskId } from "./tasks.js";
import { GET as readTask } from "../tasks/[id]/route.js";
import { checkMediaFile } from "./media-service-utils.js";
import { validatePublicMediaUrl } from "./publicMediaUrlValidation.js";
import { resolveStorageTarget } from "../../../src/utils/storageTargets.js";
import {
    describeMediaModel,
    isSelectableMediaModel,
    mediaInputError,
    mediaOutputType,
    MEDIA_CATEGORIES,
    validateMediaSettings,
} from "../../../src/utils/mediaModelCatalog.js";
import {
    getInputRequirementRange,
    hasSatisfiedPromptlessInputMode,
} from "../../../src/utils/mediaInputModes.js";
import { validateImageReferenceLimits } from "../../../src/components/images/mediaReferenceLimits.js";

const id = (value) =>
    typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) =>
    JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(
                  Object.keys(item)
                      .sort()
                      .map((key) => [key, item[key]]),
              )
            : item,
    );
function text(value, name, max = 50000) {
    if (value == null) return "";
    if (typeof value !== "string" || value.length > max)
        throw mediaInputError(`Invalid ${name}`);
    return value;
}

async function catalog() {
    const { data } = await getClient().query({
        query: SYS_MODEL_METADATA,
        fetchPolicy: "network-only",
    });
    const result = data?.sys_model_metadata?.result;
    const metadata = typeof result === "string" ? JSON.parse(result) : result;
    return (metadata?.models || []).filter(isSelectableMediaModel);
}

function page(value) {
    if (value == null) return 0;
    if (!Number.isInteger(value) || value < 0)
        throw mediaInputError("offset must be a nonnegative integer");
    return value;
}

async function publicUrl(url) {
    if (!url || typeof url !== "string" || url.length > 4096)
        throw mediaInputError("Invalid reference URL");
    const validation = await validatePublicMediaUrl(url);
    if (!validation.ok) throw mediaInputError(validation.error);
    return url;
}

async function resolveReference(reference, user, model) {
    if (
        !reference ||
        typeof reference !== "object" ||
        Array.isArray(reference) ||
        !["image", "video", "audio"].includes(reference.type)
    )
        throw mediaInputError(
            "Each reference needs type image, video, or audio",
        );
    const role = text(reference.role, "reference role", 64);
    let stored;
    if (reference.fileId || reference.mediaId) {
        if (!id(reference.fileId || reference.mediaId))
            throw mediaInputError("Invalid reference ID");
        stored = reference.fileId
            ? await File.findOne({
                  _id: reference.fileId,
                  owner: user._id,
              }).lean()
            : await MediaItem.findOne({
                  _id: reference.mediaId,
                  user: user._id,
                  status: "completed",
              }).lean();
        if (!stored)
            throw Object.assign(new Error("Reference not found"), {
                status: 404,
            });
        const type = stored.type || stored.mimeType?.split("/")[0];
        if (type && type !== reference.type)
            throw mediaInputError("Reference type does not match the file");
    }
    const blobPath =
        stored?.blobPath || text(reference.blobPath, "blobPath", 2048);
    const fileHash = stored?.hash || text(reference.hash, "hash", 256);
    if (blobPath || fileHash) {
        // Only the executing user's storage is authorized, never a model-supplied context.
        const resolved = await checkMediaFile({
            blobPath,
            hash: fileHash,
            storageTarget: resolveStorageTarget({ contextId: user.contextId }),
        });
        if (!resolved?.url)
            throw Object.assign(
                new Error("Reference is unavailable in your files"),
                { status: 404 },
            );
        return {
            type: reference.type,
            role,
            url:
                model.preferredUrlFormat === "gcs"
                    ? resolved.gcs || resolved.url
                    : resolved.url,
            blobPath: resolved.blobPath || blobPath,
            hash: resolved.hash || fileHash,
        };
    }
    return {
        type: reference.type,
        role,
        url: await publicUrl(stored?.url || reference.url),
    };
}

function validateReferences(model, settings, references, prompt) {
    if (
        references.some(
            (ref) =>
                !ref ||
                typeof ref !== "object" ||
                !["image", "video", "audio"].includes(ref.type),
        )
    )
        throw mediaInputError(
            "Each reference needs type image, video, or audio",
        );
    const counts = Object.fromEntries(
        ["image", "video", "audio"].map((type) => [
            type,
            references.filter((r) => r.type === type).length,
        ]),
    );
    for (const [type, key, cap] of [
        ["image", "inputImages", 30],
        ["video", "inputVideos", 10],
        ["audio", "inputAudio", 10],
    ]) {
        const range = getInputRequirementRange(model.mediaDefaults?.[key]);
        if (
            counts[type] > cap ||
            (range && (counts[type] < range[0] || counts[type] > range[1]))
        )
            throw mediaInputError(
                `Invalid ${type} reference count; describe the model for its input limits`,
            );
    }
    if (
        !validateImageReferenceLimits(references, {
            modelMeta: model,
            modelSettings: settings,
            getRole: (r) => r.role || "reference",
        })
    )
        throw mediaInputError(
            "Image references exceed the model's total or per-role limit",
        );
    for (const ref of references) {
        if (
            ref.type === "image" &&
            ref.role &&
            model.referenceImageRoles?.length &&
            !model.referenceImageRoles.includes(ref.role)
        )
            throw mediaInputError(`Unsupported image role: ${ref.role}`);
    }
    if (
        !prompt.trim() &&
        !counts.audio &&
        !(model.category === "audio" && counts.image) &&
        !hasSatisfiedPromptlessInputMode(model, {
            inputImagesCount: counts.image,
            inputVideosCount: counts.video,
            inputAudioCount: counts.audio,
            modelSettings: settings,
            prompt,
        })
    )
        throw mediaInputError(
            "This model requires a prompt for the selected inputs",
        );
}

function folder(value) {
    const result = text(value, "outputFolder", 512)
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean);
    if (
        result.some(
            (part) =>
                part === "." ||
                part === ".." ||
                [...part].some((char) => char.charCodeAt(0) < 32),
        )
    )
        throw mediaInputError(
            "outputFolder must be a relative folder in Files",
        );
    return result.join("/") || "media";
}

function output(file) {
    return Object.fromEntries(
        [
            "url",
            "azureUrl",
            "gcsUrl",
            "hash",
            "blobPath",
            "filename",
            "mimeType",
            "type",
            "key",
            "name",
            "description",
            "bounding_box",
            "bbox",
            "order",
            "z_index",
        ]
            .filter((key) => file?.[key] != null)
            .map((key) => [key, file[key]]),
    );
}

async function status(user, taskId) {
    if (!id(taskId))
        throw mediaInputError("taskId must be an exact media task ID");
    const task = await Task.findOne({
        _id: taskId,
        owner: user._id,
        type: "media-generation",
    });
    if (!task)
        throw Object.assign(new Error("Media task not found"), { status: 404 });
    const response = await readTask(null, { params: { id: taskId } });
    if (!response.ok) throw new Error("Unable to read media task status");
    const current = await response.json();
    const item = await MediaItem.findOne({ user: user._id, taskId }).lean();
    let data = current.data?.data ?? current.data;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            data = null;
        }
    }
    const result = item?.status === "completed" ? item : data;
    const details = Object.fromEntries(
        ["styleId", "lyrics"]
            .filter((key) => result?.providerMetadata?.[key] != null)
            .map((key) => [key, result.providerMetadata[key]]),
    );
    return {
        taskId,
        status: current.status,
        progress: current.progress,
        ...(current.statusText && { statusText: current.statusText }),
        ...(current.error && { error: current.error }),
        ...(item?._id && { mediaId: String(item._id) }),
        mediaUrl: "/media",
        ...(current.status === "completed" &&
            Object.keys(details).length && { details }),
        ...(current.status === "completed" &&
            result && {
                outputs: (result.outputFiles?.length
                    ? result.outputFiles
                    : [result]
                ).map(output),
            }),
        ...(["pending", "in_progress"].includes(current.status) && {
            next: "Generation is still running. Check this taskId later; do not generate again to check progress.",
        }),
    };
}

export async function executeMediaTool({
    user,
    entity,
    binding,
    args,
    operationId,
}) {
    if (args.operation === "status") {
        const wait = args.waitSeconds ?? 0;
        if (!Number.isInteger(wait) || wait < 0 || wait > 20)
            throw mediaInputError(
                "waitSeconds must be an integer from 0 to 20",
            );
        const deadline = Date.now() + wait * 1000;
        while (true) {
            const result = await status(user, args.taskId);
            if (
                !["pending", "in_progress"].includes(result.status) ||
                Date.now() >= deadline
            )
                return result;
            await new Promise((resolve) =>
                setTimeout(resolve, Math.min(2000, deadline - Date.now())),
            );
        }
    }
    if (!["search", "describe", "generate"].includes(args.operation))
        throw mediaInputError(
            "operation must be search, describe, generate, or status",
        );
    const models = await catalog();
    if (args.operation === "search") {
        const query = text(args.query, "query", 200)
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        if (args.category && !MEDIA_CATEGORIES.includes(args.category))
            throw mediaInputError("Invalid media category");
        const filtered = models.filter(
            (model) =>
                (!args.category || model.category === args.category) &&
                query.every((term) =>
                    JSON.stringify([
                        model.modelId,
                        model.displayName,
                        model.category,
                        model.description,
                        model.provider,
                        model.mediaInputModes,
                        model.referenceDescriptions,
                        model.mediaControls,
                        model.category === "tts"
                            ? "speech voice"
                            : model.category === "audio"
                              ? "music sound"
                              : model.category === "upscaling"
                                ? "upscale enhance"
                                : "",
                    ])
                        .toLowerCase()
                        .includes(term),
                ),
        );
        const offset = page(args.offset);
        return {
            models: filtered.slice(offset, offset + 8).map((model) => ({
                model: model.modelId,
                name: model.displayName || model.modelId,
                category: model.category,
                ...(model.description && {
                    description: model.description.slice(0, 180),
                }),
            })),
            total: filtered.length,
            nextOffset: offset + 8 < filtered.length ? offset + 8 : null,
            next: "Use describe with an exact model ID for settings and reference requirements.",
        };
    }
    const model = models.find((item) => item.modelId === args.model);
    if (!model)
        throw mediaInputError("Choose an exact available model ID from search");
    if (args.operation === "describe")
        return {
            ...describeMediaModel(model, args.settings || {}),
            usage: "generate: model, prompt (unless input mode permits omission), settings (flat object using control keys), references [{type, fileId OR mediaId OR blobPath/hash OR public url, role?}], outputFolder?, requestKey. Use a new requestKey for a new generation and reuse it only for retries. Video frame roles take extracted image frames; full videos go in video references. Returns a background taskId; use status for progress and saved outputs.",
        };
    const requestKey = text(args.requestKey, "requestKey", 120).trim();
    if (!requestKey || !operationId)
        throw mediaInputError(
            "generate requires a stable requestKey; reuse it when retrying this generation",
        );
    const key = hash(
        JSON.stringify([
            entity.id,
            binding?.chatId || binding?.taskId || "",
            requestKey,
        ]),
    );
    const fingerprint = hash(
        stableJson([
            args.model,
            args.prompt || "",
            args.settings || {},
            args.references || [],
            args.outputFolder || "media",
        ]),
    );
    const idempotencyKey = `agent-media:${key}`;
    const taskId = getBackgroundTaskId({
        userId: user._id,
        type: "media-generation",
        idempotencyKey,
    });
    const mediaTask = {
        taskId,
        model: model.modelId,
        name: model.displayName || model.modelId,
        type: mediaOutputType(model),
    };
    return withAssistantDispatchLock(
        `media:${user._id}:${key}`,
        async () => {
            const prior = await Task.findOne({
                owner: user._id,
                type: "media-generation",
                _id: taskId,
            });
            if (prior) {
                if (prior.metadata?.agentMediaFingerprint !== fingerprint)
                    throw mediaInputError(
                        "requestKey already belongs to a different generation; choose a new key",
                    );
                if (prior.jobId || prior.status !== "pending")
                    return {
                        ...(await status(user, String(prior._id))),
                        mediaTask,
                    };
                // Recover a queue submission interrupted after the task was saved.
            }
            const prompt = text(args.prompt, "prompt");
            const settings = validateMediaSettings(model, args.settings || {});
            const references = args.references || [];
            if (!Array.isArray(references) || references.length > 50)
                throw mediaInputError(
                    "references must be an array with at most 50 items",
                );
            validateReferences(model, settings, references, prompt);
            const resolved = await Promise.all(
                references.map((ref) => resolveReference(ref, user, model)),
            );
            for (const key of [
                "sourceUrl",
                "audioUrl",
                "audio_url",
                "inputAudioUrl",
                "input_audio_url",
            ]) {
                if (settings[key])
                    settings[key] = await publicUrl(settings[key]);
            }
            const metadata = {
                prompt,
                model: model.modelId,
                outputType: mediaOutputType(model),
                settings: { models: { [model.modelId]: settings } },
                outputFolder: folder(args.outputFolder),
                skipUserState: true,
                agentEntityId: entity.id,
                agentMediaFingerprint: fingerprint,
            };
            for (const type of ["image", "video"])
                resolved
                    .filter((r) => r.type === type)
                    .forEach((ref, index) => {
                        const prefix =
                            type === "image" ? "inputImage" : "inputVideo";
                        const suffix = index ? String(index + 1) : "";
                        for (const [key, field] of [
                            ["url", "Url"],
                            ["role", "Role"],
                            ["blobPath", "BlobPath"],
                            ["hash", "Hash"],
                        ])
                            if (ref[key])
                                metadata[`${prefix}${field}${suffix}`] =
                                    ref[key];
                    });
            metadata.inputAudios = resolved
                .filter((r) => r.type === "audio")
                .map(({ url, blobPath, hash }) => ({ url, blobPath, hash }));
            if (metadata.inputAudios.length) {
                const audio = metadata.inputAudios[0];
                Object.assign(metadata, {
                    inputAudioUrl: audio.url,
                    inputAudioBlobPath: audio.blobPath,
                    inputAudioHash: audio.hash,
                });
            }
            const result = await createBackgroundTask({
                userId: user._id,
                type: "media-generation",
                metadata,
                idempotencyKey,
                invokedFrom: {
                    source: binding?.chatId ? "chat" : "unknown",
                    chatId: binding?.chatId,
                },
                beforeEnqueue: async (task) => {
                    if (task.metadata?.agentMediaFingerprint !== fingerprint)
                        throw mediaInputError(
                            "requestKey already belongs to a different generation",
                        );
                    await MediaItem.findOneAndUpdate(
                        { user: user._id, taskId: String(task._id) },
                        {
                            $setOnInsert: {
                                ...task.metadata,
                                user: user._id,
                                taskId: String(task._id),
                                cortexRequestId: String(task._id),
                                type: task.metadata.outputType,
                                prompt:
                                    prompt ||
                                    model.displayName ||
                                    model.modelId,
                                status: "pending",
                            },
                        },
                        { upsert: true, setDefaultsOnInsert: true },
                    );
                    return true;
                },
            });
            return {
                taskId: String(result.taskId),
                mediaTask,
                model: model.modelId,
                mediaUrl: "/media",
                outputFolder: metadata.outputFolder,
                next: binding?.chatId
                    ? "Accepted. Live result cards in this reply will show progress and finished media automatically. Briefly confirm once, then let the cards update. Do not poll just for display, repeat the setup, or redirect the user to Media. Use status only if you need the files for further work."
                    : "Accepted. Use status with this taskId and waitSeconds:20 when outputs are needed for further work. Never generate again to check progress.",
            };
        },
        undefined,
        { waitMs: 20000 },
    );
}
