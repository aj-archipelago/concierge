import config from "../../../config/index.js";

/**
 * Generate short-lived URL from file hash using the media helper service
 * The checkHash operation now always returns short-lived URLs by default
 * @param {Object} file - File object with hash, url, filename properties
 * @param {number} minutes - Duration in minutes for the short-lived URL (default: 5)
 * @returns {Promise<string>} - Short-lived URL or fallback to original URL
 */
export async function generateShortLivedUrl(file, minutes = 5) {
    // Only generate short-lived URL if file has a hash
    if (!file.hash) {
        throw new Error("No hash found for file " + file.originalName);
    }

    try {
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        if (!mediaHelperUrl) {
            throw new Error("mediaHelperDirect endpoint is not defined");
        }

        // Generate short-lived URL using checkHash (always returns short-lived URLs)
        const shortLivedResponse = await fetch(
            `${mediaHelperUrl}?hash=${file.hash}&checkHash=true&shortLivedMinutes=${minutes}`,
            {
                method: "GET",
            },
        );

        if (!shortLivedResponse.ok) {
            console.warn(
                `Failed to generate short-lived URL for hash ${file.hash}, using original URL. Status: ${shortLivedResponse.status}`,
            );
            return file.url;
        }

        const shortLivedData = await shortLivedResponse.json();

        if (!shortLivedData.shortLivedUrl) {
            throw new Error("No short-lived URL found for hash " + file.hash);
        }

        // checkHash now always returns shortLivedUrl, but keep fallback for safety
        return shortLivedData.shortLivedUrl;
    } catch (error) {
        console.error(
            `Error generating short-lived URL for hash ${file.hash}:`,
            error,
        );
        return file.url; // Fallback to original URL
    }
}

/**
 * Prepare file content for chat history with short-lived URLs
 * @param {Array} files - Array of file objects
 * @returns {Promise<Array>} - Array of stringified file content objects
 */
export async function prepareFileContentForLLM(files) {
    if (!files || files.length === 0) return [];

    // Generate short-lived URLs for all files
    const filePromises = files.map(async (file) => {
        const shortLivedUrl = await generateShortLivedUrl(file);

        const obj = {
            type: "image_url",
        };

        obj.gcs = file.gcsUrl || file.gcs || file.url;
        obj.url = shortLivedUrl; // Use short-lived URL for security
        obj.image_url = { url: shortLivedUrl }; // Use short-lived URL for security

        // Include original filename if available
        if (file.originalName || file.originalFilename) {
            obj.originalFilename = file.originalName || file.originalFilename;
        }

        return JSON.stringify(obj);
    });

    return Promise.all(filePromises);
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
 * @returns {Promise<Object>} Variables object with chatHistory for GraphQL query
 */
export async function buildWorkspacePromptVariables({
    systemPrompt,
    prompt,
    text,
    files = [],
    chatHistory = null,
}) {
    // Combine prompt + text for user message
    const combinedUserText = prompt
        ? text
            ? `${prompt}\n\n${text}`
            : prompt
        : text || "";

    const fileContent =
        files && files.length > 0 ? await prepareFileContentForLLM(files) : [];

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
