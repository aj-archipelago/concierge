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
    const search = searchParams.get("search"); // For searching tags and prompts
    const tags = searchParams.get("tags"); // Comma-separated tags

    try {
        // Build query
        const query = { user: user._id };
        if (status) query.status = status;
        if (type) query.type = type;

        // Handle search functionality
        // Note: Cannot search prompt field due to MongoDB encryption - only search tags
        // Support comma-delimited search terms with AND logic
        if (search) {
            // Split search terms by comma and trim whitespace
            const searchTerms = search
                .split(",")
                .map((term) => term.trim())
                .filter((term) => term);

            if (searchTerms.length === 1) {
                // Single term - use regex search
                query.$or = [
                    { tags: { $regex: searchTerms[0], $options: "i" } },
                    { status: "pending" },
                ];
            } else if (searchTerms.length > 1) {
                // Multiple terms - use AND logic (all terms must match)
                query.$and = [
                    {
                        $or: [
                            { tags: { $regex: searchTerms[0], $options: "i" } },
                            { status: "pending" },
                        ],
                    },
                ];

                // Add additional AND conditions for each remaining term
                for (let i = 1; i < searchTerms.length; i++) {
                    query.$and.push({
                        $or: [
                            { tags: { $regex: searchTerms[i], $options: "i" } },
                            { status: "pending" },
                        ],
                    });
                }
            }
        }

        // Handle tag filtering
        if (tags) {
            const tagArray = tags
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag);
            if (tagArray.length > 0) {
                query.tags = { $in: tagArray };
            }
        }

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

async function getInheritedTags(userId, inputImageUrls, inputTags = []) {
    // Use tags passed from the frontend instead of querying encrypted URL fields
    if (inputTags && inputTags.length > 0) {
        return inputTags;
    }

    // Fallback: return empty array if no tags provided
    return [];
}

export async function POST(req) {
    const user = await getCurrentUser();
    const body = await req.json();

    try {
        // Get inherited tags from input images if this is a derivative work
        const inputImageUrls = [
            body.inputImageUrl,
            body.inputImageUrl2,
            body.inputImageUrl3,
        ].filter(Boolean);

        const inheritedTags = await getInheritedTags(
            user._id,
            inputImageUrls,
            body.inputTags,
        );

        const mediaItem = new MediaItem({
            ...body,
            user: user._id,
            // Inherit tags from input images (only if no tags are explicitly provided)
            tags: body.tags && body.tags.length > 0 ? body.tags : inheritedTags,
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
