import { getCurrentUser } from "../utils/auth.js";
import {
    fetchShortLivedUrl,
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
    isAllowedBlobDomain,
} from "../utils/llm-file-utils.js";

/**
 * Proxy endpoint for fetching text-based files (CSV, MD, JSON, etc.)
 * This bypasses CORS restrictions when previewing text files from blob storage.
 * If a SAS token has expired (403), attempts to refresh via media-helper.
 */
export async function GET(req) {
    const user = await getCurrentUser();

    // Validate authentication
    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    try {
        const { searchParams } = new URL(req.url);
        const url = searchParams.get("url");

        if (!url) {
            return Response.json(
                { error: "URL parameter is required" },
                { status: 400 },
            );
        }

        // Validate URL is from allowed domains
        const urlObj = new URL(url);
        if (!isAllowedBlobDomain(urlObj.hostname)) {
            return Response.json(
                { error: "URL is not from an allowed domain" },
                { status: 403 },
            );
        }

        // Fetch the file content
        let response = await fetch(url, { redirect: "follow" });

        // If SAS token expired (403), try to refresh via media-helper
        if (response.status === 403) {
            const blobPath = extractBlobPathFromUrl(url);
            const hash = extractHashFromBlobUrl(url);
            // Use client-provided contextId (workspace artifacts use workspaceId), fall back to user's contextId
            const contextId = searchParams.get("contextId") || user.contextId;
            if ((blobPath || hash) && contextId) {
                const refreshed = await fetchShortLivedUrl({
                    blobPath,
                    hash,
                    contextId,
                });
                if (refreshed?.url) {
                    response = await fetch(refreshed.url, {
                        redirect: "follow",
                    });
                }
            }
        }

        if (!response.ok) {
            return Response.json(
                { error: `Failed to fetch file: ${response.status}` },
                { status: response.status },
            );
        }

        // Get content and return as text
        const content = await response.text();
        const contentType =
            response.headers.get("content-type") || "text/plain";

        // Cache for 30 days — proxy URLs are stable and files are content-addressed (xxHash64)
        return new Response(content, {
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=2592000, immutable",
            },
        });
    } catch (error) {
        console.error("Error in text proxy:", error);
        return Response.json(
            { error: "Failed to fetch file content" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
