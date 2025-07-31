import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";

export async function POST(req) {
    const user = await getCurrentUser();
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
                // Create a new media item in MongoDB
                const mediaItem = new MediaItem({
                    user: user._id,
                    taskId:
                        item.taskId ||
                        `migrated-${Date.now()}-${Math.random()}`,
                    cortexRequestId:
                        item.cortexRequestId ||
                        `migrated-${Date.now()}-${Math.random()}`,
                    prompt: item.prompt || "",
                    type: item.type || "image",
                    model: item.model || "unknown",
                    status: "completed", // Assume completed since they were in localStorage
                    url: item.url || item.imageUrl,
                    azureUrl: item.azureUrl,
                    gcsUrl: item.gcsUrl,
                    duration: item.duration,
                    generateAudio: item.generateAudio,
                    resolution: item.resolution,
                    cameraFixed: item.cameraFixed,
                    inputImageUrl: item.inputImageUrl,
                    inputImageUrl2: item.inputImageUrl2,
                    created: item.created || Math.floor(Date.now() / 1000),
                    completed: item.completed || Math.floor(Date.now() / 1000),
                    settings: item.settings || {},
                });

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
