import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth.js";
import {
    parseStreamingMultipart,
    uploadBufferToMediaService,
} from "../../../utils/upload-utils.js";
import { deleteMediaFile } from "../../../utils/media-service-utils.js";
import { normalizeProfilePicture } from "../../../utils/image-utils.mjs";
import { createProfileStorageTarget } from "../../../../../src/utils/storageTargets.js";

/**
 * POST /api/users/me/profile-picture
 * Upload a profile picture
 */
export async function POST(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        // Store old profile picture info before upload
        const oldProfilePictureHash = user.profilePictureHash;
        const oldProfilePictureBlobPath = user.profilePictureBlobPath;

        // Parse the streaming multipart data
        const result = await parseStreamingMultipart(request, user);
        if (result.error) {
            return result.error;
        }

        const { fileBuffer, metadata } = result.data;
        const metadataWithoutHash = { ...metadata };
        delete metadataWithoutHash.hash;

        // Normalize the image to a standard size (400x400 square)
        let normalizedBuffer;
        try {
            normalizedBuffer = await normalizeProfilePicture(fileBuffer, {
                size: 400,
                quality: 90,
            });
        } catch (error) {
            console.error("Error normalizing profile picture:", error);
            return NextResponse.json(
                {
                    error: "Failed to process image. Please ensure it's a valid image file.",
                },
                { status: 400 },
            );
        }

        // Update metadata for normalized image
        const normalizedMetadata = {
            ...metadataWithoutHash,
            filename: `profile-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
            size: normalizedBuffer.length,
        };
        const storageTarget = createProfileStorageTarget(user.contextId);

        const uploadResult = await uploadBufferToMediaService(
            normalizedBuffer,
            normalizedMetadata,
            { storageTarget },
        );

        if (uploadResult.error) {
            return uploadResult.error;
        }

        const { data } = uploadResult;
        const { converted } = data;

        let { url } = data;

        if (converted) {
            url = converted.url;
        }

        const profilePictureBlobPath =
            uploadResult.data.blobPath || uploadResult.data.name || null;

        // Update user with new profile picture
        user.profilePicture = url;
        user.profilePictureBlobPath = profilePictureBlobPath;
        user.profilePictureHash = undefined;
        await user.save();

        // Delete old profile picture from cloud storage if it exists
        if (oldProfilePictureBlobPath || oldProfilePictureHash) {
            const oldProfilePictureId =
                oldProfilePictureBlobPath || oldProfilePictureHash;
            try {
                const deleted = await deleteMediaFile({
                    blobPath: oldProfilePictureBlobPath,
                    hash: oldProfilePictureHash,
                    storageTarget,
                });

                if (deleted) {
                    console.log(
                        `Deleted old profile picture ${oldProfilePictureId}`,
                    );
                } else {
                    console.warn(
                        `Failed to delete old profile picture ${oldProfilePictureId}`,
                    );
                }
            } catch (error) {
                console.error("Error deleting old profile picture:", error);
                // Continue even if deletion fails
            }
        }

        return NextResponse.json({
            success: true,
            url,
            blobPath: user.profilePictureBlobPath,
        });
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        return NextResponse.json(
            { error: "Failed to upload profile picture" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/users/me/profile-picture
 * Delete the current user's profile picture
 */
export async function DELETE(request) {
    try {
        const user = await getCurrentUser(false);
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const profilePictureBlobPath = user.profilePictureBlobPath;
        const profilePictureHash = user.profilePictureHash;
        if (
            !profilePictureBlobPath &&
            !profilePictureHash &&
            !user.profilePicture
        ) {
            return NextResponse.json(
                { error: "No profile picture to delete" },
                { status: 404 },
            );
        }

        // Delete from cloud storage
        if (profilePictureBlobPath || profilePictureHash) {
            const profilePictureId =
                profilePictureBlobPath || profilePictureHash;
            try {
                const deleted = await deleteMediaFile({
                    blobPath: profilePictureBlobPath,
                    hash: profilePictureHash,
                    storageTarget: createProfileStorageTarget(user.contextId),
                });

                if (!deleted) {
                    console.warn(
                        `Failed to delete profile picture ${profilePictureId}`,
                    );
                }
            } catch (error) {
                console.error(
                    "Error deleting profile picture from cloud:",
                    error,
                );
                // Continue with database update even if cloud deletion fails
            }
        }

        // Update user model
        user.profilePicture = undefined;
        user.profilePictureBlobPath = undefined;
        user.profilePictureHash = undefined;
        await user.save();

        return NextResponse.json({
            success: true,
            message: "Profile picture deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting profile picture:", error);
        return NextResponse.json(
            { error: "Failed to delete profile picture" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
