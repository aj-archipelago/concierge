import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import config from "../../../../config/index.js";

/**
 * DELETE /api/files/delete
 * Delete a file from cloud storage using CFH (cortex-file-handler)
 *
 * Query parameters:
 * - hash: File hash to delete (required)
 * - contextId: Optional context ID for file scoping (e.g., user.contextId:chat)
 *              If not provided, defaults to user.contextId
 */
export async function DELETE(request) {
    try {
        // Get current user for authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const hash = searchParams.get("hash");
        const contextIdParam = searchParams.get("contextId");

        if (!hash) {
            return NextResponse.json(
                { error: "Hash parameter is required" },
                { status: 400 },
            );
        }

        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            console.error(
                "CORTEX_MEDIA_API_URL is not set or mediaHelperUrl is undefined.",
            );
            return NextResponse.json(
                {
                    error: "Media helper URL is not configured. Please set CORTEX_MEDIA_API_URL.",
                },
                { status: 500 },
            );
        }

        // Use provided contextId or fall back to user.contextId
        // This allows deletion of chat files (user.contextId:chat) or other scoped files
        const contextId = contextIdParam || user.contextId;

        // Call CFH delete API
        // According to CFH signature: DELETE with hash and contextId parameters
        // Example: DELETE /file-handler?hash=xyz789&contextId=user-123:chat
        const deleteUrl = new URL(mediaHelperUrl);
        deleteUrl.searchParams.set("hash", hash);
        deleteUrl.searchParams.set("contextId", contextId);

        const deleteResponse = await fetch(deleteUrl.toString(), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!deleteResponse.ok) {
            const errorBody = await deleteResponse.text();
            console.warn(
                `Failed to delete file: ${deleteResponse.statusText}. Response: ${errorBody}`,
            );
            return NextResponse.json(
                {
                    error: `Failed to delete file: ${deleteResponse.statusText}`,
                    details: errorBody,
                },
                { status: deleteResponse.status },
            );
        }

        const deleteResult = await deleteResponse.json();
        console.log(`Successfully deleted file ${hash}`);

        return NextResponse.json({
            success: true,
            message: `File with hash ${hash} deleted successfully`,
            deleted: deleteResult.deleted || deleteResult,
        });
    } catch (error) {
        console.error("Error deleting file:", error);
        return NextResponse.json(
            {
                error: "Internal server error while deleting file",
                details: error.message,
            },
            { status: 500 },
        );
    }
}
