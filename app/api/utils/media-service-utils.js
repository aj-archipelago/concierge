import { NextResponse } from "next/server";
import xxhash from "xxhash-wasm";
import config from "../../../config/index.js";

/**
 * Hash a buffer using xxhash64
 * @param {Buffer} buffer - The buffer to hash
 * @returns {Promise<string>} - The hash as a hex string
 */
export async function hashBuffer(buffer) {
    const hasher = await xxhash();
    const xxh64 = hasher.create64();
    xxh64.update(buffer);
    return xxh64.digest().toString(16);
}

/**
 * Set file retention (temporary or permanent) via CFH API
 * @param {string} hash - File hash
 * @param {string} retention - 'temporary' or 'permanent'
 * @param {string} contextId - Context ID for scoping
 * @returns {Promise<Object|null>} Response data or null on error (best-effort)
 */
export async function setFileRetention(hash, retention, contextId) {
    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            console.warn(
                "Media helper URL not configured, skipping retention update",
            );
            return null;
        }

        const setRetentionUrl = new URL(mediaHelperUrl);
        setRetentionUrl.searchParams.set("hash", hash);
        setRetentionUrl.searchParams.set("retention", retention);
        setRetentionUrl.searchParams.set("setRetention", "true");
        if (contextId) {
            setRetentionUrl.searchParams.set("contextId", contextId);
        }

        const response = await fetch(setRetentionUrl.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.warn(
                `Failed to set retention to ${retention} for file ${hash}: ${response.statusText}. Response: ${errorBody}`,
            );
            return null;
        }

        const result = await response.json();
        console.log(
            `Successfully set retention to ${retention} for file ${hash}`,
        );
        return result;
    } catch (error) {
        console.error("Error setting file retention:", error);
        return null;
    }
}

/**
 * Upload buffer to media service
 * @param {Buffer} fileBuffer - The file buffer
 * @param {Object} metadata - File metadata
 * @param {boolean} permanent - If true, file will be marked as permanent (via setRetention after upload)
 * @param {string} contextId - Optional context ID for per-user file scoping
 * @returns {Object} Upload result with data or error
 */
export async function uploadBufferToMediaService(
    fileBuffer,
    metadata,
    permanent = false,
    contextId = null,
) {
    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            throw new Error("Media helper URL is not defined");
        }

        // Create a Blob from the buffer to send as FormData
        const blob = new Blob([fileBuffer], { type: metadata.mimeType });
        const uploadFormData = new FormData();
        uploadFormData.append("file", blob, metadata.filename);

        // Add hash to FormData if provided
        if (metadata.hash) {
            uploadFormData.append("hash", metadata.hash);
        }

        // Add contextId to FormData if provided
        if (contextId) {
            uploadFormData.append("contextId", contextId);
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

        // If permanent flag is set, call setRetention API (best-effort)
        if (permanent && uploadData.hash) {
            await setFileRetention(uploadData.hash, "permanent", contextId);
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
