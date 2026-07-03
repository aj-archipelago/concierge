import { NextResponse } from "next/server";
import { serveWorkspaceFile } from "./utils";

/**
 * GET /api/workspace/file?path=...
 * Fetches file content from blob storage for paths under /workspace/files/.
 * Uses media-helper blobPath lookup to get a signed URL, then fetches the content.
 * Path must be under /workspace/files/ (user's blob storage, synced to workspace).
 */
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        return serveWorkspaceFile(searchParams.get("path"));
    } catch (error) {
        console.error("[workspace/file] Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 },
        );
    }
}
