import { NextResponse } from "next/server";
import xxhash from "xxhash-wasm";
import config from "../../../config/index.js";
import File from "../models/file.js";
import { getCurrentUser } from "./auth.js";
import {
    analyzeFileContent,
    FILE_VALIDATION_CONFIG,
    scanForMalware,
} from "./fileValidation.js";

import Busboy from "busboy";
import { Readable } from "stream";

// Export for testing memory logging
export const memoryLogger = {
    log: (heapUsed, rss) => {
        // Memory logging removed
    },
};

/**
 * Hash a buffer using xxhash64
 * @param {Buffer} buffer - The buffer to hash
 * @returns {Promise<string>} - The hash as a hex string
 */
async function hashBuffer(buffer) {
    const hasher = await xxhash();
    const xxh64 = hasher.create64();
    xxh64.update(buffer);
    return xxh64.digest().toString(16);
}

/**
 * Streaming file upload handler with validation during upload
 * @param {Request} request - The Next.js request object
 * @param {Object} options - Configuration options
 * @param {Function} options.getWorkspace - Function to retrieve workspace
 * @param {Function} options.checkAuthorization - Function to check user authorization
 * @param {Function} options.associateFile - Function to associate file with workspace/applet
 * @param {string} options.errorPrefix - Prefix for error messages
 * @param {boolean} options.permanent - If true, use permanent storage container
 * @returns {Object} Upload result with file data or error response
 */
export async function handleStreamingFileUpload(request, options) {
    const {
        getWorkspace,
        checkAuthorization,
        associateFile,
        errorPrefix = "streaming file upload",
        permanent = false,
    } = options;

    try {
        // Get workspace first
        const workspace = await getWorkspace();
        if (!workspace) {
            return {
                error: NextResponse.json(
                    { error: "Workspace not found" },
                    { status: 404 },
                ),
            };
        }

        // Get current user
        const user = await getCurrentUser();

        // Check authorization if provided
        if (checkAuthorization) {
            const authResult = await checkAuthorization(workspace, user);
            if (authResult.error) {
                return { error: authResult.error };
            }
        }

        // Parse the streaming multipart data
        const result = await parseStreamingMultipart(request, user);
        if (result.error) {
            return { error: result.error };
        }

        const { fileBuffer, metadata } = result.data;

        // Check if file already exists using hash
        if (metadata.hash) {
            try {
                const mediaHelperUrl = config.endpoints.mediaHelperDirect();
                const checkUrl = new URL(mediaHelperUrl);
                checkUrl.searchParams.set("hash", metadata.hash);
                checkUrl.searchParams.set("checkHash", "true");
                if (permanent) {
                    checkUrl.searchParams.set(
                        "container",
                        process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME,
                    );
                }

                const checkResponse = await fetch(checkUrl);

                if (checkResponse.ok) {
                    const checkData = await checkResponse
                        .json()
                        .catch(() => null);
                    if (checkData && checkData.url) {
                        // Create a new File document with existing file data
                        const newFile = new File({
                            filename: checkData.filename || metadata.filename,
                            originalName: metadata.filename,
                            mimeType: metadata.mimeType,
                            size: metadata.size,
                            url: checkData.converted
                                ? checkData.converted.url
                                : checkData.url,
                            gcsUrl: checkData.converted
                                ? checkData.converted.gcs
                                : checkData.gcs,
                            hash: metadata.hash,
                            owner: user._id,
                        });

                        await newFile.save();

                        // Associate file with workspace/applet
                        const associationResult = await associateFile(
                            newFile,
                            workspace,
                            user,
                        );
                        if (associationResult.error) {
                            return { error: associationResult.error };
                        }

                        // Use the file from associationResult if provided (for duplicates), otherwise use newFile
                        const fileToReturn = associationResult.file || newFile;

                        const responseData = {
                            success: true,
                            file: fileToReturn,
                            files: associationResult.files,
                        };

                        return { success: true, data: responseData };
                    }
                }
            } catch (error) {
                console.error("Error checking file hash:", error);
                // Continue with upload even if hash check fails
            }
        }

        // Determine container name based on permanent flag
        const containerName = permanent
            ? process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME
            : undefined;

        // Upload file to media service using buffer
        const uploadResult = await uploadBufferToMediaService(
            fileBuffer,
            metadata,
            containerName,
        );
        if (uploadResult.error) {
            return { error: uploadResult.error };
        }

        const { data } = uploadResult;
        const { converted } = data;

        let { url, gcs: gcsUrl } = data;

        if (converted) {
            url = converted.url;
            gcsUrl = converted.gcs;
        }

        // Create a new File document
        const newFile = new File({
            filename: uploadResult.data.filename || metadata.filename,
            originalName: metadata.filename,
            mimeType: metadata.mimeType,
            size: metadata.size,
            url: url,
            gcsUrl: gcsUrl,
            hash: uploadResult.data.hash || metadata.hash, // Use hash from upload response or computed hash from file
            owner: user._id,
        });

        await newFile.save();

        // Associate file with workspace/applet
        const associationResult = await associateFile(newFile, workspace, user);
        if (associationResult.error) {
            return { error: associationResult.error };
        }

        // Use the file from associationResult if provided (for duplicates), otherwise use newFile
        const fileToReturn = associationResult.file || newFile;

        const responseData = {
            success: true,
            file: fileToReturn,
            files: associationResult.files,
        };

        return { success: true, data: responseData };
    } catch (error) {
        console.error(`Error during ${errorPrefix}:`, error);

        return {
            error: NextResponse.json(
                { error: `Failed to upload file: ${error.message}` },
                { status: 500 },
            ),
        };
    }
}

/**
 * Parse multipart form data with streaming validation
 * @param {Request} request - The Next.js request object
 * @param {Object} user - Current user for storage validation
 * @returns {Object} Parsed file data or error
 */
export async function parseStreamingMultipart(request, user) {
    return new Promise((resolve, reject) => {
        try {
            const contentType = request.headers.get("content-type");
            if (!contentType || !contentType.includes("multipart/form-data")) {
                resolve({
                    error: NextResponse.json(
                        { error: "Content-Type must be multipart/form-data" },
                        { status: 400 },
                    ),
                });
                return;
            }

            const busboy = Busboy({
                headers: {
                    "content-type": contentType,
                },
                limits: {
                    fileSize: FILE_VALIDATION_CONFIG.MAX_FILE_SIZE * 2, // Set busboy limit higher than our custom validation
                    files: 1, // Only allow one file at a time
                    fields: 5, // Limit form fields
                    fieldSize: 1024 * 100, // 100KB max field size
                },
            });

            let fileData = null;
            let chunks = [];
            let totalSize = 0;
            let metadata = {};
            let validationError = null;

            // Handle file upload with streaming validation
            busboy.on("file", (fieldname, file, fileInfo) => {
                const { filename, encoding, mimeType } = fileInfo;

                metadata = {
                    fieldname,
                    filename,
                    encoding,
                    mimeType,
                    size: 0,
                };

                // Validate file extension early
                const fileExtension = filename
                    .toLowerCase()
                    .substring(filename.lastIndexOf("."));
                if (
                    FILE_VALIDATION_CONFIG.BLOCKED_EXTENSIONS.includes(
                        fileExtension,
                    )
                ) {
                    validationError = NextResponse.json(
                        {
                            error: "File validation failed",
                            details: [
                                `File extension '${fileExtension}' is not allowed for security reasons`,
                            ],
                        },
                        { status: 400 },
                    );
                    file.resume(); // Drain the stream
                    return;
                }

                // Validate MIME type early
                if (
                    !FILE_VALIDATION_CONFIG.ALLOWED_MIME_TYPES.includes(
                        mimeType,
                    )
                ) {
                    validationError = NextResponse.json(
                        {
                            error: "File validation failed",
                            details: [`File type '${mimeType}' is not allowed`],
                        },
                        { status: 400 },
                    );
                    file.resume(); // Drain the stream
                    return;
                }

                // Stream data with size validation
                file.on("data", (chunk) => {
                    if (validationError) return; // Skip if already invalid

                    totalSize += chunk.length;
                    metadata.size = totalSize;

                    // Real-time size validation
                    if (totalSize > FILE_VALIDATION_CONFIG.MAX_FILE_SIZE) {
                        validationError = NextResponse.json(
                            {
                                error: "File validation failed",
                                details: [
                                    `File size exceeds maximum limit of ${(FILE_VALIDATION_CONFIG.MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB`,
                                ],
                            },
                            { status: 400 },
                        );
                        file.resume(); // Drain the stream
                        return;
                    }

                    // Store chunks for processing
                    chunks.push(chunk);
                });

                file.on("end", () => {
                    if (!validationError) {
                        fileData = Buffer.concat(chunks);
                    }
                });

                file.on("error", (error) => {
                    console.error("File stream error:", error);
                    validationError = NextResponse.json(
                        { error: "File upload stream error" },
                        { status: 500 },
                    );
                });
            });

            // Handle form fields
            busboy.on("field", (fieldname, value) => {
                // Store any additional form data if needed
                metadata[fieldname] = value;
            });

            // Handle busboy completion
            busboy.on("finish", async () => {
                if (validationError) {
                    resolve({ error: validationError });
                    return;
                }

                if (!fileData) {
                    resolve({
                        error: NextResponse.json(
                            { error: "No file provided in request" },
                            { status: 400 },
                        ),
                    });
                    return;
                }

                // Additional validations after streaming is complete
                if (metadata.size === 0) {
                    resolve({
                        error: NextResponse.json(
                            { error: "File cannot be empty" },
                            { status: 400 },
                        ),
                    });
                    return;
                }

                // Content analysis for security risks
                const mockFile = {
                    name: metadata.filename,
                    type: metadata.mimeType,
                    size: metadata.size,
                };
                const contentAnalysis = analyzeFileContent(mockFile);

                // Malware scanning (placeholder)
                const malwareScan = await scanForMalware(mockFile);
                if (!malwareScan.clean) {
                    resolve({
                        error: NextResponse.json(
                            {
                                error: "Security threat detected",
                                details: "File failed malware scan",
                            },
                            { status: 400 },
                        ),
                    });
                    return;
                }

                // Compute hash from file buffer
                const computedHash = await hashBuffer(fileData);

                // Log memory usage for observability in tests and diagnostics
                try {
                    const { heapUsed, rss } = process.memoryUsage();
                    memoryLogger.log(heapUsed, rss);
                } catch (e) {
                    // noop: process.memoryUsage may not be available in some environments
                }

                resolve({
                    success: true,
                    data: {
                        file: mockFile,
                        fileBuffer: fileData,
                        metadata: {
                            ...metadata,
                            hash: computedHash,
                        },
                        contentAnalysis,
                    },
                });
            });

            busboy.on("error", (error) => {
                console.error("Busboy error:", error);
                resolve({
                    error: NextResponse.json(
                        { error: "Failed to parse multipart data" },
                        { status: 400 },
                    ),
                });
            });

            // Convert Next.js Request to Node.js readable stream
            const stream = Readable.fromWeb(request.body);
            stream.pipe(busboy);
        } catch (error) {
            console.error("Error setting up streaming parser:", error);
            resolve({
                error: NextResponse.json(
                    { error: "Failed to initialize streaming upload" },
                    { status: 500 },
                ),
            });
        }
    });
}

/**
 * Upload buffer to media service
 * @param {Buffer} fileBuffer - The file buffer
 * @param {Object} metadata - File metadata
 * @param {string} containerName - Optional container name for storage
 * @returns {Object} Upload result with data or error
 */
export async function uploadBufferToMediaService(
    fileBuffer,
    metadata,
    containerName,
) {
    try {
        let mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            throw new Error("Media helper URL is not defined");
        }

        // Add container name to query string if provided
        if (containerName) {
            const url = new URL(mediaHelperUrl);
            url.searchParams.append("container", containerName);
            mediaHelperUrl = url.toString();
        }

        // Create a Blob from the buffer to send as FormData
        const blob = new Blob([fileBuffer], { type: metadata.mimeType });
        const uploadFormData = new FormData();
        uploadFormData.append("file", blob, metadata.filename);

        // Add hash to FormData if provided
        if (metadata.hash) {
            uploadFormData.append("hash", metadata.hash);
        }

        const uploadResponse = await fetch(mediaHelperUrl, {
            method: "POST",
            body: uploadFormData,
        });

        if (!uploadResponse.ok) {
            const errorBody = await uploadResponse.text();
            throw new Error(
                `Upload failed: ${uploadResponse.statusText}. Response body: ${errorBody}`,
            );
        }

        const uploadData = await uploadResponse.json();

        // Validate upload response
        if (!uploadData.url) {
            throw new Error("Media file upload failed: Missing URL");
        }

        return { success: true, data: uploadData };
    } catch (error) {
        console.error("Error uploading to media service:", error);
        return {
            error: NextResponse.json(
                {
                    error:
                        "Failed to upload to media service: " + error.message,
                },
                { status: 500 },
            ),
        };
    }
}
