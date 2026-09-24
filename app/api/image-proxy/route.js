import { getCurrentUser } from "../utils/auth.js";
import {
    fetchShortLivedUrl,
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
    fetchAllowedBlobUrl,
    validateAllowedBlobUrl,
} from "../utils/llm-file-utils.js";
import { checkMediaFile } from "../utils/media-service-utils.js";
import { resolveStorageTarget } from "../../../src/utils/storageTargets.js";
import {
    resolveProfileImageRefreshTarget,
    matchesProfileImageTarget,
} from "../utils/profile-image";
import {
    isGeneratedAppletCoverUrl,
    isSameCoverBlob,
    resolveAppletCoverRefreshTarget,
} from "../canvas-applets/cover-image";

// Targets come only from saved-image provenance checks, never request parameters.
function savedImageAuthorization(user, target) {
    return {
        user: { contextId: user.contextId || "concierge:shared-image" },
        routing: { contextId: target.contextId, fileScope: "all" },
        targets: [
            {
                owner: target.contextId,
                path: target.blobPath,
                actions: ["read"],
            },
        ],
    };
}

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
        const download = searchParams.get("download") === "1";

        if (!url && !blobPath) {
            return Response.json(
                { error: "A file URL or blobPath is required" },
                { status: 400 },
            );
        }

        const generatedCover = isGeneratedAppletCoverUrl(url);
        const profileTarget = generatedCover
            ? null
            : await resolveProfileImageRefreshTarget(user, {
                  url,
                  blobPath,
                  contextId,
                  fileScope,
              });

        // Cover URLs carry their own blob identity. Never resolve them through
        // caller-supplied storage hints before checking app access/provenance.
        let resolvedUrl = profileTarget
            ? (
                  await fetchShortLivedUrl({
                      ...profileTarget,
                      storageAuthorization: savedImageAuthorization(
                          user,
                          profileTarget,
                      ),
                  })
              )?.url
            : generatedCover
              ? url
              : await resolveImageUrl({
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

        if (
            profileTarget &&
            !matchesProfileImageTarget(resolvedUrl, profileTarget)
        ) {
            return Response.json(
                { error: "Refreshed profile does not match the saved image" },
                { status: 502 },
            );
        }

        validateAllowedBlobUrl(resolvedUrl);

        const range = req.headers.get("range");
        const fetchOptions = {
            ...(range ? { headers: { Range: range } } : {}),
        };

        // Fetch the media content. Images usually return 200; video/audio
        // previews commonly request ranges and should preserve 206 metadata.
        let response = await fetchAllowedBlobUrl(resolvedUrl, fetchOptions);

        let renewedAppletCover = Boolean(profileTarget);
        // Generated covers belong to their creator, which may differ from the viewer.
        if (response.status === 403) {
            const coverTarget = await resolveAppletCoverRefreshTarget(
                user,
                resolvedUrl,
            );
            const refreshContextId = coverTarget?.contextId || contextId;
            const resolvedBlobPath =
                coverTarget?.blobPath ||
                blobPath ||
                extractBlobPathFromUrl(resolvedUrl) ||
                extractBlobPathFromUrl(url);

            if (
                !coverTarget &&
                fileScope &&
                resolvedBlobPath &&
                refreshContextId
            ) {
                resolvedUrl = await resolveImageUrl({
                    url,
                    blobPath: resolvedBlobPath,
                    contextId: refreshContextId,
                    fileScope,
                });
                if (resolvedUrl) {
                    response = await fetchAllowedBlobUrl(
                        resolvedUrl,
                        fetchOptions,
                    );
                }
            } else if (refreshContextId) {
                const hash = coverTarget
                    ? null
                    : extractHashFromBlobUrl(resolvedUrl || url);
                if (resolvedBlobPath || hash) {
                    const refreshed = await fetchShortLivedUrl({
                        blobPath: resolvedBlobPath,
                        hash,
                        contextId: refreshContextId,
                        ...(coverTarget
                            ? {
                                  storageAuthorization: savedImageAuthorization(
                                      user,
                                      coverTarget,
                                  ),
                              }
                            : {}),
                    });
                    if (refreshed?.url) {
                        if (
                            coverTarget &&
                            !isSameCoverBlob(resolvedUrl, refreshed.url)
                        ) {
                            throw Object.assign(
                                new Error(
                                    "Refreshed cover does not match the saved image",
                                ),
                                { status: 502 },
                            );
                        }
                        response = await fetchAllowedBlobUrl(
                            refreshed.url,
                            fetchOptions,
                        );
                        renewedAppletCover = Boolean(coverTarget);
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
            "Cache-Control": renewedAppletCover
                ? "private, max-age=300"
                : "public, max-age=2592000, immutable",
        };

        if (download) {
            let filename = "download";
            try {
                filename =
                    decodeURIComponent(
                        new URL(resolvedUrl).pathname.split("/").pop(),
                    ) || filename;
            } catch {
                // Keep a safe fallback for malformed legacy filenames.
            }
            const encodedFilename = encodeURIComponent(filename).replace(
                /['()*]/g,
                (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
            );
            // Generated HTML must download, never execute on the app origin.
            responseHeaders["Content-Disposition"] =
                `attachment; filename="download"; filename*=UTF-8''${encodedFilename}`;
            responseHeaders["Content-Security-Policy"] = "sandbox";
            responseHeaders["X-Content-Type-Options"] = "nosniff";
            responseHeaders["Cache-Control"] = "private, no-store";
        }

        const contentLength = response.headers.get("content-length");
        const contentRange = response.headers.get("content-range");
        const acceptRanges = response.headers.get("accept-ranges");
        if (contentLength) responseHeaders["Content-Length"] = contentLength;
        if (contentRange) responseHeaders["Content-Range"] = contentRange;
        if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

        // Renewed app covers stay in the viewer's private cache for five minutes.
        return new Response(arrayBuffer, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error) {
        if (error.status) {
            return Response.json(
                { error: error.message },
                { status: error.status },
            );
        }
        console.error("Error in image proxy:", error);
        return Response.json(
            { error: "Failed to fetch image content" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
