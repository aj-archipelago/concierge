import { Types } from "mongoose";
import { getClient, QUERIES } from "../../../../../src/graphql";
import { getCurrentUser } from "../../../utils/auth.js";
import MediaItem from "../../../models/media-item.mjs";
import {
    mergeMediaTags,
    parseMediaPromptTagsResult,
} from "../../../../../src/utils/mediaPromptTags.js";

function getFilenameFromUrl(value) {
    if (!value || typeof value !== "string") return "";
    try {
        const url = new URL(value);
        const filename = url.pathname.split("/").filter(Boolean).pop() || "";
        return decodeURIComponent(filename);
    } catch {
        const filename = value.split("/").filter(Boolean).pop() || "";
        try {
            return decodeURIComponent(filename);
        } catch {
            return filename;
        }
    }
}

function buildAutoTagText(mediaItem) {
    const prompt = String(mediaItem?.prompt || "").trim();
    if (prompt) return prompt;

    const filename = getFilenameFromUrl(
        mediaItem?.blobPath ||
            mediaItem?.azureUrl ||
            mediaItem?.gcsUrl ||
            mediaItem?.url,
    );
    if (filename)
        return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");

    return "";
}

function buildMediaItemQuery(userId, id) {
    const clauses = [{ taskId: id }, { cortexRequestId: id }];
    if (Types.ObjectId.isValid(id)) {
        clauses.push({ _id: id });
    }

    return {
        user: userId,
        $or: clauses,
    };
}

export async function POST(_req, { params }) {
    params = await params;
    const user = await getCurrentUser();
    const { id } = params;

    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    try {
        const mediaItem = await MediaItem.findOne(
            buildMediaItemQuery(user._id, id),
        );

        if (!mediaItem) {
            return Response.json(
                { error: "Media item not found" },
                { status: 404 },
            );
        }

        const text = buildAutoTagText(mediaItem);
        if (!text) {
            return Response.json(
                { error: "No prompt or filename available for auto-tagging" },
                { status: 400 },
            );
        }

        const response = await getClient().query({
            query: QUERIES.MEDIA_PROMPT_TAGS,
            variables: { text },
            fetchPolicy: "no-cache",
        });
        const autoTags = parseMediaPromptTagsResult(
            response?.data?.media_prompt_tags?.result,
        );

        if (autoTags.length === 0) {
            return Response.json(
                { error: "Auto-tagging did not return any tags" },
                { status: 502 },
            );
        }

        mediaItem.tags = mergeMediaTags(mediaItem.tags, autoTags);
        await mediaItem.save();

        return Response.json(mediaItem);
    } catch (error) {
        console.error("Error auto-tagging media item:", error);
        return Response.json(
            { error: "Failed to auto-tag media item" },
            { status: 500 },
        );
    }
}
