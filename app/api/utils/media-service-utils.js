import { NextResponse } from "next/server.js";
import xxhash from "xxhash-wasm";
import {
    buildMediaHelperFileParams,
    buildMediaHelperListParams,
    getStorageContextId,
    createSkillStorageTarget,
    createAutomationStorageTarget,
} from "../../../src/utils/storageTargets.js";

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

function getMediaHelperUrl() {
    const mediaHelperUrl =
        process.env.CORTEX_MEDIA_API_URL ||
        (process.env.NODE_ENV === "test" ? "http://media-helper.test" : null);
    if (!mediaHelperUrl) {
        throw new Error("Media helper URL is not defined");
    }
    return mediaHelperUrl;
}

function appendRoutingParams(url, input = {}) {
    const params = buildMediaHelperFileParams(input);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return params;
}

export function buildFileIdentifierAttempts({
    blobPath,
    hash,
    fallbackToHash = true,
} = {}) {
    const attempts = [];

    if (blobPath) {
        attempts.push({ blobPath, identifier: blobPath });
    }
    if (hash && (fallbackToHash || !blobPath)) {
        attempts.push({ hash, identifier: hash });
    }

    return attempts;
}

/**
 * Check if a file exists in CFH.
 * Prefers blobPath when available; falls back to hash.
 * @param {Object} params
 * @param {string} [params.blobPath] - Blob path within the container (preferred)
 * @param {string} [params.hash] - File hash (fallback)
 * @returns {Promise<Object|null>} Response data or null on miss/error
 */
export async function checkMediaFile({ blobPath, hash, ...routing } = {}) {
    if (!blobPath && !hash) {
        return null;
    }

    try {
        for (const attempt of buildFileIdentifierAttempts({ blobPath, hash })) {
            const url = new URL(getMediaHelperUrl());
            if (attempt.blobPath) {
                url.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                url.searchParams.set("hash", attempt.hash);
                url.searchParams.set("checkHash", "true");
            }
            appendRoutingParams(url, routing);

            const response = await fetch(url.toString(), {
                cache: "no-store",
            });
            if (!response.ok) {
                continue;
            }

            const data = await response.json().catch(() => null);
            if (data?.url) {
                return data;
            }
        }

        return null;
    } catch (error) {
        console.error("Error checking file in media service:", error);
        return null;
    }
}

/**
 * Delete a file from CFH.
 * Prefers blobPath when available; falls back to hash.
 * @param {Object} params
 * @param {string} [params.blobPath] - Blob path within the container (preferred)
 * @param {string} [params.hash] - File hash (fallback)
 * @param {boolean} [params.fallbackToHash=true] - Whether to try hash after a blobPath miss
 * @returns {Promise<Object|null>} Response data or null on error
 */
export async function deleteMediaFile({
    blobPath,
    hash,
    fallbackToHash = true,
    ...routing
} = {}) {
    if (!blobPath && !hash) {
        return null;
    }

    try {
        let lastError = null;

        for (const attempt of buildFileIdentifierAttempts({
            blobPath,
            hash,
            fallbackToHash,
        })) {
            const url = new URL(getMediaHelperUrl());
            if (attempt.blobPath) {
                url.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                url.searchParams.set("hash", attempt.hash);
            }
            appendRoutingParams(url, routing);

            const response = await fetch(url.toString(), {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (response.ok) {
                return response.json().catch(() => null);
            }

            const errorBody = await response.text().catch(() => "");
            lastError = new Error(
                `Delete failed for ${attempt.identifier}: ${response.statusText}. Response: ${errorBody}`,
            );
        }

        if (lastError) {
            throw lastError;
        }

        return null;
    } catch (error) {
        console.error("Error deleting file from media service:", error);
        return null;
    }
}

/**
 * Upload buffer to media service
 * @param {Buffer} fileBuffer - The file buffer
 * @param {Object} metadata - File metadata
 * @param {Object} options - Upload options
 * @param {string|null} options.userId - User ID for per-user container scoping
 * @param {string|null} options.workspaceId - Workspace ID for workspace-artifact or applet scoping
 * @param {string|null} options.chatId - Chat ID for chat-scoped files
 * @param {string|null} options.fileScope - File scope: 'global', 'chat', 'applet', 'applets', 'profile', 'articles', 'workspace-artifact'
 * @returns {Object} Upload result with data or error
 */
export async function uploadBufferToMediaService(
    fileBuffer,
    metadata,
    { storageTarget = null, subPath = null, ...routing } = {},
) {
    try {
        const mediaHelperUrl = getMediaHelperUrl();
        const routingParams = buildMediaHelperFileParams({
            storageTarget,
            ...routing,
        });
        const contextId =
            storageTarget || routingParams.fileScope
                ? getStorageContextId({ storageTarget, ...routing })
                : routing.contextId;

        // Create a Blob from the buffer to send as FormData
        const blob = new Blob([fileBuffer], { type: metadata.mimeType });
        const uploadFormData = new FormData();

        // Routing fields MUST be appended before the file so that
        // busboy has parsed them by the time the "file" event fires.
        // Otherwise processFile reads userId/fileScope/subPath as null
        // and the file lands in the wrong container/path.
        for (const [key, value] of Object.entries(routingParams)) {
            if (key === "contextId") continue;
            uploadFormData.append(key, value);
        }
        if (contextId) {
            uploadFormData.append("contextId", contextId);
        }
        if (subPath) {
            uploadFormData.append("subPath", subPath);
        }

        // File must come after routing fields (see above)
        uploadFormData.append("file", blob, metadata.filename);

        // Hash can come after the file — processFile awaits busboyFinished for it
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

async function listScopedFiles({
    userContextId,
    subPath,
    createStorageTarget,
    label,
}) {
    try {
        const url = new URL(getMediaHelperUrl());
        url.searchParams.set("listFolder", "true");
        const storageTarget = createStorageTarget(userContextId);
        const listParams = buildMediaHelperListParams({ storageTarget });
        for (const [key, value] of Object.entries(listParams)) {
            url.searchParams.set(key, value);
        }
        if (subPath) {
            url.searchParams.set("subPath", subPath);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            return [];
        }
        const data = await response.json();
        return data.files || [];
    } catch (error) {
        console.error(`Error listing ${label} files:`, error);
        return [];
    }
}

/**
 * List files in a skill's directory in blob storage.
 * @param {string} userContextId - The user's context ID
 * @param {string} skillName - The skill name (used as subPath under skills/)
 * @returns {Promise<Array>} Array of file objects { name, filename, url, size, contentType }
 */
export async function listSkillFiles(userContextId, skillName) {
    return listScopedFiles({
        userContextId,
        subPath: skillName,
        createStorageTarget: createSkillStorageTarget,
        label: "skill",
    });
}

/**
 * List files in an automation's directory in blob storage.
 * @param {string} userContextId - The user's context ID
 * @param {string} automationSlug - The automation slug
 * @returns {Promise<Array>} Array of file objects
 */
export async function listAutomationFiles(userContextId, automationSlug) {
    return listScopedFiles({
        userContextId,
        subPath: automationSlug,
        createStorageTarget: createAutomationStorageTarget,
        label: "automation",
    });
}

/**
 * Read the text content of a blob by its path.
 * @param {string} blobPath - The blob path within the container
 * @param {Object} storageTarget - Storage target for routing
 * @returns {Promise<string|null>} The file's text content or null
 */
export async function readBlobContent(blobPath, storageTarget) {
    try {
        const fileInfo = await checkMediaFile({ blobPath, storageTarget });
        if (!fileInfo?.url) {
            return null;
        }
        const response = await fetch(fileInfo.url, {
            cache: "no-store",
        });
        if (!response.ok) {
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error("Error reading blob content:", error);
        return null;
    }
}
