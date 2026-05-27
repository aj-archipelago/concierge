import { BSON } from "bson";

const MAX_PERSISTED_CITATIONS = 20;
const MAX_CITATION_CONTENT_LENGTH = 12_000;
export const CHAT_DOCUMENT_LIMIT_BYTES = 2_000_000;
export const CHAT_STORAGE_WARNING_BYTES = Math.floor(
    CHAT_DOCUMENT_LIMIT_BYTES * 0.9,
);
const CHAT_MESSAGES_TARGET_BYTES = CHAT_STORAGE_WARNING_BYTES;
const CITATION_FIELD_WHITELIST = [
    "content",
    "date",
    "path",
    "searchResultId",
    "slugline",
    "source",
    "title",
    "url",
    "wireid",
];
const MESSAGE_FIELD_WHITELIST = [
    "_id",
    "payload",
    "sender",
    "tool",
    "sentTime",
    "direction",
    "position",
    "entityId",
    "taskId",
    "task",
    "isServerGenerated",
    "ephemeralContent",
    "thinkingDuration",
    "toolCalls",
];

function truncateCitationContent(content) {
    if (
        typeof content !== "string" ||
        content.length <= MAX_CITATION_CONTENT_LENGTH
    ) {
        return content;
    }

    return `${content.slice(
        0,
        MAX_CITATION_CONTENT_LENGTH,
    )}\n\n[Citation preview truncated: ${
        content.length - MAX_CITATION_CONTENT_LENGTH
    } characters omitted]`;
}

function sanitizeCitation(citation) {
    if (!citation || typeof citation !== "object" || Array.isArray(citation)) {
        return null;
    }

    const sanitized = {};
    for (const field of CITATION_FIELD_WHITELIST) {
        const value = citation[field];
        if (value == null) continue;
        if (field === "content") {
            if (typeof value === "string") {
                sanitized.content = truncateCitationContent(value);
            }
            continue;
        }
        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            sanitized[field] = value;
        }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Persists only the message tool metadata the app actually consumes.
 * The full stream info can contain artifacts, screenshots, callback args, and
 * prior chat history, which do not belong in the chat document.
 */
export function sanitizeToolForPersistence(tool) {
    if (!tool) return tool;

    try {
        const toolObj = typeof tool === "string" ? JSON.parse(tool) : tool;
        if (!toolObj || typeof toolObj !== "object" || Array.isArray(toolObj)) {
            return null;
        }

        const sanitized = {};
        if (Array.isArray(toolObj.citations)) {
            const citations = toolObj.citations
                .slice(0, MAX_PERSISTED_CITATIONS)
                .map(sanitizeCitation)
                .filter(Boolean);
            if (citations.length > 0) {
                sanitized.citations = citations;
            }
        }

        if (toolObj.hideFromModel === true) {
            sanitized.hideFromModel = true;
        }

        return Object.keys(sanitized).length > 0
            ? JSON.stringify(sanitized)
            : null;
    } catch (e) {
        console.warn("Failed to parse tool field for persistence:", e);
        return null;
    }
}

export function sanitizeMessagesForPersistence(messages) {
    if (!Array.isArray(messages)) return messages;

    return messages.map((msg) => {
        if (!msg || typeof msg !== "object") return msg;

        const msgObj =
            typeof msg.toObject === "function"
                ? msg.toObject({ depopulate: true })
                : msg;
        const sanitized = {};

        for (const field of MESSAGE_FIELD_WHITELIST) {
            const value = msgObj[field];
            if (value !== undefined) {
                sanitized[field] = value;
            }
        }

        if (sanitized.tool) {
            sanitized.tool = sanitizeToolForPersistence(sanitized.tool);
        }

        return sanitized;
    });
}

function estimateMessagesBytes(messages) {
    try {
        return BSON.calculateObjectSize({ messages });
    } catch {
        return Buffer.byteLength(JSON.stringify({ messages }));
    }
}

export function prepareMessagesForPersistence(
    messages,
    { targetBytes = CHAT_MESSAGES_TARGET_BYTES } = {},
) {
    const sanitizedMessages = sanitizeMessagesForPersistence(messages || []);
    const initialBytes = estimateMessagesBytes(sanitizedMessages);
    if (initialBytes <= targetBytes) {
        return {
            messages: sanitizedMessages,
            messageStorageBytes: initialBytes,
            messagesCompacted: false,
            messagesDropped: 0,
        };
    }

    let messagesForPersistence = [...sanitizedMessages];
    let droppedCount = 0;
    let messageStorageBytes = initialBytes;

    while (
        messagesForPersistence.length > 1 &&
        messageStorageBytes > targetBytes
    ) {
        messagesForPersistence.shift();
        droppedCount += 1;
        messageStorageBytes = estimateMessagesBytes(messagesForPersistence);
    }

    return {
        messages: messagesForPersistence,
        messageStorageBytes,
        messagesCompacted: droppedCount > 0,
        messagesDropped: droppedCount,
    };
}
