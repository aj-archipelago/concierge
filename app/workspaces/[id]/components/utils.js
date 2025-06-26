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

    return content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
}

/**
 * Extracts HTML content from JSON response, handling both complete and partial JSON
 * @param {string} content - The streaming content
 * @returns {object|null} - Object with html and changes properties, or null
 */
export function extractHtmlFromStreamingContent(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    // Clean the content by removing ```json blocks completely
    let cleanedContent = cleanJsonCodeBlocks(content);

    // Try to parse the cleaned content as JSON
    const parsed = safeParseJson(cleanedContent);

    if (parsed && typeof parsed === "object") {
        // Check if it has the expected structure
        if (parsed.html && typeof parsed.html === "string") {
            return {
                html: parsed.html,
                changes: parsed.changes || "HTML content updated",
                isComplete: true,
            };
        }

        // Check for nested structures
        if (parsed.content && typeof parsed.content === "object") {
            if (
                parsed.content.html &&
                typeof parsed.content.html === "string"
            ) {
                return {
                    html: parsed.content.html,
                    changes:
                        parsed.content.changes ||
                        parsed.changes ||
                        "HTML content updated",
                    isComplete: true,
                };
            }
        }
    }

    // If no valid JSON structure found, return null
    return null;
}

/*
Test cases for the JSON utilities:

1. JSON code block removal:
   extractAndParseJson('```json\n{"html": "<div>test</div>", "changes": "Added div"}\n```')
   // Returns: {html: "<div>test</div>", changes: "Added div"}

2. Partial JSON completion:
   completePartialJson('{"html": "<div>test</div>", "changes": "Added div')
   // Returns: '{"html": "<div>test</div>", "changes": "Added div"}'

3. Safe parsing with fallbacks:
   safeParseJson('{"html": "<div>test</div>", "changes": "Added div')
   // Returns: {html: "<div>test</div>", changes: "Added div"}

4. HTML extraction from streaming:
   extractHtmlFromStreamingContent('{"html": "<div>test</div>", "changes": "Added div"}')
   // Returns: {html: "<div>test</div>", changes: "Added div", isComplete: true}
*/
