import { getCurrentUser } from "../../../utils/auth.js";
import MediaItem from "../../../models/media-item.mjs";

export async function PUT(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;
    const body = await req.json();
    const { tags } = body;

    // Validate authentication
    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    // Validate tags
    if (!Array.isArray(tags)) {
        return Response.json(
            { error: "Tags must be an array" },
            { status: 400 },
        );
    }

    // Validate each tag is a string and not empty
    const validTags = tags.filter(
        (tag) => typeof tag === "string" && tag.trim().length > 0,
    );

    try {
        const mediaItem = await MediaItem.findOneAndUpdate(
            { user: user._id, taskId: id },
            { tags: validTags },
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
        console.error("Error updating media item tags:", error);
        return Response.json(
            { error: "Failed to update tags" },
            { status: 500 },
        );
    }
}
