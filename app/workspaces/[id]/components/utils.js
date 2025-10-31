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
        .replace(/```json[ \t]*\n?/g, "")
        .replace(/```[ \t]*\n?/g, "")
        .replace(/[ \t]*```/g, "")
        .trim();
    return cleaned;
}

/**
 * Extracts HTML content from APPLET tags, stripping any markdown code blocks inside
 * @param {string} content - The content that may contain APPLET tags
 * @returns {string|null} - The extracted HTML content or null
 */
function extractHtmlFromAppletTag(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // Look for APPLET tags (case-insensitive) with optional attributes
    const appletStartRegex = /<APPLET(?:\s+[^>]*)?>/i;
    const appletStartMatch = content.match(appletStartRegex);

    if (!appletStartMatch) {
        return null;
    }

    const startIndex = appletStartMatch.index;
    const tagLength = appletStartMatch[0].length;
    const afterStart = content.substring(startIndex + tagLength);

    // Look for closing tag
    const closingMatch = afterStart.match(/<\/APPLET\s*>/i);

    if (!closingMatch) {
        return null; // Tag not closed, can't extract reliably in non-streaming context
    }

    const appletContent = afterStart.substring(0, closingMatch.index).trim();

    if (!appletContent) {
        return null;
    }

    let htmlContent = appletContent;

    // If the content inside APPLET tags contains markdown code blocks, extract the inner content
    const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/g;
    const codeBlockMatches = [...appletContent.matchAll(codeBlockRegex)];

    if (codeBlockMatches.length > 0) {
        // Use the last (most complete) code block content
        htmlContent = codeBlockMatches[codeBlockMatches.length - 1][1].trim();
    }

    return htmlContent || null;
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

    // First try to extract from APPLET tags
    const htmlContent = extractHtmlFromAppletTag(content);
    if (htmlContent) {
        return {
            html: htmlContent,
            changes: "HTML code generated from APPLET tag",
            isComplete: true,
        };
    }

    // Fallback: Look for code blocks anywhere in the content (for backward compatibility)
    const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/g;
    let match;
    let lastMatch = null;

    // Find all code blocks and use the last one (most complete)
    while ((match = codeBlockRegex.exec(content)) !== null) {
        lastMatch = match;
    }

    if (lastMatch) {
        const htmlFromBlock = lastMatch[1].trim();
        if (htmlFromBlock) {
            return {
                html: htmlFromBlock,
                changes: "HTML code generated from code block",
                isComplete: true,
            };
        }
    }

    // If no valid code block found, return null
    return null;
}

/**
 * Detects if content contains an APPLET tag and extracts partial HTML content during streaming
 * @param {string} content - The streaming content
 * @returns {object|null} - Object with html (partial), isInApplet, changes, and chatContent properties, or null
 */
export function detectCodeBlockInStream(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // First, check for APPLET tags (case-insensitive)
    // Handle opening tag with optional whitespace and attributes: <APPLET>, <APPLET >, <APPLET id="...">
    const appletStartRegex = /<APPLET(?:\s+[^>]*)?>/i;
    const appletStartMatch = content.match(appletStartRegex);

    if (appletStartMatch) {
        const startIndex = appletStartMatch.index;
        const tagLength = appletStartMatch[0].length; // Length of the actual matched tag
        const afterStart = content.substring(startIndex + tagLength);
        const closingMatch = afterStart.match(/<\/APPLET\s*>/i);

        // Extract content before APPLET tag for chat display
        const beforeApplet = content.substring(0, startIndex).trim();

        let appletContent = "";
        let isComplete = false;

        if (closingMatch) {
            // Complete APPLET tag
            appletContent = afterStart.substring(0, closingMatch.index);
            isComplete = true;
        } else {
            // Streaming - APPLET tag not yet closed, take everything after the opening tag
            appletContent = afterStart;
            isComplete = false;
        }

        // Extract HTML from inside APPLET tag, handling potential markdown code blocks
        let htmlContent = appletContent.trim();

        // If content contains markdown code blocks, extract from the last one
        // Handle both complete and streaming code blocks
        const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)(?:```|$)/g;
        const codeBlockMatches = [...appletContent.matchAll(codeBlockRegex)];

        if (codeBlockMatches.length > 0) {
            // Use the last (most complete) code block
            const lastMatch = codeBlockMatches[codeBlockMatches.length - 1];
            const extracted = lastMatch[1].trim();
            if (extracted) {
                htmlContent = extracted;
            }
        }

        // Return if we have any content inside the APPLET tag
        // During streaming, return even if content is still being generated
        if (appletContent || htmlContent) {
            return {
                html: htmlContent || appletContent.trim(),
                isInCodeBlock: !isComplete,
                changes: "HTML code being generated...",
                isComplete: isComplete,
                chatContent: beforeApplet || null,
            };
        }
    }

    // Fallback: Check if we're inside a code block (for backward compatibility)
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
            chatContent.push("**Generating applet code...**");
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
 * Extracts chat content (non-applet text) from a complete response
 * Removes APPLET tags entirely without leaving placeholders
 * @param {string} content - The complete response content
 * @returns {string} - The chat content with APPLET tags removed
 */
export function extractChatContent(content) {
    if (!content || typeof content !== "string") {
        return content;
    }

    // Remove APPLET tags entirely (with any attributes)
    // Match opening tag (case-insensitive, with optional attributes), content, and closing tag
    const appletTagRegex = /<APPLET(?:\s+[^>]*)?>[\s\S]*?<\/APPLET>/gi;
    let chatContent = content.replace(appletTagRegex, "");

    // Clean up whitespace: normalize 2+ consecutive newlines to single newline
    // This handles cases where APPLET tags were on their own lines
    chatContent = chatContent.replace(/\n{2,}/g, "\n");

    // Trim any extra whitespace left behind
    chatContent = chatContent.trim();

    // Return the cleaned content (even if empty)
    return chatContent;
}
