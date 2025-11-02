import { NextResponse } from "next/server";
import AppletFile from "../../../../../../models/applet-file.js";
import { getWorkspace } from "../../../../db.js";
import { getCurrentUser } from "../../../../../../utils/auth.js";

// GET: stream file content for an applet (proxies Azure storage to avoid CORS)
export async function GET(request, { params }) {
    const { id: workspaceId, fileId } = params;

    try {
        // 1. Security: Validate workspace and file ownership
        const workspace = await getWorkspace(workspaceId);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Get current user
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        // Find applet files for this user and applet
        const appletFile = await AppletFile.findOne({
            appletId: workspace.applet,
            userId: user._id,
        }).populate("files");

        if (!appletFile) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 },
            );
        }

        // Find the specific file by ID
        const file = appletFile.files.find((f) => f._id.toString() === fileId);

        if (!file) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 },
            );
        }

        // 2. Fetch from Azure storage (server-side, no CORS issues)
        const azureResponse = await fetch(file.url, {
            redirect: "follow",
        });

        if (!azureResponse.ok) {
            console.error(
                `Failed to fetch file from Azure: ${azureResponse.status} ${azureResponse.statusText}`,
            );
            return NextResponse.json(
                {
                    error: "Failed to fetch file from storage",
                    status: azureResponse.status,
                },
                { status: azureResponse.status },
            );
        }

        // 3. Stream directly: pipe Azure response body → client
        // Get content type from Azure response or use file's mimeType
        const contentType =
            azureResponse.headers.get("content-type") ||
            file.mimeType ||
            "application/octet-stream";

        const contentLength = azureResponse.headers.get("content-length");

        // Create streaming response with proper headers
        return new NextResponse(azureResponse.body, {
            status: 200,
            headers: {
                // Content headers
                "Content-Type": contentType,
                ...(contentLength && { "Content-Length": contentLength }),

                // CORS headers for applet browser access
                // Note: Using wildcard '*' is intentional to allow applets embedded
                // in various domains to access files. Security is maintained through
                // authentication (getCurrentUser) and file ownership validation above.
                // Consider making this configurable via environment variable if specific
                // trusted origins are known.
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
                "Access-Control-Expose-Headers":
                    "Content-Type, Content-Length, Content-Disposition",

                // Optional: cache control (1 hour)
                "Cache-Control": "public, max-age=3600",

                // Optional: content disposition (inline display, not download)
                "Content-Disposition": `inline; filename="${file.originalName || file.filename}"`,
            },
        });
    } catch (error) {
        console.error("Error streaming applet file content:", error);
        return NextResponse.json(
            { error: "Failed to stream file" },
            { status: 500 },
        );
    }
}
