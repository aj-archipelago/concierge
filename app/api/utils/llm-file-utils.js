/**
 * Determine the appropriate contextId for a file based on its type
 * @param {Object} options - Options for contextId determination
 * @param {boolean} options.isArtifact - Whether this is a workspace/applet artifact (permanent, shared)
 * @param {string|null} options.workspaceId - Workspace ID if available
 * @param {string|null} options.userContextId - User context ID for user-submitted files
 * @returns {string|null} - The appropriate contextId, or null if neither is available
 */
export function determineFileContextId({
    isArtifact = false,
    workspaceId = null,
    userContextId = null,
}) {
    // Workspace/applet artifacts use workspaceId (shared across all users)
    if (isArtifact && workspaceId) {
        return workspaceId;
    }
    // User-submitted files use userContextId (user-specific)
    return userContextId || null;
}

/**
 * Prepare file content for chat history
 * Cortex will handle short-lived URL generation when it processes the files
 * @param {Array} files - Array of file objects
 * @param {string} workspaceId - Optional workspace ID for workspace artifacts
 * @param {string} userContextId - Optional user context ID for user-submitted files
 * @returns {Array} - Array of stringified file content objects
 */
export function prepareFileContentForLLM(
    files,
    workspaceId = null,
    userContextId = null,
) {
    if (!files || files.length === 0) return [];

    // Format files like chat does - Cortex will generate short-lived URLs
    // Files with _id are workspace/applet artifacts (use workspaceId)
    // Files without _id are user-submitted files (use userContextId)
    const fileObjects = files.map((file) => {
        const contextId = determineFileContextId({
            isArtifact: !!file._id,
            workspaceId,
            userContextId,
        });

        const fileUrl = file.converted?.url || file.url;
        const gcsUrl =
            file.converted?.gcs || file.gcsUrl || file.gcs || file.url;

        const obj = {
            type: "image_url",
        };

        obj.gcs = gcsUrl;
        obj.url = fileUrl;
        obj.image_url = { url: fileUrl };

        // Include hash if available (Cortex uses this to look up files)
        if (file.hash) {
            obj.hash = file.hash;
        }

        // Include contextId so Cortex knows where to look up the file
        // workspaceId for workspace artifacts, userContextId for user files
        if (contextId) {
            obj.contextId = contextId;
        }

        return JSON.stringify(obj);
    });

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
 * @returns {Promise<Object>} Variables object with chatHistory for GraphQL query
 */
export async function buildWorkspacePromptVariables({
    systemPrompt,
    prompt,
    text,
    files = [],
    chatHistory = null,
    workspaceId = null,
    userContextId = null,
}) {
    // Combine prompt + text for user message
    const combinedUserText = prompt
        ? text
            ? `${prompt}\n\n${text}`
            : prompt
        : text || "";

    const fileContent =
        files && files.length > 0
            ? prepareFileContentForLLM(files, workspaceId, userContextId)
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
                    text: "Your output is being displayed in the user interface or used as an API response, not in a chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
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

    return {
        chatHistory: finalChatHistory,
    };
}
