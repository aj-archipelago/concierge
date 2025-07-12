export function getMessagesUpToVersion(messages, versionIndex) {
    if (!messages) return [];
    const idx = messages.findLastIndex(
        (msg) => msg.linkToVersion === versionIndex,
    );
    if (idx === -1) return messages;
    return messages.slice(0, idx + 1);
}

/**
 * Removes JSON code blocks from content and attempts to parse as JSON
 * @param {string} content - The content that may contain JSON code blocks
 * @returns {object|null} - Parsed JSON object or null if parsing fails
 */
export function extractAndParseJson(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // Remove markdown code blocks
    let cleanedContent = content.trim();

    // Remove ```json and ``` code blocks
    if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent
            .replace(/^```json\s*/, "")
            .replace(/\s*```$/, "");
    } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent
            .replace(/^```\s*/, "")
            .replace(/\s*```$/, "");
    }

    try {
        return JSON.parse(cleanedContent);
    } catch (error) {
        return null;
    }
}

/**
 * Attempts to complete partial JSON by closing quotes, brackets, and braces
 * @param {string} partialJson - The partial JSON string
 * @returns {string} - The completed JSON string
 */
export function completePartialJson(partialJson) {
    if (!partialJson || typeof partialJson !== "string") {
        return partialJson;
    }

    let result = partialJson;
    let stack = [];
    let inString = false;
    let escapeNext = false;

    // First pass: analyze the structure and build a completion stack
    for (let i = 0; i < partialJson.length; i++) {
        const char = partialJson[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === "\\") {
            escapeNext = true;
            continue;
        }

        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === "{" || char === "[") {
                stack.push(char);
            } else if (char === "}") {
                if (stack.length > 0 && stack[stack.length - 1] === "{") {
                    stack.pop();
                }
            } else if (char === "]") {
                if (stack.length > 0 && stack[stack.length - 1] === "[") {
                    stack.pop();
                }
            }
        }
    }

    // Second pass: complete the JSON based on the stack
    // Close any open strings
    if (inString) {
        result += '"';
    }

    // Close any open brackets/braces in reverse order
    for (let i = stack.length - 1; i >= 0; i--) {
        const openChar = stack[i];
        if (openChar === "{") {
            result += "}";
        } else if (openChar === "[") {
            result += "]";
        }
    }

    return result;
}

/**
 * Safely parses JSON content, handling both complete and partial JSON
 * @param {string} content - The content to parse
 * @returns {object|null} - Parsed JSON object or null if parsing fails
 */
export function safeParseJson(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // First try to parse as-is
    try {
        return JSON.parse(content);
    } catch (error) {
        // If that fails, try to complete partial JSON
        const completed = completePartialJson(content);
        try {
            return JSON.parse(completed);
        } catch (secondError) {
            // If still fails, try extracting from code blocks
            return extractAndParseJson(content);
        }
    }
}

/**
 * Removes JSON code blocks and markdown formatting from content
 * @param {string} content - The content that may contain JSON code blocks
 * @returns {string} - Cleaned content without code blocks
 */
export function cleanJsonCodeBlocks(content) {
    if (!content || typeof content !== "string") {
        return content;
    }

    // Remove only code block markers, then trim the result
    let cleaned = content
        .replace(/```json[ \t]*\n?/g, '')
        .replace(/```[ \t]*\n?/g, '')
        .replace(/[ \t]*```/g, '')
        .trim();
    return cleaned;
}

/**
 * Extracts HTML content from code block response, handling both complete and partial code blocks
 * @param {string} content - The streaming content
 * @returns {object|null} - Object with html and changes properties, or null
 */
export function extractHtmlFromStreamingContent(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // Look for code blocks anywhere in the content
    const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/g;
    let match;
    let lastMatch = null;

    // Find all code blocks and use the last one (most complete)
    while ((match = codeBlockRegex.exec(content)) !== null) {
        lastMatch = match;
    }

    if (lastMatch) {
        const htmlContent = lastMatch[1].trim();
        if (htmlContent) {
            return {
                html: htmlContent,
                changes: "HTML code generated from code block",
                isComplete: true,
            };
        }
    }

    // If no valid code block found, return null
    return null;
}

/**
 * Detects if content contains a code block and extracts partial HTML content during streaming
 * @param {string} content - The streaming content
 * @returns {object|null} - Object with html (partial), isInCodeBlock, changes, and chatContent properties, or null
 */
export function detectCodeBlockInStream(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // Check if we're inside a code block
    const codeBlockStartRegex = /```(?:html)?\s*$/;
    const codeBlockEndRegex = /```$/;

    // Split content by lines to analyze
    const lines = content.split("\n");
    let isInCodeBlock = false;
    let codeBlockContent = [];
    let chatContent = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this line starts a code block
        if (codeBlockStartRegex.test(line)) {
            isInCodeBlock = true;
            // Add a placeholder where the code block starts
            chatContent.push(
                "[Code applied to applet. Check the preview pane.]",
            );
            continue;
        }

        // Check if this line ends a code block
        if (isInCodeBlock && codeBlockEndRegex.test(line)) {
            isInCodeBlock = false;
            continue;
        }

        // If we're in a code block, collect the content
        if (isInCodeBlock) {
            codeBlockContent.push(line);
        } else {
            // Not in a code block, collect for chat display
            chatContent.push(line);
        }
    }

    // If we're in a code block or have collected code block content
    if (isInCodeBlock || codeBlockContent.length > 0) {
        const htmlContent = codeBlockContent.join("\n").trim();
        const chatText = chatContent.join("\n").trim();

        if (htmlContent) {
            return {
                html: htmlContent,
                isInCodeBlock: isInCodeBlock,
                changes: "HTML code being generated...",
                isComplete: !isInCodeBlock, // Complete if we're not in a code block anymore
                chatContent: chatText || null, // Text to show in chat (explanatory content)
            };
        }
    }

    return null;
}

/**
 * Extracts chat content (non-code-block text) from a complete response
 * @param {string} content - The complete response content
 * @returns {string} - The chat content with placeholders for code blocks
 */
export function extractChatContent(content) {
    if (!content || typeof content !== "string") {
        return content;
    }

    // Replace code blocks with placeholders
    const codeBlockRegex = /```(?:html)?\s*[\s\S]*?```/g;
    const chatContent = content
        .replace(
            codeBlockRegex,
            "[Code applied to applet. Check the preview pane.]",
        )
        .trim();

    return chatContent || content; // Return original content if nothing remains
}
