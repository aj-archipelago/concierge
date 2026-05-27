import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";

const MEDIA_HELPER_URL =
    process.env.CORTEX_MEDIA_API_URL || "http://localhost:5000";

/**
 * GET /api/workspace/file?path=...
 * Fetches file content from blob storage for paths under /workspace/files/.
 * Uses media-helper blobPath lookup to get a signed URL, then fetches the content.
 * Path must be under /workspace/files/ (user's blob storage, synced to workspace).
 */
export async function GET(req) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get("path");

        if (!filePath || typeof filePath !== "string") {
            return NextResponse.json(
                { error: "path is required" },
                { status: 400 },
            );
        }

        const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
        if (!normalized.startsWith("/workspace/files/")) {
            return NextResponse.json(
                { error: "path must be under /workspace/files/" },
                { status: 400 },
            );
        }

        const blobPath = normalized.replace(/^\/workspace\/files\/?/, "");
        const userId = user.contextId;
        if (!userId) {
            return NextResponse.json(
                { error: "User context not available" },
                { status: 400 },
            );
        }

        const lookupUrl = new URL(MEDIA_HELPER_URL);
        lookupUrl.searchParams.set("blobPath", blobPath);
        lookupUrl.searchParams.set("userId", userId);

        const lookupRes = await fetch(lookupUrl.toString());
        if (!lookupRes.ok) {
            const errBody = await lookupRes.text();
            let errMsg = lookupRes.statusText;
            try {
                const parsed = JSON.parse(errBody);
                errMsg =
                    parsed.body ?? parsed.error ?? parsed.message ?? errMsg;
            } catch {
                if (errBody) errMsg = errBody;
            }
            return NextResponse.json(
                { error: errMsg },
                { status: lookupRes.status },
            );
        }

        const lookupData = await lookupRes.json();
        const fileUrl = lookupData.shortLivedUrl || lookupData.url;
        if (!fileUrl) {
            return NextResponse.json(
                { error: "File not found in blob storage" },
                { status: 404 },
            );
        }

        const contentRes = await fetch(fileUrl);
        if (!contentRes.ok) {
            return NextResponse.json(
                { error: "Failed to fetch file content" },
                { status: 502 },
            );
        }

        const contentType =
            contentRes.headers.get("content-type") ||
            "text/html; charset=utf-8";
        const body = await contentRes.arrayBuffer();

        return new Response(body, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("[workspace/file] Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 },
        );
    }
}
