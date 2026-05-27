export const ASSISTANT_PAYLOAD_ITEM_TYPES = {
    TEXT: "text",
    TOOL_EVENT: "tool_event",
    THINKING: "thinking",
};

export function parseAssistantPayloadItem(item) {
    if (!item) return null;

    if (typeof item === "string") {
        try {
            const parsed = JSON.parse(item);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
            return null;
        }
    }

    return typeof item === "object" ? item : null;
}

export function serializeAssistantPayloadItem(item) {
    return JSON.stringify(item);
}

export function createAssistantTextItem(text) {
    return {
        type: ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT,
        text,
    };
}

export function createAssistantThinkingItem(text, duration = 0) {
    return {
        type: ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING,
        text,
        duration,
    };
}

export function hasAssistantThinkingItem(items = []) {
    if (!Array.isArray(items)) {
        return false;
    }

    return items.some((item) => {
        const parsed = parseAssistantPayloadItem(item);
        return parsed?.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING;
    });
}

export function appendAssistantThinkingSummary(items = [], duration = 0) {
    if (!Array.isArray(items) || hasAssistantThinkingItem(items)) {
        return Array.isArray(items) ? items : [];
    }

    return [
        ...items,
        serializeAssistantPayloadItem(
            createAssistantThinkingItem("", duration || 0),
        ),
    ];
}

export function createAssistantToolEventItem({
    callId = null,
    icon = "🛠️",
    userMessage = "Running tool...",
    status = "thinking",
    error = null,
    presentation = "default",
}) {
    return {
        type: ASSISTANT_PAYLOAD_ITEM_TYPES.TOOL_EVENT,
        callId,
        icon,
        userMessage,
        status,
        error,
        presentation,
    };
}

function getParsedItemAt(items, index) {
    if (!Array.isArray(items)) return null;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        return null;
    }
    return parseAssistantPayloadItem(items[index]);
}

export function appendAssistantTextChunk(
    items = [],
    text,
    activeTextIndex = null,
) {
    if (!text) {
        return { items, index: activeTextIndex };
    }

    const nextItems = [...items];
    const existingItem = getParsedItemAt(nextItems, activeTextIndex);

    if (existingItem?.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT) {
        nextItems[activeTextIndex] = serializeAssistantPayloadItem({
            ...existingItem,
            text: `${existingItem.text || ""}${text}`,
        });
        return { items: nextItems, index: activeTextIndex };
    }

    const index = nextItems.length;
    nextItems.push(
        serializeAssistantPayloadItem(createAssistantTextItem(text)),
    );
    return { items: nextItems, index };
}

export function appendAssistantThinkingChunk(
    items = [],
    text,
    duration = 0,
    activeThinkingIndex = null,
) {
    if (!text) {
        return { items, index: activeThinkingIndex };
    }

    const nextItems = [...items];
    const existingItem = getParsedItemAt(nextItems, activeThinkingIndex);

    if (existingItem?.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING) {
        nextItems[activeThinkingIndex] = serializeAssistantPayloadItem({
            ...existingItem,
            text: `${existingItem.text || ""}${text}`,
            duration,
        });
        return { items: nextItems, index: activeThinkingIndex };
    }

    const index = nextItems.length;
    nextItems.push(
        serializeAssistantPayloadItem(
            createAssistantThinkingItem(text, duration),
        ),
    );
    return { items: nextItems, index };
}

export function updateAssistantThinkingDuration(
    items = [],
    activeThinkingIndex = null,
    duration = 0,
) {
    const nextItems = [...items];
    const existingItem = getParsedItemAt(nextItems, activeThinkingIndex);
    if (existingItem?.type !== ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING) {
        return nextItems;
    }

    nextItems[activeThinkingIndex] = serializeAssistantPayloadItem({
        ...existingItem,
        duration,
    });
    return nextItems;
}

export function upsertAssistantToolEvent(
    items = [],
    toolEvent,
    existingIndex = null,
) {
    const nextItems = [...items];
    const serialized = serializeAssistantPayloadItem(toolEvent);

    if (Number.isInteger(existingIndex) && existingIndex >= 0) {
        nextItems[existingIndex] = serialized;
        return { items: nextItems, index: existingIndex };
    }

    const index = nextItems.length;
    nextItems.push(serialized);
    return { items: nextItems, index };
}

export function buildInlineAssistantPayload({
    content = "",
    thinkingContent = "",
    thinkingDuration = 0,
    toolEvents = [],
}) {
    const trimmedThinking =
        typeof thinkingContent === "string" ? thinkingContent.trim() : "";
    const normalizedToolEvents = (toolEvents || [])
        .map((item) => parseAssistantPayloadItem(item) || item)
        .filter(
            (item) =>
                item &&
                typeof item === "object" &&
                item.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TOOL_EVENT,
        );

    const hasInlineItems =
        normalizedToolEvents.length > 0 || trimmedThinking || content;
    if (!hasInlineItems) {
        return content || null;
    }

    const payload = normalizedToolEvents.map((item) =>
        serializeAssistantPayloadItem(item),
    );

    if (trimmedThinking) {
        payload.push(
            serializeAssistantPayloadItem(
                createAssistantThinkingItem(thinkingContent, thinkingDuration),
            ),
        );
    }

    if (content) {
        payload.push(
            serializeAssistantPayloadItem(createAssistantTextItem(content)),
        );
    }

    return appendAssistantThinkingSummary(payload, thinkingDuration);
}

export function buildAssistantPayloadFromItems(items = []) {
    const normalized = (items || [])
        .map((item) => {
            const parsed = parseAssistantPayloadItem(item);
            if (parsed) {
                return serializeAssistantPayloadItem(parsed);
            }
            return typeof item === "string" && item.trim() ? item : null;
        })
        .filter(Boolean);

    if (!normalized.length) {
        return null;
    }

    if (normalized.length === 1) {
        const parsed = parseAssistantPayloadItem(normalized[0]);
        if (
            parsed?.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT &&
            typeof parsed.text === "string"
        ) {
            return parsed.text;
        }
    }

    return normalized;
}

export function buildModelPayloadFromStoredPayload(payload) {
    if (typeof payload === "string") {
        return payload.trim() ? payload : null;
    }

    if (!Array.isArray(payload)) {
        return payload ?? null;
    }

    const sanitizedItems = payload
        .map((item) => {
            const parsed = parseAssistantPayloadItem(item);

            if (!parsed) {
                return typeof item === "string" && item.trim() ? item : null;
            }

            if (
                parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING ||
                parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TOOL_EVENT ||
                parsed.hideFromModel === true ||
                parsed.hideFromClient === true ||
                parsed.isDeletedFile === true
            ) {
                return null;
            }

            if (
                parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT &&
                (typeof parsed.text !== "string" ||
                    parsed.text.trim().length === 0)
            ) {
                return null;
            }

            return serializeAssistantPayloadItem(parsed);
        })
        .filter(Boolean);

    return buildAssistantPayloadFromItems(sanitizedItems);
}

/**
 * Extract all visible, searchable text from a stored message payload.
 * Delegates to buildModelPayloadFromStoredPayload for visibility filtering
 * (excludes thinking, tool_event, hidden, deleted items), then extracts
 * text content and filenames from the sanitized result.
 */
export function extractSearchableText(payload) {
    const sanitized = buildModelPayloadFromStoredPayload(payload);
    if (!sanitized) return "";

    const isHidden = (obj) =>
        obj &&
        (obj.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING ||
            obj.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TOOL_EVENT ||
            obj.hideFromClient === true ||
            obj.hideFromModel === true ||
            obj.isDeletedFile === true);

    const extractFields = (obj) => {
        if (!obj || typeof obj !== "object" || isHidden(obj)) return "";
        const text = typeof obj.text === "string" ? obj.text.trim() : "";
        const filename = (
            obj.displayFilename ||
            obj.originalFilename ||
            obj.filename ||
            ""
        ).trim();
        return [text, filename].filter(Boolean).join(" ");
    };

    // String: may be plain text or a serialized structured payload
    if (typeof sanitized === "string") {
        const parsed = parseAssistantPayloadItem(sanitized);
        if (parsed && typeof parsed === "object") {
            if (isHidden(parsed)) return "";
            return extractFields(parsed);
        }
        return sanitized;
    }

    // Object: extract text/filename fields directly
    if (!Array.isArray(sanitized)) {
        return extractFields(sanitized);
    }

    // Array of serialized items
    const parts = [];
    for (const item of sanitized) {
        const parsed = parseAssistantPayloadItem(item);
        if (!parsed) {
            if (typeof item === "string" && item.trim()) parts.push(item);
            continue;
        }
        const fields = extractFields(parsed);
        if (fields) parts.push(fields);
    }
    return parts.join(" ");
}

export function buildLegacyInlineAssistantPayloadItems({
    ephemeralContent = "",
    toolCalls = [],
    thinkingDuration = 0,
}) {
    const payload = [];

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        payload.push(
            ...toolCalls.map((toolCall) =>
                serializeAssistantPayloadItem(
                    createAssistantToolEventItem(toolCall),
                ),
            ),
        );
    }

    if (typeof ephemeralContent === "string" && ephemeralContent.trim()) {
        payload.push(
            serializeAssistantPayloadItem(
                createAssistantThinkingItem(
                    ephemeralContent,
                    thinkingDuration || 0,
                ),
            ),
        );
    }

    return payload;
}

export function extractPreviewTextFromStoredPayload(payload) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (typeof payload.text === "string" && payload.text.trim()) {
            return payload.text;
        }

        return (
            payload.displayFilename ||
            payload.originalFilename ||
            payload.filename ||
            ""
        );
    }

    if (typeof payload === "string") {
        const parsed = parseAssistantPayloadItem(payload);
        if (parsed && typeof parsed === "object") {
            if (
                parsed?.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT &&
                typeof parsed.text === "string" &&
                parsed.text.trim()
            ) {
                return parsed.text;
            }

            if (typeof parsed.text === "string" && parsed.text.trim()) {
                return parsed.text;
            }

            const filename =
                parsed.displayFilename ||
                parsed.originalFilename ||
                parsed.filename;
            if (typeof filename === "string" && filename.trim()) {
                return filename;
            }
        }
        return payload;
    }

    if (!Array.isArray(payload)) return "";

    for (const item of payload) {
        const parsed = parseAssistantPayloadItem(item);
        if (!parsed) {
            if (typeof item === "string" && item.trim()) {
                return item;
            }
            continue;
        }

        if (
            parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT &&
            typeof parsed.text === "string" &&
            parsed.text.trim()
        ) {
            return parsed.text;
        }
    }

    return "";
}

export function extractPreviewTextFromAssistantPayload(payload) {
    return extractPreviewTextFromStoredPayload(payload);
}

export function extractCopyTextFromAssistantPayload(payload) {
    if (typeof payload === "string") return payload;
    if (!Array.isArray(payload)) return "";

    return payload
        .map((item) => {
            const parsed = parseAssistantPayloadItem(item);
            if (!parsed) {
                return typeof item === "string" ? item : "";
            }

            if (
                parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.TEXT ||
                parsed.type === ASSISTANT_PAYLOAD_ITEM_TYPES.THINKING
            ) {
                return typeof parsed.text === "string" ? parsed.text : "";
            }

            return "";
        })
        .filter(Boolean)
        .join("\n\n");
}
