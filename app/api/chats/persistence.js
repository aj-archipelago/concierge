import { BSON } from "bson";
import { CHAT_MESSAGE_TARGET_BYTES } from "../../constants/chats.js";

const MAX_PERSISTED_CITATIONS = 20;
const MAX_CITATION_CONTENT_LENGTH = 12_000;
const PAYLOAD_TRUNCATION_NOTICE =
    "\n\n[This message was too large to save in full and was truncated.]";
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

function estimateMessageBytes(message) {
    try {
        return BSON.calculateObjectSize({ message });
    } catch {
        return Buffer.byteLength(JSON.stringify({ message }));
    }
}

function truncateStringPayload(value, maxChars) {
    if (typeof value !== "string" || value.length <= maxChars) {
        return value;
    }
    const keepChars = Math.max(0, maxChars - PAYLOAD_TRUNCATION_NOTICE.length);
    return `${value.slice(0, keepChars)}${PAYLOAD_TRUNCATION_NOTICE}`;
}

function truncatePayloadItem(item, maxChars) {
    if (typeof item !== "string") {
        return item;
    }
    try {
        const parsed = JSON.parse(item);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return truncateStringPayload(item, maxChars);
        }
        if (parsed.type === "thinking") {
            return JSON.stringify({
                ...parsed,
                text: "",
            });
        }
        if (typeof parsed.text === "string") {
            return JSON.stringify({
                ...parsed,
                text: truncateStringPayload(parsed.text, maxChars),
            });
        }
        return truncateStringPayload(item, maxChars);
    } catch {
        return truncateStringPayload(item, maxChars);
    }
}

function truncateMessageToFit(message, targetBytes) {
    if (!message || typeof message !== "object") {
        return message;
    }

    let nextMessage = { ...message };
    let size = estimateMessageBytes(nextMessage);
    if (size <= targetBytes) {
        return nextMessage;
    }

    if (typeof nextMessage.payload === "string") {
        let maxChars = Math.max(
            1_000,
            Math.floor(nextMessage.payload.length / 2),
        );
        while (size > targetBytes && maxChars >= 500) {
            nextMessage = {
                ...nextMessage,
                payload: truncateStringPayload(nextMessage.payload, maxChars),
            };
            size = estimateMessageBytes(nextMessage);
            maxChars = Math.floor(maxChars / 2);
        }
        return nextMessage;
    }

    if (!Array.isArray(nextMessage.payload)) {
        return nextMessage;
    }

    const withoutThinking = nextMessage.payload.filter((item) => {
        try {
            return JSON.parse(item)?.type !== "thinking";
        } catch {
            return true;
        }
    });
    nextMessage = { ...nextMessage, payload: withoutThinking };
    size = estimateMessageBytes(nextMessage);
    if (size <= targetBytes) {
        return nextMessage;
    }

    let maxChars = 20_000;
    while (size > targetBytes && maxChars >= 500) {
        const itemMaxChars = maxChars;
        nextMessage = {
            ...nextMessage,
            payload: nextMessage.payload.map((item) =>
                truncatePayloadItem(item, itemMaxChars),
            ),
        };
        size = estimateMessageBytes(nextMessage);
        maxChars = Math.floor(maxChars / 2);
    }
    return nextMessage;
}

export function prepareMessageForPersistence(
    message,
    { targetBytes = CHAT_MESSAGE_TARGET_BYTES } = {},
) {
    const sanitized = sanitizeMessagesForPersistence([message])[0];
    if (!sanitized) return { message: sanitized, wasTruncated: false };

    const initialBytes = estimateMessageBytes(sanitized);
    if (initialBytes <= targetBytes) {
        return { message: sanitized, wasTruncated: false };
    }

    // These fields are useful UI caches, not the canonical response. Drop them
    // before touching user-visible message content.
    const bounded = {
        ...sanitized,
        ephemeralContent: null,
        toolCalls: null,
        task: sanitized.taskId ? undefined : sanitized.task,
        tool: null,
    };
    let truncated = truncateMessageToFit(bounded, targetBytes);

    // Mixed metadata can still defeat size estimates. Always leave a valid,
    // explicit message instead of repeatedly shrinking the surrounding chat.
    if (estimateMessageBytes(truncated) > targetBytes) {
        truncated = {
            _id: bounded._id,
            payload: Array.isArray(bounded.payload)
                ? [
                      JSON.stringify({
                          type: "text",
                          text: PAYLOAD_TRUNCATION_NOTICE.trim(),
                      }),
                  ]
                : PAYLOAD_TRUNCATION_NOTICE.trim(),
            sender: bounded.sender,
            sentTime: bounded.sentTime,
            direction: bounded.direction,
            position: bounded.position,
            taskId: bounded.taskId,
            isServerGenerated: bounded.isServerGenerated,
        };
    }

    return { message: truncated, wasTruncated: true };
}
