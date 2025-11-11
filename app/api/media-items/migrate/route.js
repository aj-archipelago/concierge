import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";

export async function POST(req) {
    const user = await getCurrentUser();

    // Validate authentication
    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const body = await req.json();
    const { mediaItems } = body;

    if (!mediaItems || !Array.isArray(mediaItems)) {
        return Response.json(
            { error: "Invalid media items data" },
            { status: 400 },
        );
    }

    try {
        const migratedItems = [];
        const errors = [];

        for (const item of mediaItems) {
            try {
                // Check if item already exists to prevent duplicates
                const existingItem = await MediaItem.findOne({
                    user: user._id,
                    cortexRequestId: item.cortexRequestId,
                });

                if (existingItem) {
                    console.log(
                        `Item with cortexRequestId ${item.cortexRequestId} already exists, skipping`,
                    );
                    continue;
                }

                // Extract duration and other settings from result if available
                let duration = item.duration;
                let generateAudio = item.generateAudio;
                let resolution = item.resolution;
                let cameraFixed = item.cameraFixed;

                // For video items, try to extract settings from result
                if (item.type === "video" && item.result && item.result.input) {
                    const input = item.result.input;
                    duration = duration || input.duration;
                    generateAudio = generateAudio || input.generate_audio;
                    resolution = resolution || input.resolution;
                    cameraFixed = cameraFixed || input.camera_fixed;
                }

                // Create a new media item in MongoDB
                const mediaItemData = {
                    user: user._id,
                    taskId: item.taskId || item.cortexRequestId, // Use cortexRequestId as fallback
                    cortexRequestId: item.cortexRequestId,
                    prompt: item.prompt || "",
                    type: item.type || "image",
                    model: item.model || "unknown",
                    status: "completed", // Assume completed since they were in localStorage
                    url: item.url,
                    azureUrl: item.azureUrl,
                    gcsUrl: item.gcsUrl,
                    duration: duration,
                    generateAudio: generateAudio,
                    resolution: resolution,
                    cameraFixed: cameraFixed,
                    created: item.created || Math.floor(Date.now() / 1000),
                    completed:
                        item.completed ||
                        item.created ||
                        Math.floor(Date.now() / 1000),
                    settings: item.settings || {},
                };

                // Only add fields that are not null to avoid encryption issues
                if (item.inputImageUrl) {
                    mediaItemData.inputImageUrl = item.inputImageUrl;
                }
                if (item.inputImageUrl2) {
                    mediaItemData.inputImageUrl2 = item.inputImageUrl2;
                }
                if (item.inputImageUrl3) {
                    mediaItemData.inputImageUrl3 = item.inputImageUrl3;
                }

                const mediaItem = new MediaItem(mediaItemData);

                await mediaItem.save();
                migratedItems.push(mediaItem);
            } catch (error) {
                console.error("Error migrating media item:", error);
                errors.push({
                    item,
                    error: error.message,
                });
            }
        }

        return Response.json({
            success: true,
            migratedCount: migratedItems.length,
            errorCount: errors.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error("Error during media migration:", error);
        return Response.json(
            { error: "Failed to migrate media items" },
            { status: 500 },
        );
    }
}
