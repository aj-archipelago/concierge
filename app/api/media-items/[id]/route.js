import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";
import {
    checkMediaFile,
    deleteMediaFile,
} from "../../utils/media-service-utils.js";
import { createMediaStorageTarget } from "../../../../src/utils/storageTargets.js";
import { getVideoFrameReferenceTargets } from "../../../../src/utils/mediaVideoFrameReferences.js";
import {
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
} from "../../utils/llm-file-utils.js";

export async function PUT(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;
    const body = await req.json();

    try {
        const mediaItem = await MediaItem.findOneAndUpdate(
            { user: user._id, taskId: id },
            body,
            { new: true, runValidators: true },
        );

        if (!mediaItem) {
            return Response.json(
                { error: "Media item not found" },
                { status: 404 },
            );
        }

        return Response.json(mediaItem);
    } catch (error) {
        console.error("Error updating media item:", error);
        return Response.json(
            { error: "Failed to update media item" },
            { status: 500 },
        );
    }
}

export async function DELETE(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;

    try {
        const mediaItem = await MediaItem.findOne({
            user: user._id,
            taskId: id,
        });

        if (!mediaItem) {
            return Response.json(
                { error: "Media item not found" },
                { status: 404 },
            );
        }

        const storageTarget = createMediaStorageTarget(user.contextId);
        const blobPath =
            mediaItem.blobPath ||
            extractBlobPathFromUrl(mediaItem.azureUrl || mediaItem.url);
        const hash =
            mediaItem.hash ||
            extractHashFromBlobUrl(mediaItem.azureUrl || mediaItem.url);
        const thumbnailUrl =
            mediaItem.thumbnailAzureUrl ||
            mediaItem.thumbnailUrl ||
            mediaItem.thumbnailGcsUrl;
        const thumbnailBlobPath =
            mediaItem.thumbnailBlobPath || extractBlobPathFromUrl(thumbnailUrl);
        const thumbnailHash =
            mediaItem.thumbnailHash || extractHashFromBlobUrl(thumbnailUrl);

        if (blobPath || hash) {
            const existingFile = await checkMediaFile({
                blobPath,
                hash,
                storageTarget,
            });

            if (existingFile) {
                const canonicalBlobPath =
                    existingFile.blobPath ||
                    extractBlobPathFromUrl(existingFile.url);
                const canonicalHash = existingFile.hash || hash;
                const deleted = await deleteMediaFile({
                    blobPath: canonicalBlobPath || blobPath,
                    hash: canonicalHash,
                    storageTarget,
                });

                if (!deleted) {
                    const postDeleteCheck = await checkMediaFile({
                        blobPath: canonicalBlobPath || blobPath,
                        hash: canonicalHash,
                        storageTarget,
                    });

                    if (postDeleteCheck) {
                        return Response.json(
                            {
                                error: "Failed to delete media file from storage",
                            },
                            { status: 502 },
                        );
                    }

                    console.warn(
                        "Media delete returned an error, but the file is no longer present; removing DB row anyway.",
                        {
                            taskId: mediaItem.taskId,
                            hash: canonicalHash,
                            blobPath: canonicalBlobPath || blobPath,
                        },
                    );
                }
            } else {
                console.warn(
                    "Media file was already absent from storage during delete; removing DB row only.",
                    {
                        taskId: mediaItem.taskId,
                        hash,
                        blobPath,
                    },
                );
            }
        }

        if (
            (thumbnailBlobPath || thumbnailHash) &&
            (thumbnailBlobPath !== blobPath || thumbnailHash !== hash)
        ) {
            const deletedThumbnail = await deleteMediaFile({
                blobPath: thumbnailBlobPath,
                hash: thumbnailHash,
                storageTarget,
            });

            if (!deletedThumbnail) {
                console.warn(
                    "Media thumbnail delete failed; removing DB row anyway.",
                    {
                        taskId: mediaItem.taskId,
                        thumbnailHash,
                        thumbnailBlobPath,
                    },
                );
            }
        }

        if (mediaItem.type === "video" && blobPath) {
            const frameTargets = getVideoFrameReferenceTargets(blobPath);
            for (const frameTarget of frameTargets) {
                const existingFrame = await checkMediaFile({
                    blobPath: frameTarget.blobPath,
                    storageTarget,
                });
                if (!existingFrame) continue;

                const deletedFrame = await deleteMediaFile({
                    blobPath: existingFrame.blobPath || frameTarget.blobPath,
                    hash: existingFrame.hash,
                    storageTarget,
                    fallbackToHash: false,
                });

                if (!deletedFrame) {
                    console.warn(
                        "Media video frame reference delete failed; removing source DB row anyway.",
                        {
                            taskId: mediaItem.taskId,
                            frameBlobPath: frameTarget.blobPath,
                        },
                    );
                }
            }
        }

        await MediaItem.deleteOne({ _id: mediaItem._id });

        return Response.json({ success: true });
    } catch (error) {
        console.error("Error deleting media item:", error);
        return Response.json(
            { error: "Failed to delete media item" },
            { status: 500 },
        );
    }
}
