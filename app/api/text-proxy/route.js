import { getCurrentUser } from "../utils/auth.js";

/**
 * Proxy endpoint for fetching text-based files (CSV, MD, JSON, etc.)
 * This bypasses CORS restrictions when previewing text files from blob storage
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
        const allowedDomains = [
            "ajcortexfilestorage.blob.core.windows.net",
            "storage.googleapis.com",
            "storage.cloud.google.com",
        ];

        const urlObj = new URL(url);
        if (
            !allowedDomains.some((domain) => urlObj.hostname.includes(domain))
        ) {
            return Response.json(
                { error: "URL is not from an allowed domain" },
                { status: 403 },
            );
        }

        // Fetch the file content
        const response = await fetch(url);

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

        return new Response(content, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600", // Cache for 1 hour
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
