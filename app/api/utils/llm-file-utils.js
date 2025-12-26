import config from "../../../config";

/**
 * Create a compound contextId for workspace-specific user files
 * This allows each user to have their own private file collection within a workspace
 * @param {string} workspaceId - Workspace ID
 * @param {string} userContextId - User context ID
 * @returns {string} - Compound contextId in format "workspaceId:userContextId"
 */
export function createCompoundContextId(workspaceId, userContextId) {
    return `${workspaceId}:${userContextId}`;
}

/**
 * Determine the appropriate contextId for a file based on its type
 * @param {Object} options - Options for contextId determination
 * @param {boolean} options.isArtifact - Whether this is a workspace/applet artifact (permanent, shared)
 * @param {string|null} options.workspaceId - Workspace ID if available
 * @param {string|null} options.userContextId - User context ID for user-submitted files
 * @param {boolean} options.useCompoundContextId - If true, creates a compound contextId for user files in workspaces
 * @returns {string|null} - The appropriate contextId, or null if neither is available
 */
export function determineFileContextId({
    isArtifact = false,
    workspaceId = null,
    userContextId = null,
    useCompoundContextId = false,
}) {
    // Workspace/applet artifacts use workspaceId (shared across all users)
    if (isArtifact && workspaceId) {
        return workspaceId;
    }
    // User-submitted files in workspace context use compound contextId
    // This allows each user to have private files per workspace
    if (useCompoundContextId && workspaceId && userContextId) {
        return createCompoundContextId(workspaceId, userContextId);
    }
    // User-submitted files use userContextId (user-specific)
    return userContextId || null;
}

/**
 * Fetch a 5-minute short-lived URL for a file from media-helper using checkHash
 * @param {string} hash - File hash
 * @param {string} contextId - Context ID for file scoping
 * @returns {Promise<string|null>} Short-lived URL or null if fetch fails
 */
export async function fetchShortLivedUrl(hash, contextId) {
    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            console.warn("Media helper URL not configured, using original URL");
            return null;
        }

        const url = new URL(mediaHelperUrl);
        url.searchParams.set("hash", hash);
        url.searchParams.set("checkHash", "true");
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
                console.warn("Failed to parse short-lived URL response:", err);
                return null;
            });
            // Media-helper returns short-lived URL in shortLivedUrl field
            if (data && data.shortLivedUrl) {
                return data.shortLivedUrl;
            }
            // Fallback to regular url if shortLivedUrl not available
            if (data && data.url) {
                return data.url;
            }
            console.warn("Short-lived URL response missing url fields:", data);
        } else {
            const errorText = await response.text().catch(() => "");
            console.warn(
                "Short-lived URL fetch failed:",
                response.status,
                errorText,
            );
        }
    } catch (error) {
        console.warn("Failed to fetch short-lived URL:", error);
    }
    return null;
}

/**
 * Prepare file content for chat history
 * For workspaces/applets/system workspaces: fetches 5-minute short-lived URLs
 * For chat: uses original URLs (chat goes through agentic pathway which handles URLs)
 * @param {Array} files - Array of file objects
 * @param {string} workspaceId - Optional workspace ID for workspace artifacts
 * @param {string} userContextId - Optional user context ID for user-submitted files
 * @param {boolean} fetchShortLivedUrls - Whether to fetch short-lived URLs (default: true for workspaces/applets)
 * @param {boolean} useCompoundContextId - Whether to use compound contextId for user files in workspaces
 * @returns {Promise<Array>} Array of stringified file content objects
 */
export async function prepareFileContentForLLM(
    files,
    workspaceId = null,
    userContextId = null,
    fetchShortLivedUrls = true,
    useCompoundContextId = false,
) {
    if (!files || files.length === 0) return [];

    // Format files like chat does
    // Files with _id are workspace/applet artifacts (use workspaceId)
    // Files without _id are user-submitted files (use compound contextId or userContextId)
    const fileObjects = await Promise.all(
        files.map(async (file) => {
            const contextId = determineFileContextId({
                isArtifact: !!file._id,
                workspaceId,
                userContextId,
                useCompoundContextId: !file._id && useCompoundContextId, // Only for user files
            });

            const originalUrl = file.converted?.url || file.url;
            const gcsUrl =
                file.converted?.gcs || file.gcsUrl || file.gcs || file.url;

            // Fetch 5-minute short-lived URL if requested and hash is available
            // Use converted hash if available (for converted files), otherwise use original hash
            let fileUrl = originalUrl;
            const hashToUse = file.converted?.hash || file.hash;
            if (fetchShortLivedUrls && hashToUse && contextId) {
                const shortLivedUrl = await fetchShortLivedUrl(
                    hashToUse,
                    contextId,
                );
                if (shortLivedUrl) {
                    fileUrl = shortLivedUrl;
                }
            }

            const obj = {
                type: "image_url",
            };

            obj.gcs = gcsUrl;
            obj.url = fileUrl;
            obj.image_url = { url: fileUrl };

            // Include hash if available (Cortex uses this to look up files)
            // Use converted hash if available, otherwise use original hash
            const hashToInclude = file.converted?.hash || file.hash;
            if (hashToInclude) {
                obj.hash = hashToInclude;
            }

            // Include contextId so Cortex knows where to look up the file
            // workspaceId for workspace artifacts, userContextId for user files
            if (contextId) {
                obj.contextId = contextId;
            }

            return JSON.stringify(obj);
        }),
    );

    return fileObjects;
}

/**
 * Get LLM by ID with fallback to default LLM
 * @param {import('../models/llm')} LLM - LLM model
 * @param {string} llmId - LLM ID to lookup
 * @returns {Promise<Object>} - LLM object
 */
export async function getLLMWithFallback(LLM, llmId) {
    let llm;

    if (llmId) {
        llm = await LLM.findOne({ _id: llmId });
    }

    // If no LLM is found, use the default LLM
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
 * Build variables for workspace prompt query
 * Always returns chatHistory format with system message and user message
 * @param {Object} params
 * @param {string} params.systemPrompt - Workspace system prompt (workspace context)
 * @param {string} params.prompt - Prompt text
 * @param {string} params.text - User input text
 * @param {Array} params.files - Array of files (optional)
 * @param {Array} params.chatHistory - Existing chat history (optional)
 * @param {string} params.workspaceId - Optional workspace ID for workspace artifacts
 * @param {string} params.userContextId - Optional user context ID for user-submitted files
 * @param {boolean} params.useCompoundContextId - If true, use compound contextId for user files
 * @returns {Promise<Object>} Variables object with chatHistory and altContextId for GraphQL query
 */
export async function buildWorkspacePromptVariables({
    systemPrompt,
    prompt,
    text,
    files = [],
    chatHistory = null,
    workspaceId = null,
    userContextId = null,
    useCompoundContextId = true,
}) {
    // Combine prompt + text for user message
    const combinedUserText = prompt
        ? text
            ? `${prompt}\n\n${text}`
            : prompt
        : text || "";

    // Compute altContextId for user files in workspaces
    // This is the compound contextId that cortex will use to look up user files
    const altContextId =
        useCompoundContextId && workspaceId && userContextId
            ? createCompoundContextId(workspaceId, userContextId)
            : null;

    const fileContent =
        files && files.length > 0
            ? await prepareFileContentForLLM(
                  files,
                  workspaceId,
                  userContextId,
                  true, // Fetch short-lived URLs for workspaces/applets
                  useCompoundContextId,
              )
            : [];

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
    };

    // Include altContextId if computed (for user files in workspaces)
    if (altContextId) {
        result.altContextId = altContextId;
    }

    return result;
}
