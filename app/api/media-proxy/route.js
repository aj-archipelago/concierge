import { getCurrentUser } from "../utils/auth.js";
import {
    fetchShortLivedUrl,
    extractBlobPathFromUrl,
    extractHashFromBlobUrl,
    isAllowedBlobDomain,
    sanitizeFilename,
} from "../utils/llm-file-utils.js";
import archiver from "archiver";
import mime from "mime-types";

/**
 * Determine file extension from content-type header or URL.
 * @param {string} contentType - Content-Type header value
 * @param {string} url - File URL
 * @returns {string} Extension with dot, e.g. ".pdf"
 */
function getExtensionFromResponse(contentType, url) {
    // Try content-type first
    if (contentType) {
        const mimeBase = contentType.split(";")[0].trim();
        const ext = mime.extension(mimeBase);
        if (ext) return `.${ext}`;
    }
    // Fallback: extract from URL path
    try {
        const pathname = new URL(url).pathname;
        const lastDot = pathname.lastIndexOf(".");
        if (lastDot > 0) {
            const ext = pathname.slice(lastDot).split("?")[0].toLowerCase();
            if (ext.length <= 5) return ext;
        }
    } catch {
        // ignore
    }
    return ".bin";
}

export async function POST(req) {
    const user = await getCurrentUser();

    // Validate authentication
    if (!user) {
        return Response.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    try {
        const body = await req.json();
        // Support both old format (urls array) and new format (files array with url and filename)
        const { urls, files } = body;

        // Normalize to new format
        let fileData = [];
        if (files && Array.isArray(files)) {
            fileData = files;
        } else if (urls && Array.isArray(urls)) {
            // Legacy format: convert URLs array to file data format
            fileData = urls.map((url) => ({ url, filename: null }));
        } else {
            return Response.json(
                {
                    error: "Invalid request: must provide 'urls' or 'files' array",
                },
                { status: 400 },
            );
        }

        if (fileData.length === 0) {
            return Response.json(
                { error: "No files provided" },
                { status: 400 },
            );
        }

        // Validate all URLs are from allowed domains
        for (const fileInfo of fileData) {
            try {
                const urlObj = new URL(fileInfo.url);
                if (!isAllowedBlobDomain(urlObj.hostname)) {
                    return Response.json(
                        {
                            error: `URL is not from an allowed domain: ${urlObj.hostname}`,
                        },
                        { status: 403 },
                    );
                }
            } catch {
                return Response.json(
                    { error: "Invalid URL in request" },
                    { status: 400 },
                );
            }
        }

        // Apply reasonable limits
        const MAX_FILES = 100;
        const MAX_TOTAL_SIZE_MB = 1000; // 1GB limit
        const MAX_TOTAL_SIZE_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;

        if (fileData.length > MAX_FILES) {
            return Response.json(
                {
                    error: "Too many files selected. Maximum 100 files allowed.",
                },
                { status: 400 },
            );
        }

        // Create a ZIP archive
        const archive = archiver("zip", {
            zlib: { level: 9 }, // Maximum compression
        });

        // Collect all promises for fetching files
        const fetchPromises = fileData.map(async (fileInfo, index) => {
            const { url, filename: providedFilename } = fileInfo;
            try {
                let response = await fetch(url);

                // If SAS token expired, try to refresh via media-helper
                if (response.status === 403) {
                    const blobPath = extractBlobPathFromUrl(url);
                    const hash = extractHashFromBlobUrl(url);
                    // Use per-file contextId (workspace artifacts use workspaceId), fall back to user's contextId
                    const contextId = fileInfo.contextId || user.contextId;
                    if ((blobPath || hash) && contextId) {
                        const refreshed = await fetchShortLivedUrl({
                            blobPath,
                            hash,
                            contextId,
                        });
                        if (refreshed?.url) {
                            response = await fetch(refreshed.url);
                        }
                    }
                }

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`,
                    );
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const contentType = response.headers.get("content-type") || "";

                // Determine filename
                let filename;
                if (providedFilename) {
                    filename = providedFilename;
                    // Add extension if missing
                    if (!filename.includes(".")) {
                        filename += getExtensionFromResponse(contentType, url);
                    }
                } else {
                    const extension = getExtensionFromResponse(
                        contentType,
                        url,
                    );
                    // Use index for uniqueness instead of Date.now() (avoids collisions)
                    filename = `media_${index + 1}${extension}`;
                }

                filename = sanitizeFilename(filename);

                return {
                    filename,
                    buffer,
                    success: true,
                };
            } catch (error) {
                console.error(`Failed to fetch ${url}:`, error);
                return {
                    url,
                    error: error.message,
                    success: false,
                };
            }
        });

        // Wait for all files to be fetched
        const results = await Promise.all(fetchPromises);

        // Filter successful results and check total size
        const successfulResults = results.filter((result) => result.success);

        if (successfulResults.length === 0) {
            return Response.json(
                { error: "No files were successfully fetched" },
                { status: 400 },
            );
        }

        // Check total size limit
        const totalSize = successfulResults.reduce(
            (sum, result) => sum + result.buffer.length,
            0,
        );
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            const totalSizeMB = Math.round(totalSize / (1024 * 1024));
            return Response.json(
                {
                    error: `Total file size too large. Selected files are ${totalSizeMB}MB, maximum allowed is ${MAX_TOTAL_SIZE_MB}MB.`,
                },
                { status: 400 },
            );
        }

        // Add files to archive
        successfulResults.forEach((result) => {
            archive.append(result.buffer, { name: result.filename });
        });

        // Finalize the archive
        archive.finalize();

        // Convert archive to buffer
        const chunks = [];
        archive.on("data", (chunk) => chunks.push(chunk));

        await new Promise((resolve, reject) => {
            archive.on("end", resolve);
            archive.on("error", reject);
        });

        const zipBuffer = Buffer.concat(chunks);

        // Return the ZIP file as a downloadable response
        return new Response(zipBuffer, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="media_download_${Date.now()}.zip"`,
                "Content-Length": zipBuffer.length.toString(),
            },
        });
    } catch (error) {
        console.error("Error in media proxy:", error);
        return Response.json(
            { error: "Failed to create ZIP file" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
