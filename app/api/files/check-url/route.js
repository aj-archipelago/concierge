import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth.js";
import { checkMediaFile } from "../../utils/media-service-utils.js";
import { resolveAuthorizedMediaRouting } from "../../utils/file-route-utils.js";
import {
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
    isAllowedBlobDomain,
} from "../../utils/llm-file-utils.js";

function validateProbeUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { ok: false, reason: "Invalid URL format" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, reason: "Invalid URL format" };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, reason: "Invalid URL format" };
    }
    if (!isAllowedBlobDomain(parsed.hostname)) {
        return { ok: false, reason: "URL is not from an allowed domain" };
    }
    return { ok: true };
}

/**
 * Redact sensitive query parameters from URL for logging
 */
function redactUrl(url) {
    try {
        const parsed = new URL(url);
        // Redact common sensitive params (SAS tokens, API keys, etc.)
        const sensitiveParams = ["sig", "sv", "se", "st", "sp", "sr", "spr"];
        sensitiveParams.forEach((param) => {
            if (parsed.searchParams.has(param)) {
                parsed.searchParams.set(param, "[REDACTED]");
            }
        });
        return parsed.toString();
    } catch {
        return "[INVALID_URL]";
    }
}

function normalizeResolvedMediaFile(file) {
    if (!file?.url) {
        return file;
    }

    try {
        const parsedUrl = new URL(file.url);
        if (!isAllowedBlobDomain(parsedUrl.hostname)) {
            return file;
        }
    } catch {
        return file;
    }

    const blobPathFromUrl = extractBlobPathFromUrl(file.url);
    if (!blobPathFromUrl || blobPathFromUrl === file.blobPath) {
        return file;
    }

    return {
        ...file,
        blobPath: blobPathFromUrl,
    };
}

/**
 * Check if a file URL exists by making a server-side request.
 * Tries canonical CFH lookup first when hash/blobPath + routing are available,
 * then falls back to probing the raw URL.
 * Uses POST to avoid logging sensitive URLs in server logs.
 *
 * Body:
 * - url: File URL to check (optional when hash/blobPath is provided)
 * - hash: File hash for canonical lookup (optional)
 * - blobPath: Blob path for canonical lookup (optional)
 * - contextId/userId/workspaceId/chatId/fileScope: Optional routing hints
 */
async function checkRawUrlExists(fileUrl) {
    // Validate URL format
    const url = new URL(fileUrl);

    // Check if file exists by making a HEAD request
    // If HEAD fails, try GET with range request (more efficient than full download)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
        // Try HEAD first (most efficient)
        const headResponse = await fetch(url.toString(), {
            method: "HEAD",
            redirect: "follow",
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (headResponse.ok) {
            return true;
        }

        // If HEAD returns 404, file doesn't exist
        if (headResponse.status === 404) {
            return false;
        }

        // If HEAD fails for other reasons, try GET with range request
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), 5000);

        try {
            const getResponse = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    // Request only first byte to check existence
                    // Note: Some servers may ignore Range header and return full file (200 OK)
                    // instead of partial content (206). The 5-second timeout limits impact.
                    Range: "bytes=0-0",
                },
                redirect: "follow",
                signal: getController.signal,
            });

            clearTimeout(getTimeoutId);

            if (getResponse.ok || getResponse.status === 206) {
                // 206 is Partial Content, which means file exists
                return true;
            }

            if (getResponse.status === 404) {
                return false;
            }

            // For other status codes, assume file doesn't exist to be safe
            return false;
        } catch (getError) {
            clearTimeout(getTimeoutId);
            throw getError;
        }
    } catch (error) {
        clearTimeout(timeoutId);
        // Network errors, timeouts, etc. - assume file doesn't exist
        if (error.name === "AbortError") {
            console.warn(`Timeout checking file URL: ${redactUrl(fileUrl)}`);
        } else {
            console.warn(
                `Error checking file URL ${redactUrl(fileUrl)}:`,
                error.message,
            );
        }
        return false;
    }
}

export async function POST(request) {
    try {
        // Get current user for authentication
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const fileUrl = body?.url || null;
        const hash = body?.hash || null;
        const blobPath = body?.blobPath || null;
        const resolvedBlobPath =
            blobPath || (fileUrl ? extractBlobPathFromUrl(fileUrl) : null);
        const resolvedHash =
            hash || (fileUrl ? extractHashFromBlobUrl(fileUrl) : null);
        const routingInput = {
            contextId: body?.contextId,
            userId: body?.userId,
            workspaceId: body?.workspaceId,
            chatId: body?.chatId,
            fileScope: body?.fileScope,
        };

        if (!fileUrl && !hash && !blobPath) {
            return NextResponse.json(
                {
                    error: "At least one of url, hash, or blobPath is required",
                },
                { status: 400 },
            );
        }

        if (resolvedHash || resolvedBlobPath) {
            try {
                const { storageTarget } = await resolveAuthorizedMediaRouting({
                    user,
                    routingInput,
                });
                const resolvedFile = await checkMediaFile({
                    blobPath: resolvedBlobPath,
                    hash: resolvedHash,
                    storageTarget,
                });

                if (resolvedFile?.url) {
                    return NextResponse.json({
                        exists: true,
                        source: "canonical",
                        file: normalizeResolvedMediaFile(resolvedFile),
                    });
                }

                // Some pre-rollout files exist only in CFH's legacy global
                // Redis hash map. If scoped lookup misses, try the bare hash
                // before falling back to a stale URL probe.
                if (resolvedHash) {
                    const legacyFile = await checkMediaFile({
                        hash: resolvedHash,
                    });

                    if (legacyFile?.url) {
                        return NextResponse.json({
                            exists: true,
                            source: "legacy-hash",
                            file: normalizeResolvedMediaFile(legacyFile),
                        });
                    }
                }
            } catch (error) {
                if (error?.status) {
                    return NextResponse.json(
                        { error: error.message },
                        { status: error.status },
                    );
                }

                console.warn(
                    "Canonical file lookup failed during check-url:",
                    error?.message || error,
                );
            }
        }

        if (!fileUrl) {
            return NextResponse.json({
                exists: false,
                source: null,
            });
        }

        const urlCheck = validateProbeUrl(fileUrl);
        if (!urlCheck.ok) {
            return NextResponse.json(
                { error: urlCheck.reason },
                { status: 400 },
            );
        }

        const exists = await checkRawUrlExists(fileUrl);
        return NextResponse.json({
            exists,
            source: "url",
        });
    } catch (error) {
        console.error("Error in check-url endpoint:", error);
        return NextResponse.json(
            {
                error: "Internal server error while checking file URL",
                details: error.message,
            },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
