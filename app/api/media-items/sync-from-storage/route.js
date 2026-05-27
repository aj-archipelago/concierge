import crypto from "crypto";
import mime from "mime-types";
import config from "../../../../config/index.js";
import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";
import {
    buildMediaHelperListParams,
    createMediaStorageTarget,
} from "../../../../src/utils/storageTargets.js";
import {
    isLikelyStorageFileForProcessingMedia,
    isProcessingGeneratedMediaItem,
} from "../../../../src/utils/mediaDuplicateSuppression.js";
import {
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
} from "../../utils/llm-file-utils.js";

function getMediaHelperUrl() {
    const mediaHelperUrl = config.endpoints.mediaHelperDirect();
    if (!mediaHelperUrl) {
        throw new Error("Media helper URL is not defined");
    }
    return mediaHelperUrl;
}

function parseTimestampSeconds(value) {
    const timestampMs = Date.parse(value || "");
    if (Number.isFinite(timestampMs) && timestampMs > 0) {
        return Math.floor(timestampMs / 1000);
    }
    return Math.floor(Date.now() / 1000);
}

function inferMediaType(file) {
    const mimeType =
        file?.contentType ||
        file?.mimeType ||
        mime.lookup(file?.filename || file?.name || file?.url || "") ||
        "";

    if (typeof mimeType === "string") {
        if (mimeType.startsWith("image/")) {
            return "image";
        }
        if (mimeType.startsWith("video/")) {
            return "video";
        }
        if (mimeType.startsWith("audio/")) {
            return "audio";
        }
    }

    return null;
}

function buildStableTaskId(file) {
    const identity =
        file.hash ||
        file.blobPath ||
        file.url ||
        file.filename ||
        crypto.randomUUID();
    const digest = crypto.createHash("sha1").update(identity).digest("hex");
    return `storage-sync-${digest}`;
}

function normalizeListedFile(file) {
    const url = file?.url || null;
    const blobPath =
        file?.blobPath || file?.name || extractBlobPathFromUrl(url);
    const hash = file?.hash || extractHashFromBlobUrl(url);
    const type = inferMediaType(file);

    if (!type || (!url && !blobPath && !hash)) {
        return null;
    }

    const filename =
        file?.displayFilename ||
        file?.filename ||
        (blobPath ? blobPath.split("/").pop() : null) ||
        "media";
    const created = parseTimestampSeconds(
        file?.lastModified || file?.lastAccessed,
    );

    return {
        url,
        gcsUrl: file?.gcs || file?.gcsUrl || null,
        blobPath,
        hash,
        type,
        filename,
        mimeType:
            file?.contentType ||
            file?.mimeType ||
            mime.lookup(filename) ||
            undefined,
        created,
    };
}

function isMediaSupportAsset(file) {
    const blobPath = String(file?.blobPath || file?.name || "").replace(
        /\\/g,
        "/",
    );
    const filename = String(file?.filename || blobPath.split("/").pop() || "");

    return (
        blobPath.includes("video-thumbnails/") ||
        blobPath.includes("video-frame-references/") ||
        /^thumbnail-[^.].*\.jpe?g$/i.test(filename) ||
        /^(start_frame|end_frame)-.*\.jpe?g$/i.test(filename)
    );
}

function collectExistingIdentifiers(mediaItems) {
    const hashes = new Set();
    const blobPaths = new Set();
    const urls = new Set();

    for (const item of mediaItems) {
        if (item?.hash) {
            hashes.add(item.hash);
        } else {
            const extractedHash =
                extractHashFromBlobUrl(item?.azureUrl) ||
                extractHashFromBlobUrl(item?.url);
            if (extractedHash) {
                hashes.add(extractedHash);
            }
        }

        const blobPath =
            item?.blobPath ||
            extractBlobPathFromUrl(item?.azureUrl) ||
            extractBlobPathFromUrl(item?.url);
        if (blobPath) {
            blobPaths.add(blobPath);
        }

        if (item?.url) {
            urls.add(item.url);
        }
        if (item?.azureUrl) {
            urls.add(item.azureUrl);
        }
    }

    return { hashes, blobPaths, urls };
}

function isExpectedMediaFolderPath(folderPath) {
    if (!folderPath) {
        return false;
    }

    const normalized = String(folderPath).replace(/^\/+|\/+$/g, "");
    return (
        normalized === "media" ||
        normalized.endsWith("/media") ||
        normalized.includes("/media/")
    );
}

export async function POST() {
    const user = await getCurrentUser();

    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    if (!user.contextId) {
        return Response.json(
            { error: "User contextId is required for media sync" },
            { status: 400 },
        );
    }

    try {
        const mediaHelperUrl = new URL(getMediaHelperUrl());
        mediaHelperUrl.searchParams.set("listFolder", "true");

        const listParams = buildMediaHelperListParams({
            storageTarget: createMediaStorageTarget(user.contextId),
        });
        for (const [key, value] of Object.entries(listParams)) {
            mediaHelperUrl.searchParams.set(key, value);
        }

        const listResponse = await fetch(mediaHelperUrl.toString(), {
            cache: "no-store",
        });
        if (!listResponse.ok) {
            const errorBody = await listResponse.text().catch(() => "");
            throw new Error(
                `Failed to list media folder: ${listResponse.status} ${errorBody}`,
            );
        }

        const listData = await listResponse.json();
        if (!isExpectedMediaFolderPath(listData?.folderPath)) {
            console.warn(
                "Media sync aborted because media-helper returned an unexpected folderPath:",
                listData?.folderPath,
            );
            return Response.json({
                success: true,
                inspectedCount: 0,
                syncedCount: 0,
                skippedCount: 0,
                warning: `Unexpected folderPath returned by media-helper: ${listData?.folderPath || "unknown"}`,
            });
        }

        const listedFiles = Array.isArray(listData?.files)
            ? listData.files.map(normalizeListedFile).filter(Boolean)
            : [];

        const existingItems = await MediaItem.find(
            { user: user._id },
            "hash blobPath url azureUrl status model type outputFolder taskId cortexRequestId prompt displayPrompt created",
        ).lean();
        const existingIdentifiers = collectExistingIdentifiers(existingItems);
        const pendingGeneratedItems = existingItems.filter(
            isProcessingGeneratedMediaItem,
        );

        let syncedCount = 0;
        let skippedCount = 0;

        for (const file of listedFiles) {
            if (isMediaSupportAsset(file)) {
                skippedCount += 1;
                continue;
            }

            if (
                isLikelyStorageFileForProcessingMedia(
                    file,
                    pendingGeneratedItems,
                )
            ) {
                skippedCount += 1;
                continue;
            }

            const alreadyExists =
                (file.hash && existingIdentifiers.hashes.has(file.hash)) ||
                (file.blobPath &&
                    existingIdentifiers.blobPaths.has(file.blobPath)) ||
                (file.url && existingIdentifiers.urls.has(file.url));

            if (alreadyExists) {
                skippedCount += 1;
                continue;
            }

            const taskId = buildStableTaskId(file);
            const mediaItemData = {
                user: user._id,
                taskId,
                cortexRequestId: taskId,
                prompt: file.filename,
                type: file.type,
                model: "storage-sync",
                status: "completed",
                ...(file.url && { url: file.url }),
                ...(file.url && { azureUrl: file.url }),
                ...(file.gcsUrl && { gcsUrl: file.gcsUrl }),
                ...(file.hash && { hash: file.hash }),
                ...(file.blobPath && { blobPath: file.blobPath }),
                created: file.created,
                completed: file.created,
                settings: {
                    source: "storage-sync",
                },
            };

            const upsertResult = await MediaItem.updateOne(
                { user: user._id, taskId },
                { $setOnInsert: mediaItemData },
                { upsert: true },
            );

            if (!upsertResult.upsertedCount) {
                skippedCount += 1;
                continue;
            }

            syncedCount += 1;

            if (file.hash) {
                existingIdentifiers.hashes.add(file.hash);
            }
            if (file.blobPath) {
                existingIdentifiers.blobPaths.add(file.blobPath);
            }
            if (file.url) {
                existingIdentifiers.urls.add(file.url);
            }
        }

        return Response.json({
            success: true,
            inspectedCount: listedFiles.length,
            syncedCount,
            skippedCount,
        });
    } catch (error) {
        console.error("Error syncing media items from storage:", error);
        return Response.json(
            { error: "Failed to sync media items from storage" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
