import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";

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
        const mediaItem = await MediaItem.findOneAndDelete({
            user: user._id,
            taskId: id,
        });

        if (!mediaItem) {
            return Response.json(
                { error: "Media item not found" },
                { status: 404 },
            );
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error("Error deleting media item:", error);
        return Response.json(
            { error: "Failed to delete media item" },
            { status: 500 },
        );
    }
}
