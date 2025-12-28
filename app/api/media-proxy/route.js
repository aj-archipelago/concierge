import { getCurrentUser } from "../utils/auth.js";
import archiver from "archiver";

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

        console.log(`Creating ZIP with ${fileData.length} files`);

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
                console.log(`Fetching file ${index + 1}: ${url}`);
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`,
                    );
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                console.log(
                    `Successfully fetched ${url}, size: ${buffer.length} bytes`,
                );

                // Use provided filename if available, otherwise determine from content-type or URL
                let filename;
                if (providedFilename) {
                    // Use provided filename, but ensure it has an extension
                    filename = providedFilename;
                    // If no extension, try to determine from content-type
                    if (!filename.includes(".")) {
                        const contentType =
                            response.headers.get("content-type") || "";
                        let extension = "";
                        if (contentType.includes("video/mp4"))
                            extension = ".mp4";
                        else if (contentType.includes("video/webm"))
                            extension = ".webm";
                        else if (contentType.includes("image/png"))
                            extension = ".png";
                        else if (contentType.includes("image/jpeg"))
                            extension = ".jpg";
                        else if (contentType.includes("image/gif"))
                            extension = ".gif";
                        else if (url.includes(".mp4")) extension = ".mp4";
                        else if (url.includes(".webm")) extension = ".webm";
                        else if (url.includes(".png")) extension = ".png";
                        else if (url.includes(".jpg") || url.includes(".jpeg"))
                            extension = ".jpg";
                        else if (url.includes(".gif")) extension = ".gif";
                        else extension = ".png"; // Default
                        filename = filename + extension;
                    }
                } else {
                    // Determine file extension from content-type or URL
                    let extension = "";
                    const contentType =
                        response.headers.get("content-type") || "";

                    if (contentType.includes("video/mp4")) {
                        extension = ".mp4";
                    } else if (contentType.includes("video/webm")) {
                        extension = ".webm";
                    } else if (contentType.includes("image/png")) {
                        extension = ".png";
                    } else if (contentType.includes("image/jpeg")) {
                        extension = ".jpg";
                    } else if (contentType.includes("image/gif")) {
                        extension = ".gif";
                    } else {
                        // Fallback to URL-based detection
                        if (url.includes(".mp4")) extension = ".mp4";
                        else if (url.includes(".webm")) extension = ".webm";
                        else if (url.includes(".png")) extension = ".png";
                        else if (url.includes(".jpg") || url.includes(".jpeg"))
                            extension = ".jpg";
                        else if (url.includes(".gif")) extension = ".gif";
                        else extension = ".png"; // Default
                    }

                    filename = `media_${index + 1}_${Date.now()}${extension}`;
                }

                // Sanitize filename to prevent path traversal and invalid characters
                filename = filename
                    // eslint-disable-next-line no-control-regex
                    .replace(/[<>:"|?*\x00-\x1f]/g, "_") // Replace invalid chars
                    .replace(/\.\./g, "_") // Prevent path traversal
                    .replace(/^\/+/, ""); // Remove leading slashes

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

        console.log(
            `Adding ${successfulResults.length} files to ZIP archive (${Math.round(totalSize / (1024 * 1024))}MB total)`,
        );

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
        console.log(`ZIP file created, size: ${zipBuffer.length} bytes`);

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
