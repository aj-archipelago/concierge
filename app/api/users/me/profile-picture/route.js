import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth.js";
import {
    parseStreamingMultipart,
    uploadBufferToMediaService,
} from "../../../utils/upload-utils.js";
import { normalizeProfilePicture } from "../../../utils/image-utils.mjs";
import config from "../../../../../config/index.js";

/**
 * POST /api/users/me/profile-picture
 * Upload a profile picture with permanent storage
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

        // Parse the streaming multipart data
        const result = await parseStreamingMultipart(request, user);
        if (result.error) {
            return result.error;
        }

        const { fileBuffer, metadata } = result.data;

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
            ...metadata,
            filename: `profile-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
            size: normalizedBuffer.length,
        };

        // Upload normalized image to permanent storage
        // Note: uploadBufferToMediaService will call setRetention internally when permanent=true
        const uploadResult = await uploadBufferToMediaService(
            normalizedBuffer,
            normalizedMetadata,
            true, // permanent = true
            user.contextId, // Pass contextId for proper scoping
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

        // Update user with new profile picture
        user.profilePicture = url;
        user.profilePictureHash = uploadResult.data.hash || metadata.hash;
        await user.save();

        // Delete old profile picture from cloud storage if it exists
        if (oldProfilePictureHash) {
            try {
                const mediaHelperUrl = config.endpoints.mediaHelperDirect();
                if (mediaHelperUrl) {
                    const deleteUrl = new URL(mediaHelperUrl);
                    deleteUrl.searchParams.set("hash", oldProfilePictureHash);
                    deleteUrl.searchParams.set("contextId", user.contextId);

                    const deleteResponse = await fetch(deleteUrl.toString(), {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                    if (deleteResponse.ok) {
                        console.log(
                            `Deleted old profile picture ${oldProfilePictureHash}`,
                        );
                    } else {
                        console.warn(
                            `Failed to delete old profile picture: ${deleteResponse.statusText}`,
                        );
                    }
                }
            } catch (error) {
                console.error("Error deleting old profile picture:", error);
                // Continue even if deletion fails
            }
        }

        return NextResponse.json({
            success: true,
            url: url,
            hash: user.profilePictureHash,
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

        const profilePictureHash = user.profilePictureHash;

        if (!profilePictureHash) {
            return NextResponse.json(
                { error: "No profile picture to delete" },
                { status: 404 },
            );
        }

        // Delete from cloud storage
        try {
            const mediaHelperUrl = config.endpoints.mediaHelperDirect();
            if (mediaHelperUrl) {
                const deleteUrl = new URL(mediaHelperUrl);
                deleteUrl.searchParams.set("hash", profilePictureHash);
                deleteUrl.searchParams.set("contextId", user.contextId);

                const deleteResponse = await fetch(deleteUrl.toString(), {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                });

                if (!deleteResponse.ok) {
                    console.warn(
                        `Failed to delete profile picture: ${deleteResponse.statusText}`,
                    );
                }
            }
        } catch (error) {
            console.error("Error deleting profile picture from cloud:", error);
            // Continue with database update even if cloud deletion fails
        }

        // Update user model
        user.profilePicture = undefined;
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
