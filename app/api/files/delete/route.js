import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import config from "../../../../config/index.js";

/**
 * DELETE /api/files/delete
 * Delete a file from cloud storage using CFH (cortex-file-handler)
 * 
 * Query parameters:
 * - hash: File hash to delete (required)
 * - container: Container name (optional, defaults to CORTEX_MEDIA_PERMANENT_STORE_NAME)
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
        const container = searchParams.get("container") || process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME;

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

        // Call CFH delete API
        // According to CFH signature: DELETE with hash parameter in query string
        // Example: DELETE /file-handler?hash=xyz789
        const deleteUrl = new URL(mediaHelperUrl);
        deleteUrl.searchParams.set("hash", hash);
        if (container) {
            deleteUrl.searchParams.set("container", container);
        }

        const deleteResponse = await fetch(deleteUrl.toString(), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!deleteResponse.ok) {
            const errorBody = await deleteResponse.text();
            console.warn(
                `Failed to delete file from container: ${deleteResponse.statusText}. Response: ${errorBody}`,
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
        console.log(
            `Successfully deleted file ${hash} from container ${container || "default"}`,
        );

        return NextResponse.json({
            success: true,
            message: `File with hash ${hash} deleted successfully`,
            deleted: deleteResult.deleted || deleteResult,
        });
    } catch (error) {
        console.error("Error deleting file from container:", error);
        return NextResponse.json(
            {
                error: "Internal server error while deleting file",
                details: error.message,
            },
            { status: 500 },
        );
    }
}

