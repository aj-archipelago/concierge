import { getCurrentUser } from "../utils/auth.js";
import MediaItem from "../models/media-item.mjs";

export async function GET(req) {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);

    // Pagination parameters
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 50; // Default 50 items per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    try {
        // Build query
        const query = { user: user._id };
        if (status) query.status = status;
        if (type) query.type = type;

        // Get total count for pagination
        const total = await MediaItem.countDocuments(query);

        // Get paginated results
        const mediaItems = await MediaItem.find(query)
            .sort({ created: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return Response.json({
            mediaItems,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
        });
    } catch (error) {
        console.error("Error fetching media items:", error);
        return Response.json(
            { error: "Failed to fetch media items" },
            { status: 500 },
        );
    }
}

export async function POST(req) {
    const user = await getCurrentUser();
    const body = await req.json();

    try {
        const mediaItem = new MediaItem({
            ...body,
            user: user._id,
        });

        await mediaItem.save();

        return Response.json(mediaItem);
    } catch (error) {
        console.error("Error creating media item:", error);
        return Response.json(
            { error: "Failed to create media item" },
            { status: 500 },
        );
    }
}
