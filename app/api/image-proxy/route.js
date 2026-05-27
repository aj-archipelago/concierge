import { getCurrentUser } from "../utils/auth.js";
import {
    fetchShortLivedUrl,
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
    isAllowedBlobDomain,
} from "../utils/llm-file-utils.js";
import { checkMediaFile } from "../utils/media-service-utils.js";
import { resolveStorageTarget } from "../../../src/utils/storageTargets.js";

async function resolveImageUrl({ url, blobPath, contextId, fileScope }) {
    if (!blobPath || !contextId || !fileScope) {
        return url || null;
    }

    const resolved = await checkMediaFile({
        blobPath,
        storageTarget: resolveStorageTarget({
            contextId,
            fileScope,
        }),
    });

    return resolved?.converted?.url || resolved?.url || url || null;
}

/**
 * Proxy endpoint for fetching images from blob storage
 * This bypasses CORS restrictions when displaying images from Azure Blob Storage.
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
        const blobPath = searchParams.get("blobPath");
        const contextId = searchParams.get("contextId") || user.contextId;
        const fileScope = searchParams.get("fileScope");

        if (!url && !blobPath) {
            return Response.json(
                { error: "A file URL or blobPath is required" },
                { status: 400 },
            );
        }

        let resolvedUrl = await resolveImageUrl({
            url,
            blobPath,
            contextId,
            fileScope,
        });

        if (!resolvedUrl) {
            return Response.json(
                { error: "Failed to resolve image URL" },
                { status: 404 },
            );
        }

        // Validate URL is from allowed domains
        const urlObj = new URL(resolvedUrl);
        if (!isAllowedBlobDomain(urlObj.hostname)) {
            return Response.json(
                { error: "URL is not from an allowed domain" },
                { status: 403 },
            );
        }

        const range = req.headers.get("range");
        const fetchOptions = {
            redirect: "follow",
            ...(range ? { headers: { Range: range } } : {}),
        };

        // Fetch the media content. Images usually return 200; video/audio
        // previews commonly request ranges and should preserve 206 metadata.
        let response = await fetch(resolvedUrl, fetchOptions);

        // If SAS token expired (403), try to refresh via media-helper
        if (response.status === 403 && contextId) {
            const resolvedBlobPath =
                blobPath ||
                extractBlobPathFromUrl(resolvedUrl) ||
                extractBlobPathFromUrl(url);

            if (fileScope && resolvedBlobPath) {
                resolvedUrl = await resolveImageUrl({
                    url,
                    blobPath: resolvedBlobPath,
                    contextId,
                    fileScope,
                });
                if (resolvedUrl) {
                    response = await fetch(resolvedUrl, fetchOptions);
                }
            } else {
                const hash = extractHashFromBlobUrl(resolvedUrl || url);
                if (resolvedBlobPath || hash) {
                    const refreshed = await fetchShortLivedUrl({
                        blobPath: resolvedBlobPath,
                        hash,
                        contextId,
                    });
                    if (refreshed?.url) {
                        response = await fetch(refreshed.url, fetchOptions);
                    }
                }
            }
        }

        if (!response.ok) {
            return Response.json(
                { error: `Failed to fetch image: ${response.status}` },
                { status: response.status },
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "image/png";
        const responseHeaders = {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=2592000, immutable",
        };

        const contentLength = response.headers.get("content-length");
        const contentRange = response.headers.get("content-range");
        const acceptRanges = response.headers.get("accept-ranges");
        if (contentLength) responseHeaders["Content-Length"] = contentLength;
        if (contentRange) responseHeaders["Content-Range"] = contentRange;
        if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

        // Cache for 30 days — proxy URLs are stable and files are content-addressed (xxHash64)
        return new Response(arrayBuffer, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error("Error in image proxy:", error);
        return Response.json(
            { error: "Failed to fetch image content" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
