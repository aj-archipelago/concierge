import config from "../../../config";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../src/utils/fileAccessPlanUtils.js";
import {
    buildMediaHelperFileParams,
    createAppletSharedStorageTarget,
    createAppletUserStorageTarget,
    createUserGlobalStorageTarget,
    createWorkspacePrivateStorageTarget,
    createWorkspaceSharedStorageTarget,
    getStorageContextId,
    resolveStorageTarget,
} from "../../../src/utils/storageTargets.js";
import { resolveAndHealFile } from "./file-resolution-utils.js";

/**
 * Allowed blob storage domains for proxy routes.
 * Used by image-proxy, text-proxy, and media-proxy to validate URLs.
 */
export const ALLOWED_BLOB_DOMAINS = [
    "blob.core.windows.net",
    "storage.googleapis.com",
    "storage.cloud.google.com",
    "127.0.0.1", // Azurite local development
    "localhost", // Azurite local development
];

/**
 * Check if a hostname is from an allowed blob storage domain.
 * Uses exact match or subdomain match (e.g., "foo.blob.core.windows.net" matches "blob.core.windows.net").
 * @param {string} hostname - The hostname to check
 * @returns {boolean}
 */
export function isAllowedBlobDomain(hostname) {
    return ALLOWED_BLOB_DOMAINS.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
    });
}

/** Characters that are invalid in filenames (cross-platform). */
// eslint-disable-next-line no-control-regex
export const INVALID_FILENAME_CHARS = /[<>:"|?*\x00-\x1f]/g;

/**
 * Sanitize a filename: remove invalid characters and prevent path traversal.
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename) {
    return filename
        .replace(INVALID_FILENAME_CHARS, "_")
        .replace(/\.\./g, "_")
        .replace(/^\/+/, "");
}

/**
 * Determine file routing — which container and folder a file should go to.
 * Returns an object with explicit fields for container and folder derivation.
 *
 * @param {Object} options
 * @param {boolean} options.isArtifact - Workspace artifacts (permanent, per-workspace container)
 * @param {string|null} options.workspaceId - Workspace ID if available
 * @param {string|null} options.userId - User ID for user-submitted files
 * @param {string|null} options.chatId - Chat ID for chat-scoped files
 * @returns {Object} { userId, workspaceId, chatId, fileScope }
 */
export function determineFileRouting({
    isArtifact,
    workspaceId,
    userId,
    chatId,
}) {
    const resolved = resolveStorageTarget({
        isArtifact,
        workspaceId,
        userId,
        chatId,
    });
    if (resolved.fileScope === "workspace-shared-legacy") {
        return {
            workspaceId: resolved.workspaceId,
            fileScope: resolved.fileScope,
        };
    }
    const routing = buildMediaHelperFileParams({ storageTarget: resolved });
    return {
        userId: routing.userId,
        chatId: routing.chatId || null,
        workspaceId: routing.workspaceId || null,
        fileScope: routing.fileScope,
    };
}

/**
 * @deprecated Use determineFileRouting instead. Kept for backward compatibility during transition.
 */
export function determineFileContextId({
    isArtifact = false,
    workspaceId = null,
    userContextId = null,
    chatId = null,
    returnObject = false,
}) {
    const storageTarget = resolveStorageTarget({
        isArtifact,
        workspaceId,
        userId: userContextId,
        chatId,
    });
    const routing = determineFileRouting({
        isArtifact,
        workspaceId,
        userId: userContextId,
        chatId,
    });
    const contextId = getStorageContextId({ storageTarget });
    if (returnObject) {
        return { contextId, ...routing };
    }
    return contextId;
}

/**
 * @deprecated Kept for legacy Concierge routes that still pass Cortex agentContext.
 */
export function createCompoundContextId(workspaceId, userContextId) {
    return `${workspaceId}:${userContextId}`;
}

/**
 * @deprecated New prompt execution uses fileAccessPlan/runContext. Kept for legacy routes.
 */
export function buildAgentContext({
    workspaceId = null,
    workspaceContextKey = null,
    userContextId = null,
    userContextKey = null,
    includeCompoundContext = false,
}) {
    const contexts = [];

    if (workspaceId) {
        contexts.push({
            contextId: workspaceId,
            contextKey: workspaceContextKey || "",
            default: true,
        });

        if (includeCompoundContext && userContextId) {
            contexts.push({
                contextId: createCompoundContextId(workspaceId, userContextId),
                contextKey: userContextKey || "",
                default: false,
            });
        }
    } else if (userContextId) {
        contexts.push({
            contextId: userContextId,
            contextKey: userContextKey || "",
            default: true,
        });
    }

    return contexts;
}

/**
 * Get LLM by ID with fallback to default LLM.
 */
export async function getLLMWithFallback(LLM, llmId) {
    let llm;

    if (llmId) {
        llm = await LLM.findOne({ _id: llmId });
    }

    if (!llm) {
        llm = await LLM.findOne({ isDefault: true });
    }

    return llm;
}

export async function getAnyAgenticLLM(LLM) {
    const llm = await LLM.findOne({ isAgentic: true });
    if (!llm) {
        return getLLMWithFallback(LLM, null);
    }
    return llm;
}

/**
 * Extract the blob path (path within the container) from an Azure blob URL.
 * Handles both Azure Blob Storage and Azurite (local dev) URL formats.
 *
 * Azure: https://account.blob.core.windows.net/container/path/to/file
 *   pathname = /container/path/to/file → skip 1 segment → "path/to/file"
 *
 * Azurite: http://127.0.0.1:10000/devstoreaccount1/container/path/to/file
 *   pathname = /devstoreaccount1/container/path/to/file → skip 2 segments → "path/to/file"
 *
 * @param {string} blobUrl - The full blob URL
 * @returns {string|null} The blob path within the container, or null if not extractable
 */
export function extractBlobPathFromUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        // Azurite: /devstoreaccount1/container/path... (skip 2)
        // Azure: /container/path... (skip 1)
        const isAzurite =
            urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
        const skip = isAzurite ? 2 : 1;
        if (segments.length <= skip) return null;
        return segments.slice(skip).map(decodeURIComponent).join("/");
    } catch {
        return null;
    }
}

/**
 * Extract the file hash from an Azure blob URL.
 * Blob names follow the pattern: {hash}_{filename} where hash is a hex string (xxHash64).
 * The blob path may include folder segments like chats/{chatId}/ or global/.
 * @param {string} blobUrl - The full Azure blob URL
 * @returns {string|null} The hash prefix, or null if not found
 */
export function extractHashFromBlobUrl(blobUrl) {
    try {
        const urlObj = new URL(blobUrl);
        const lastSegment = urlObj.pathname.split("/").pop();
        if (!lastSegment) return null;
        const decoded = decodeURIComponent(lastSegment);
        const idx = decoded.indexOf("_");
        if (idx > 0) {
            const prefix = decoded.substring(0, idx);
            if (/^[0-9a-f]+$/i.test(prefix)) {
                return prefix;
            }
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

/**
 * Fetch a 5-minute short-lived URL (and GCS URL) for a file from media-helper using checkHash.
 * GCS URL is resolved here on-demand rather than stored in file entries.
 * Prefers blobPath when available; falls back to hash for backward compatibility.
 * @param {Object} params
 * @param {string} [params.blobPath] - Blob path within the container (preferred)
 * @param {string} [params.hash] - File hash (fallback)
 * @param {string} [params.contextId] - Context ID for file scoping
 * @returns {Promise<{url: string, gcs: string|null}|null>} Short-lived URL + GCS URL, or null if fetch fails
 */
export async function fetchShortLivedUrl({ blobPath, hash, contextId } = {}) {
    const attempts = [];
    if (blobPath) {
        attempts.push({ blobPath });
    }
    if (hash) {
        attempts.push({ hash });
    }

    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            console.warn("Media helper URL not configured, using original URL");
            return null;
        }

        for (const attempt of attempts) {
            const url = new URL(mediaHelperUrl);
            if (attempt.blobPath) {
                url.searchParams.set("blobPath", attempt.blobPath);
            } else if (attempt.hash) {
                url.searchParams.set("hash", attempt.hash);
                url.searchParams.set("checkHash", "true");
            }
            if (contextId) {
                url.searchParams.set("contextId", contextId);
            }
            // Request 5-minute short-lived URL (300 seconds)
            url.searchParams.set("shortLived", "true");
            url.searchParams.set("duration", "300");

            const requestUrl = url.toString();
            const response = await fetch(requestUrl);
            if (response.ok) {
                const data = await response.json().catch((err) => {
                    console.warn(
                        "Failed to parse short-lived URL response:",
                        err,
                    );
                    return null;
                });
                // Media-helper returns short-lived URL in shortLivedUrl field
                const resolvedUrl = data?.shortLivedUrl || data?.url || null;
                if (resolvedUrl) {
                    return { url: resolvedUrl, gcs: data.gcs || null };
                }
                console.warn(
                    "Short-lived URL response missing url fields:",
                    data,
                );
                continue;
            }

            if (!attempt.hash || attempts.length === 1) {
                const errorText = await response.text().catch(() => "");
                console.warn(
                    "Short-lived URL fetch failed:",
                    response.status,
                    errorText,
                );
            }
        }
    } catch (error) {
        console.warn("Failed to fetch short-lived URL:", error);
    }
    return null;
}

/**
 * Prepare file content for chat history using an explicit storage target.
 * @param {Array} files - Array of file objects
 * @param {Object} options
 * @param {Object|null} options.storageTarget - Explicit storage target for all files
 * @param {Array} options.fallbackStorageTargets - Optional legacy targets to try during migration
 * @param {boolean} options.fetchShortLivedUrls - Whether to fetch short-lived URLs
 * @returns {Promise<Array>} Array of stringified file content objects
 */
export async function prepareFileContentForLLM(
    files,
    options = {},
    ...legacyArgs
) {
    if (
        options === null ||
        typeof options !== "object" ||
        Array.isArray(options)
    ) {
        const workspaceId = options;
        const userContextId = legacyArgs[0] || null;
        const fetchShortLivedUrls = legacyArgs[1] !== false;
        options = {
            storageTarget: workspaceId
                ? createWorkspaceSharedStorageTarget(workspaceId)
                : createUserGlobalStorageTarget(userContextId),
            fetchShortLivedUrls,
        };
    }

    const {
        storageTarget = null,
        fallbackStorageTargets = [],
        fetchShortLivedUrls = true,
    } = options;

    if (!files || files.length === 0 || !storageTarget) return [];

    const resolvedStorageTarget = resolveStorageTarget({ storageTarget });
    const contextId = getStorageContextId({
        storageTarget: resolvedStorageTarget,
    });

    const fileObjects = await Promise.all(
        files.map(async (file) => {
            // Prefer converted version (e.g., PDF converted to text) if available
            let resolvedFile = file;
            let fileUrl = file.converted?.url || file.url;
            let gcsUrl = null;
            if (fetchShortLivedUrls && contextId) {
                const resolved = await resolveAndHealFile(file, {
                    storageTarget: resolvedStorageTarget,
                    fallbackStorageTargets,
                    allowUrlRefresh:
                        fallbackStorageTargets.length > 0 ||
                        !!file?.hash ||
                        !!file?.blobPath,
                });
                resolvedFile = resolved.file || file;
                fileUrl =
                    resolvedFile.converted?.shortLivedUrl ||
                    resolvedFile.converted?.url ||
                    resolved.accessUrl ||
                    resolvedFile.url ||
                    fileUrl;
                gcsUrl =
                    resolvedFile.converted?.gcs || resolvedFile.gcsUrl || null;
            }

            const obj = {
                type: "image_url",
            };

            if (gcsUrl) obj.gcs = gcsUrl;
            obj.url = fileUrl;
            obj.image_url = { url: fileUrl };
            const mimeTypeToInclude =
                resolvedFile.converted?.mimeType ||
                resolvedFile.mimeType ||
                file.converted?.mimeType ||
                file.mimeType ||
                null;
            if (mimeTypeToInclude) {
                obj.mimeType = mimeTypeToInclude;
            }

            const blobPathToInclude =
                resolvedFile.converted?.blobPath ||
                resolvedFile.blobPath ||
                file.converted?.blobPath ||
                file.blobPath;
            if (blobPathToInclude) {
                obj.blobPath = blobPathToInclude;
            }

            // Include hash if available as a legacy fallback.
            const hashToInclude =
                resolvedFile.converted?.hash || resolvedFile.hash;
            if (hashToInclude) {
                obj.hash = hashToInclude;
            }

            if (contextId) {
                obj.contextId = contextId;
            }
            if (resolvedStorageTarget.fileScope) {
                obj.fileScope = resolvedStorageTarget.fileScope;
            }
            if (resolvedStorageTarget.appletId) {
                obj.appletId = resolvedStorageTarget.appletId;
            }
            if (resolvedStorageTarget.userContextId) {
                obj.userId = resolvedStorageTarget.userContextId;
            }
            if (resolvedStorageTarget.workspaceId) {
                obj.workspaceId = resolvedStorageTarget.workspaceId;
            }

            return JSON.stringify(obj);
        }),
    );

    return fileObjects;
}
/**
 * Build the file access plan for Cortex agent file lookups.
 * @param {Object} params
 * @returns {Array} Ordered file access targets for Cortex
 */
export { buildFileAccessPlan, buildRunContext };

/**
 * Build variables for workspace prompt query
 * Always returns chatHistory format with system message and user message
 * @param {Object} params
 * @param {string} params.systemPrompt - Workspace system prompt (workspace context)
 * @param {string} params.prompt - Prompt text
 * @param {string} params.text - User input text
 * @param {Array} params.sharedFiles - Persisted prompt/app files
 * @param {Array} params.userFiles - Request/user-attached files
 * @param {Array} params.chatHistory - Existing chat history (optional)
 * @param {string} params.chatId - Optional chat ID for chat-scoped files
 * @param {string} params.workspaceId - Optional workspace ID for workspace artifacts
 * @param {string} params.userContextId - Optional user context ID for user-submitted files
 * @param {string} params.userContextKey - Optional user context key for user-submitted files
 * @param {string} params.workspaceContextKey - Optional workspace context key for workspace files
 * @returns {Promise<Object>} Variables object with chatHistory, fileAccessPlan, and runtime context
 */
export async function buildWorkspacePromptVariables({
    systemPrompt,
    prompt,
    text,
    sharedFiles = [],
    userFiles = [],
    chatHistory = null,
    appletId = null,
    chatId = null,
    workspaceId = null,
    userContextId = null,
    userContextKey = null,
    workspaceContextKey = null,
    includeUserGlobal = appletId ? false : true,
}) {
    // Combine prompt + text for user message
    const combinedUserText = prompt
        ? text
            ? `${prompt}\n\n${text}`
            : prompt
        : text || "";

    const fileAccessPlan = buildFileAccessPlan({
        appletId,
        workspaceId,
        userContextId,
        userContextKey,
        workspaceContextKey,
        chatId,
        includeUserGlobal,
    });
    const runContext = buildRunContext({
        appletId,
        workspaceId,
        workspaceContextKey,
        userContextId,
        userContextKey,
    });

    const resolvedSharedFiles = Array.isArray(sharedFiles) ? sharedFiles : [];
    const resolvedUserFiles = Array.isArray(userFiles) ? userFiles : [];
    let fileContent = [];
    const appendPreparedFiles = async ({
        files: filesToPrepare,
        storageTarget,
        fallbackStorageTargets = [],
    }) => {
        if (!filesToPrepare.length || !storageTarget) {
            return;
        }
        fileContent.push(
            ...(await prepareFileContentForLLM(filesToPrepare, {
                storageTarget,
                fallbackStorageTargets,
                fetchShortLivedUrls: true,
            })),
        );
    };

    if (appletId) {
        await appendPreparedFiles({
            files: resolvedSharedFiles,
            storageTarget: createAppletSharedStorageTarget(appletId),
            fallbackStorageTargets: workspaceId
                ? [createWorkspaceSharedStorageTarget(workspaceId)]
                : [],
        });

        if (userContextId) {
            await appendPreparedFiles({
                files: resolvedUserFiles,
                storageTarget: createAppletUserStorageTarget(
                    userContextId,
                    appletId,
                ),
                fallbackStorageTargets: workspaceId
                    ? [
                          createWorkspacePrivateStorageTarget(
                              userContextId,
                              workspaceId,
                          ),
                      ]
                    : [],
            });
        }
    } else {
        await appendPreparedFiles({
            files: resolvedSharedFiles,
            storageTarget: workspaceId
                ? createWorkspaceSharedStorageTarget(workspaceId)
                : null,
        });
        await appendPreparedFiles({
            files: resolvedUserFiles,
            storageTarget: workspaceId
                ? createWorkspacePrivateStorageTarget(
                      userContextId,
                      workspaceId,
                  )
                : createUserGlobalStorageTarget(userContextId),
        });
    }

    let finalChatHistory = [];

    if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
        // Use provided chatHistory, but add files to last user message if present
        finalChatHistory = [...chatHistory];

        if (fileContent.length > 0) {
            // Find last user message and add files
            let foundUserMessage = false;
            for (let i = finalChatHistory.length - 1; i >= 0; i--) {
                if (finalChatHistory[i].role === "user") {
                    // Ensure content is an array
                    if (!Array.isArray(finalChatHistory[i].content)) {
                        finalChatHistory[i].content = [
                            JSON.stringify({
                                type: "text",
                                text: finalChatHistory[i].content || "",
                            }),
                        ];
                    }
                    // Add file content
                    finalChatHistory[i].content = [
                        ...finalChatHistory[i].content,
                        ...fileContent,
                    ];
                    foundUserMessage = true;
                    break;
                }
            }
            // If no user message found, append a new user message with just the files
            if (!foundUserMessage) {
                finalChatHistory.push({
                    role: "user",
                    content: fileContent,
                });
            }
        }
    } else {
        // Build new chatHistory
        finalChatHistory = [];

        // Add system message if systemPrompt exists
        if (systemPrompt) {
            finalChatHistory.push({
                role: "system",
                content: [
                    JSON.stringify({
                        type: "text",
                        text: systemPrompt,
                    }),
                ],
            });
        }

        // Add UX display context system message
        finalChatHistory.push({
            role: "system",
            content: [
                JSON.stringify({
                    type: "text",
                    text: "Your output is being displayed in the user interface or used as an API response, not in an interactive chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
                }),
            ],
        });

        // Add user message with combined prompt+text and files
        const userContent = [];
        if (combinedUserText) {
            // If both prompt and text exist, separate them explicitly
            if (prompt && text) {
                // Add instructions/prompt as first content item
                userContent.push(
                    JSON.stringify({
                        type: "text",
                        text: prompt,
                    }),
                );
                // Add user input explicitly marked
                userContent.push(
                    JSON.stringify({
                        type: "text",
                        text: `\n\n--- USER INPUT ---\n${text}\n--- END USER INPUT ---`,
                    }),
                );
            } else {
                // Single combined text (backward compatible)
                userContent.push(
                    JSON.stringify({
                        type: "text",
                        text: combinedUserText,
                    }),
                );
            }
        }
        userContent.push(...fileContent);

        if (userContent.length > 0) {
            finalChatHistory.push({
                role: "user",
                content: userContent,
            });
        }
    }

    const result = {
        chatHistory: finalChatHistory,
        contextId: runContext.contextId,
        contextKey: runContext.contextKey,
    };

    if (fileAccessPlan.length > 0) {
        result.fileAccessPlan = fileAccessPlan;
    }

    return result;
}
