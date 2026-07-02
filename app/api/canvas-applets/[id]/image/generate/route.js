import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../../utils/auth";
import MediaItem from "../../../../models/media-item.mjs";
import { createBackgroundTask } from "../../../../utils/tasks";
import {
    formatDbErrorForLog,
    getDbRetryDelayMs,
} from "../../../../utils/db-retry.mjs";
import {
    deleteMediaFile,
    listMediaFiles,
} from "../../../../utils/media-service-utils";
import { generateAppletMetadata } from "../../../registry";
import { createAppletGlobalStorageTarget } from "../../../../../../src/utils/storageTargets";

const DEFAULT_APPLET_IMAGE_MODEL = "gemini-flash-31-image";
const DEFAULT_APPLET_IMAGE_SIZE = "512";

const DIRECTORY_IMAGE_STYLE_CUES = [
    "Create a 16:9 background artwork asset for an applet directory card. Generate only the underlying art that Concierge will place inside its own card UI.",
    "Do not render a completed card, frame, border, rounded rectangle, device screen, tablet, monitor, browser window, app launcher tile, poster, badge, logo, or product mockup.",
    "Do not include any readable text, pseudo-text, labels, title, app name, UI chrome, watermark, caption, button, navigation, sign-in control, tag pill, badge, or iconography that looks like a finished interface.",
    "Use saturated cinematic digital illustration, deep layered background, subtle texture/noise, high contrast, crisp focal subject, and premium thumbnail polish.",
    "Leave usable negative space around the lower third so Concierge's own card title and gradient overlay can be added later.",
    "Make it specific to the app's purpose while still feeling like background art for a polished directory grid.",
].join(" ");

const THEME_VARIANTS = {
    light: [
        "Theme variant: light mode background art asset.",
        "Use luminous color, bright-but-readable contrast, and clean highlights that feel at home on a light app directory surface.",
        "Use the provided dark-mode artwork as the composition and subject reference when one is provided, adapting it into a brighter companion image rather than inventing a different scene.",
        "Avoid heavy black backgrounds while preserving enough separation for Concierge's card gradient and title overlay.",
    ].join(" "),
    dark: [
        "Theme variant: dark mode background art asset.",
        "Use deep cinematic contrast, rich shadows, controlled glow, and crisp focal lighting that feels at home on a dark app directory surface.",
        "Avoid flat pale backgrounds; preserve enough negative space for white overlay text to remain legible.",
    ].join(" "),
};

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        { error: error?.message || fallback },
        { status: error?.status || 500 },
    );
}

function validateAppletId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid applet ID");
        error.status = 400;
        throw error;
    }
}

async function requireUser() {
    const user = await getCurrentUser();
    if (!user?._id) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    return user;
}

function normalizeTags(value) {
    return Array.isArray(value)
        ? value
              .map((tag) =>
                  String(tag || "")
                      .trim()
                      .toLowerCase(),
              )
              .filter(Boolean)
              .slice(0, 8)
        : [];
}

function mergeMetadata(base, override = {}) {
    return {
        ...base,
        ...Object.fromEntries(
            Object.entries(override || {}).filter(([, value]) => {
                if (Array.isArray(value)) return value.length > 0;
                return value !== undefined && value !== null && value !== "";
            }),
        ),
        tags: normalizeTags(override.tags || base.tags),
    };
}

function normalizeStyleCues(value) {
    if (Array.isArray(value)) {
        return value
            .map((cue) => String(cue || "").trim())
            .filter(Boolean)
            .join("; ");
    }
    return String(value || "").trim();
}

function buildBaseImagePrompt(metadata, styleCues = "") {
    const tags = normalizeTags(metadata.tags);
    const visualContext = Array.from(
        new Set(
            [
                metadata.name,
                metadata.description,
                tags.length ? tags.join(", ") : "",
                metadata.imagePrompt,
            ].filter(Boolean),
        ),
    ).join("; ");
    const parts = [
        DIRECTORY_IMAGE_STYLE_CUES,
        visualContext
            ? `Visual concept to imply through objects, scenery, lighting, and mood only; do not write or draw these words: ${visualContext}.`
            : "",
        styleCues
            ? `Additional visual style cues from the applet builder; apply these to lighting, palette, materials, composition, and mood only, without adding text or finished UI elements: ${styleCues}.`
            : "",
    ].filter(Boolean);
    return parts.join("\n");
}

function buildVariantPrompt(prompt, variant) {
    return [prompt, THEME_VARIANTS[variant]].filter(Boolean).join("\n\n");
}

function buildVariantFilenamePrompt(variant) {
    return `card-art-${variant}`;
}

function normalizeThemeVariant(value) {
    return value === "light" ? "light" : "dark";
}

function appletAssetOutputFolder(appletId) {
    return `assets/${appletId}`;
}

function appletAssetOutputFolders(appletId) {
    const folder = appletAssetOutputFolder(appletId);
    return [folder, `applets/${folder}`];
}

function normalizeStorageFileReference(file, outputFolder) {
    const blobPath = String(
        file?.blobPath || file?.name || file?.path || "",
    ).trim();
    if (blobPath) {
        return {
            blobPath,
            hash: file?.hash || null,
        };
    }

    const filename = String(file?.filename || "").trim();
    if (!filename) return null;
    return {
        blobPath: `${outputFolder}/${filename}`,
        hash: file?.hash || null,
    };
}

async function retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(
                `Applet image DB operation attempt ${attempt}/${maxRetries} failed: ${formatDbErrorForLog(error)}`,
            );

            if (attempt < maxRetries) {
                const waitTime = getDbRetryDelayMs(error, retryDelay);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retryDelay *= 2;
            }
        }
    }
    throw lastError;
}

async function cleanupAppletAssetImages({
    user,
    appletId,
    outputFolder,
    storageTarget,
}) {
    const outputFolders = appletAssetOutputFolders(appletId);
    const existingItems = await retryDbOperation(() =>
        MediaItem.find({
            user: user._id,
            outputFolder: { $in: outputFolders },
            tags: "applet-card",
        })
            .select("blobPath hash")
            .lean(),
    );
    const listedFiles = await listMediaFiles({
        storageTarget,
        subPath: outputFolder,
    });
    const filesToDelete = new Map();

    for (const item of Array.isArray(existingItems) ? existingItems : []) {
        const blobPath = item?.blobPath || "";
        const hash = item?.hash || "";
        if (blobPath || hash) {
            filesToDelete.set(blobPath || hash, { blobPath, hash });
        }
    }

    for (const file of listedFiles) {
        const fileReference = normalizeStorageFileReference(file, outputFolder);
        if (fileReference?.blobPath || fileReference?.hash) {
            filesToDelete.set(
                fileReference.blobPath || fileReference.hash,
                fileReference,
            );
        }
    }

    await Promise.allSettled(
        [...filesToDelete.values()].map(({ blobPath, hash }) =>
            deleteMediaFile({
                blobPath,
                hash,
                fallbackToHash: false,
                storageTarget,
            }),
        ),
    );

    await retryDbOperation(() =>
        MediaItem.deleteMany({
            user: user._id,
            outputFolder: { $in: outputFolders },
            tags: "applet-card",
        }),
    );
}

function buildAppletImageSettings(body, model) {
    const baseSettings =
        body.settings &&
        typeof body.settings === "object" &&
        !Array.isArray(body.settings)
            ? body.settings
            : {};
    const { models: incomingModels, ...baseSettingsWithoutModels } =
        baseSettings;
    const existingModelSettings =
        incomingModels?.[model] &&
        typeof incomingModels[model] === "object" &&
        !Array.isArray(incomingModels[model])
            ? incomingModels[model]
            : {};
    const quality =
        body.quality ||
        existingModelSettings.quality ||
        baseSettings.quality ||
        "draft";
    const aspectRatio =
        body.aspectRatio ||
        existingModelSettings.aspectRatio ||
        baseSettings.aspectRatio ||
        "16:9";
    const numberResults =
        body.numberResults ??
        existingModelSettings.numberResults ??
        baseSettings.numberResults ??
        1;
    const optimizePrompt =
        body.optimizePrompt ??
        existingModelSettings.optimizePrompt ??
        baseSettings.optimizePrompt ??
        false;
    const imageSize =
        body.imageSize ||
        body.image_size ||
        existingModelSettings.imageSize ||
        existingModelSettings.image_size ||
        baseSettings.imageSize ||
        baseSettings.image_size ||
        DEFAULT_APPLET_IMAGE_SIZE;

    return {
        ...baseSettingsWithoutModels,
        models: {
            [model]: {
                ...existingModelSettings,
                type: "image",
                quality,
                aspectRatio,
                numberResults,
                optimizePrompt,
                imageSize,
            },
        },
    };
}

export async function POST(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        validateAppletId(id);
        const user = await requireUser();
        const body = await request.json().catch(() => ({}));
        const fallback = await generateAppletMetadata(user, id);
        const metadata = mergeMetadata(fallback.metadata || {}, body.metadata);
        const model = DEFAULT_APPLET_IMAGE_MODEL;
        const styleCues = normalizeStyleCues(
            body.styleCues || body.visualStyleCues,
        );
        const basePrompt = buildBaseImagePrompt(metadata, styleCues);
        const prompt = body.prompt
            ? [body.prompt, styleCues ? `Style cues: ${styleCues}.` : ""]
                  .filter(Boolean)
                  .join("\n")
            : basePrompt;
        const settings = buildAppletImageSettings(body, model);
        const outputFolder = appletAssetOutputFolder(id);
        const storageTarget = createAppletGlobalStorageTarget(user.contextId);
        const requestedVariant = normalizeThemeVariant(body.variant);
        const referenceImageUrl = String(body.referenceImageUrl || "").trim();
        const shouldCleanup =
            body.cleanupExisting !== false && requestedVariant === "dark";
        if (shouldCleanup) {
            await cleanupAppletAssetImages({
                user,
                appletId: id,
                outputFolder,
                storageTarget,
            });
        }

        const variantEntries = await Promise.all(
            [requestedVariant].map(async (variant) => {
                const variantPrompt = buildVariantPrompt(prompt, variant);
                const displayPrompt = buildVariantFilenamePrompt(variant);
                const task = await createBackgroundTask({
                    userId: user._id,
                    type: "media-generation",
                    metadata: {
                        prompt: variantPrompt,
                        displayPrompt,
                        outputType: "image",
                        model,
                        inputImageUrl:
                            variant === "light" ? referenceImageUrl : "",
                        inputImageRole: "",
                        inputImageUrl2: "",
                        inputImageUrl3: "",
                        settings,
                        source: "applet_metadata",
                        appletId: id,
                        appletMetadata: metadata,
                        appletAssetType: "card-image",
                        themeVariant: variant,
                        referenceThemeVariant:
                            variant === "light" && referenceImageUrl
                                ? "dark"
                                : "",
                        storageTarget,
                        inputTags: [
                            "applet",
                            "applet-card",
                            `theme-${variant}`,
                            ...normalizeTags(metadata.tags),
                        ],
                        outputFolder,
                    },
                    invokedFrom: {
                        source: "applet_metadata",
                        themeVariant: variant,
                    },
                });

                const taskId = String(task.taskId);
                const mediaItem = await retryDbOperation(() =>
                    MediaItem.create({
                        user: user._id,
                        taskId,
                        cortexRequestId: taskId,
                        prompt: variantPrompt,
                        type: "image",
                        model,
                        status: "pending",
                        settings,
                        inputImageUrl:
                            variant === "light" ? referenceImageUrl : "",
                        tags: [
                            "applet",
                            "applet-card",
                            `theme-${variant}`,
                            ...normalizeTags(metadata.tags),
                        ],
                        outputFolder,
                    }),
                );

                return [
                    variant,
                    {
                        taskId,
                        jobId: task.job?.id || null,
                        prompt: variantPrompt,
                        mediaItem,
                    },
                ];
            }),
        );
        const variants = Object.fromEntries(variantEntries);

        return NextResponse.json({
            taskId: variants.light?.taskId || variants.dark?.taskId || null,
            jobId: variants.light?.jobId || variants.dark?.jobId || null,
            prompt,
            basePrompt,
            styleCues,
            model,
            outputFolder,
            mediaItem: variants.light?.mediaItem || variants.dark?.mediaItem,
            variants,
        });
    } catch (error) {
        console.error("Error generating applet image:", error);
        return jsonError(error);
    }
}
