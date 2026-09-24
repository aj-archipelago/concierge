import { Types } from "mongoose";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import Chat from "../models/chat.mjs";
import ChatMessage from "../models/chat-message.mjs";
import { extractPreviewTextFromStoredPayload } from "../../../src/utils/assistantInlinePayload.js";
import { prepareMessageForPersistence } from "./persistence.js";
import { withCosmosRetry } from "../utils/db-retry.mjs";

export const EXTERNAL_MESSAGE_STORAGE = "external";
export const MESSAGE_SEARCH_BATCH_SIZE = 20;
const MAX_PREVIEW_LENGTH = 200;

const toPlain = (value) =>
    value && typeof value.toObject === "function"
        ? value.toObject({ depopulate: true })
        : value;

const normalizeMessage = (message) => {
    const prepared = prepareMessageForPersistence(message);
    const normalized = { ...prepared.message };
    normalized._id = Types.ObjectId.isValid(normalized._id)
        ? new Types.ObjectId(normalized._id)
        : new Types.ObjectId();
    return normalized;
};

const dedupeDocumentId = (chatId, generationId, dedupeKey) =>
    new Types.ObjectId(
        createHash("sha256")
            .update(`${chatId}:${generationId}:${dedupeKey}`)
            .digest("hex")
            .slice(0, 24),
    );

const buildPreview = (messages) => {
    const lastMessage = messages.at(-1);
    const preview = extractPreviewTextFromStoredPayload(lastMessage?.payload);
    return {
        lastMessagePreview: preview ? preview.slice(0, MAX_PREVIEW_LENGTH) : "",
        lastMessageSender: lastMessage?.sender || "",
        lastMessageAt: lastMessage?.sentTime || "",
    };
};

const activeExternalGeneration = (chat) =>
    chat?.messageStorageGeneration &&
    chat.messageStorageMode === EXTERNAL_MESSAGE_STORAGE
        ? chat.messageStorageGeneration
        : null;

export const usesExternalMessageStorage = (chat) =>
    Boolean(activeExternalGeneration(chat));

async function insertMessageSet(
    chatId,
    generationId,
    messages,
    { preserveExisting = false } = {},
) {
    // Migration copies already-saved history. Applying the new-message sanitizer
    // here would silently discard saved tool metadata or truncate old payloads.
    const normalizedMessages = messages.map(
        preserveExisting ? toPlain : normalizeMessage,
    );
    if (normalizedMessages.length === 0) return normalizedMessages;

    const operations = normalizedMessages.map((message, index) => ({
        updateOne: {
            filter: {
                chatId,
                generationId,
                sequence: index + 1,
            },
            update: {
                $setOnInsert: {
                    chatId,
                    generationId,
                    sequence: index + 1,
                    messageId: message._id,
                    ...(message.taskId ? { taskId: message.taskId } : {}),
                    message,
                },
            },
            upsert: true,
            ...(preserveExisting ? { timestamps: false } : {}),
        },
    }));
    // Sequence-scoped upserts remain idempotent after partial bulk success.
    // Retry throttling before verification/promotion; never retry the pointer
    // switch or remove the embedded source because copying was throttled.
    await withCosmosRetry(
        () => ChatMessage.bulkWrite(operations, { ordered: true }),
        { label: "Chat message copy", attempts: 5 },
    );

    return normalizedMessages;
}

export async function ensureExternalMessageStorage(chatOrId) {
    const chatId = chatOrId?._id || chatOrId;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const chat = await Chat.findById(chatId);
        if (!chat) return null;
        if (chat.messageStorageMode === EXTERNAL_MESSAGE_STORAGE) return chat;

        const generationId = new Types.ObjectId();
        const legacyMessages = Array.isArray(chat.messages)
            ? chat.messages.map(toPlain)
            : [];
        const normalizedMessages = await insertMessageSet(
            chatId,
            generationId,
            legacyMessages,
            { preserveExisting: true },
        );
        // Verify the stored copy before removing the embedded source. A failed
        // or stale read leaves the original intact and can be retried safely.
        const copied = await ChatMessage.find({ chatId, generationId })
            .sort({ sequence: 1 })
            .select({ message: 1 })
            .lean();
        if (
            !isDeepStrictEqual(
                copied.map((document) => document.message),
                normalizedMessages,
            )
        ) {
            throw new Error(
                `Chat ${chatId} message copy did not match its source`,
            );
        }

        // Do not clean up the copy on an exception: Cosmos may have committed
        // this pointer switch even when its acknowledgement never reaches us.
        // Ambiguous copies stay recoverable; only a definite CAS miss is cleaned.
        const promoted = await Chat.findOneAndUpdate(
            {
                _id: chatId,
                updatedAt: chat.updatedAt,
                $or: [
                    { messageStorageMode: { $exists: false } },
                    { messageStorageMode: null },
                ],
            },
            {
                $set: {
                    messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                    messageStorageGeneration: generationId,
                    nextMessageSequence: normalizedMessages.length,
                    ...buildPreview(normalizedMessages),
                },
                $unset: {
                    messages: "",
                    messageStorageBytes: "",
                    messagesCompacted: "",
                    messagesCompactedAt: "",
                },
            },
            { new: true },
        );
        if (promoted) return promoted;

        await ChatMessage.deleteMany({ chatId, generationId });
    }

    throw new Error(`Chat ${chatId} changed repeatedly during promotion`);
}

export async function readChatMessages(
    chat,
    { limit, before, fromStart = false } = {},
) {
    if (!usesExternalMessageStorage(chat)) {
        const all = Array.isArray(chat?.messages)
            ? chat.messages.map(toPlain)
            : [];
        if (fromStart) {
            const boundedLimit =
                Number.isFinite(limit) && limit > 0 ? limit : all.length;
            return {
                messages: all.slice(0, boundedLimit),
                hasMoreMessages: all.length > boundedLimit,
            };
        }
        const beforeIndex = before
            ? all.findIndex(
                  (message) => String(message?._id) === String(before),
              )
            : all.length;
        const end = beforeIndex >= 0 ? beforeIndex : all.length;
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? limit : end;
        const start = Math.max(0, end - boundedLimit);
        return {
            messages: all.slice(start, end),
            hasMoreMessages: start > 0,
        };
    }

    const generationId = activeExternalGeneration(chat);
    const query = { chatId: chat._id, generationId };
    if (before) {
        if (!Types.ObjectId.isValid(before)) {
            return { messages: [], hasMoreMessages: false };
        }
        const anchor = await ChatMessage.findOne({
            chatId: chat._id,
            generationId,
            messageId: new Types.ObjectId(before),
        })
            .select({ sequence: 1 })
            .lean();
        if (!anchor) return { messages: [], hasMoreMessages: false };
        query.sequence = { $lt: anchor.sequence };
    }

    if (!(Number.isFinite(limit) && limit > 0)) {
        const documents = await ChatMessage.find(query)
            .sort({ sequence: 1 })
            .lean();
        return {
            messages: documents.map((document) => document.message),
            hasMoreMessages: false,
        };
    }

    if (fromStart) {
        const documents = await ChatMessage.find(query)
            .sort({ sequence: 1 })
            .limit(limit + 1)
            .lean();
        return {
            messages: documents
                .slice(0, limit)
                .map((document) => document.message),
            hasMoreMessages: documents.length > limit,
        };
    }

    const documents = await ChatMessage.find(query)
        .sort({ sequence: -1 })
        .limit(limit + 1)
        .lean();
    const hasMoreMessages = documents.length > limit;
    return {
        messages: documents
            .slice(0, limit)
            .reverse()
            .map((document) => document.message),
        hasMoreMessages,
    };
}

// Search only the recent window captured by each owned chat header. Stream
// batches so payloads are decrypted without retaining twenty full histories.
export async function findChatsWithMatchingMessages(
    chats,
    matches,
    { limit = 50 } = {},
) {
    const pageSize = Number.isFinite(limit)
        ? Math.max(1, Math.floor(limit))
        : 50;
    const matched = new Set();
    for (
        let offset = 0;
        offset < chats.length;
        offset += MESSAGE_SEARCH_BATCH_SIZE
    ) {
        const batch = chats.slice(offset, offset + MESSAGE_SEARCH_BATCH_SIZE);
        const external = [];
        const fallback = [];
        for (const chat of batch) {
            if (
                !usesExternalMessageStorage(chat) ||
                !Number.isInteger(chat.nextMessageSequence) ||
                chat.nextMessageSequence < 0
            ) {
                fallback.push(chat);
            } else if (chat.nextMessageSequence > 0) {
                external.push(chat);
            }
        }
        if (external.length) {
            const query = {
                chatId: { $in: external.map((chat) => chat._id) },
                $or: external.map((chat) => ({
                    chatId: chat._id,
                    generationId: chat.messageStorageGeneration,
                    sequence: {
                        $gt: Math.max(0, chat.nextMessageSequence - pageSize),
                        $lte: chat.nextMessageSequence,
                    },
                })),
            };
            const { counts, found } = await withCosmosRetry(
                async () => {
                    const counts = new Map();
                    const found = new Set();
                    const cursor = ChatMessage.find(query)
                        .select({ chatId: 1, message: 1 })
                        .lean()
                        .cursor({
                            batchSize: Math.min(
                                1000,
                                external.length * pageSize,
                            ),
                        });
                    for await (const document of cursor) {
                        const id = String(document.chatId);
                        counts.set(id, (counts.get(id) || 0) + 1);
                        if (matches(document.message)) found.add(id);
                    }
                    return { counts, found };
                },
                { label: "Chat content search batch" },
            );
            for (const id of found) matched.add(id);
            for (const chat of external) {
                // Reservations/deduplication can leave sequence gaps. In that
                // case, use the indexed per-chat reader to preserve last-N
                // message semantics rather than silently omitting older hits.
                if (
                    !matched.has(String(chat._id)) &&
                    (counts.get(String(chat._id)) || 0) <
                        Math.min(pageSize, chat.nextMessageSequence)
                )
                    fallback.push(chat);
            }
        }
        for (const chat of fallback) {
            const page = await readChatMessages(chat, { limit: pageSize });
            if (page.messages.some(matches)) matched.add(String(chat._id));
        }
    }
    return matched;
}

export async function appendChatMessage(
    chatOrId,
    message,
    { dedupeKey, expectedState, preserveExisting = false } = {},
) {
    const chatId = chatOrId?._id || chatOrId;
    // Trusted migrations retain original server timestamps and saved tool data.
    const normalizedMessage = preserveExisting
        ? toPlain(message)
        : normalizeMessage(message);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const readyChat = await ensureExternalMessageStorage(chatId);
        if (!readyChat) return null;
        const generationId = readyChat.messageStorageGeneration;
        const documentId = dedupeKey
            ? dedupeDocumentId(chatId, generationId, dedupeKey)
            : new Types.ObjectId();
        if (dedupeKey) {
            const existing = await ChatMessage.findOne({
                _id: documentId,
                chatId,
                generationId,
            }).lean();
            if (existing) return existing.message;
        }

        const reserved = await Chat.findOneAndUpdate(
            {
                ...expectedState,
                _id: chatId,
                messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                messageStorageGeneration: readyChat.messageStorageGeneration,
            },
            { $inc: { nextMessageSequence: 1 } },
            { new: true },
        );
        if (!reserved) {
            // Conditional appends must not retry past a user message, entity
            // switch, or cancellation that won the sequence reservation.
            if (expectedState) return null;
            continue;
        }

        const reservedGenerationId = reserved.messageStorageGeneration;
        const sequence = reserved.nextMessageSequence;
        try {
            await ChatMessage.create({
                _id: documentId,
                chatId,
                generationId: reservedGenerationId,
                sequence,
                messageId: normalizedMessage._id,
                ...(normalizedMessage.taskId
                    ? { taskId: normalizedMessage.taskId }
                    : {}),
                message: normalizedMessage,
            });
        } catch (error) {
            if (error?.code === 11000 && dedupeKey) {
                const existing = await ChatMessage.findOne({
                    _id: documentId,
                    chatId,
                    generationId: reservedGenerationId,
                }).lean();
                if (existing) return existing.message;
            }
            throw error;
        }
        const previewUpdate = await Chat.updateOne(
            {
                _id: chatId,
                messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                messageStorageGeneration: reservedGenerationId,
                $or: [
                    { lastMessageSequence: { $lt: sequence } },
                    { lastMessageSequence: { $exists: false } },
                ],
            },
            {
                $set: {
                    lastMessageSequence: sequence,
                    ...buildPreview([normalizedMessage]),
                },
            },
        );
        if (previewUpdate.matchedCount === 0) {
            // A newer append can already own the preview. Confirm the pointer
            // with a conditional write, since a stale read could otherwise
            // trigger a duplicate append. Retain the copy if it changed.
            const confirmation = await Chat.updateOne(
                {
                    _id: chatId,
                    messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                    messageStorageGeneration: reservedGenerationId,
                },
                { $max: { nextMessageSequence: sequence } },
            );
            if (confirmation.matchedCount === 0) continue;
        }
        return normalizedMessage;
    }

    throw new Error(`Chat ${chatId} message storage changed during append`);
}

export async function replaceChatMessages(chatOrId, messages) {
    const chatId = chatOrId?._id || chatOrId;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const readyChat = await ensureExternalMessageStorage(chatId);
        if (!readyChat) return null;
        const previousGeneration = readyChat.messageStorageGeneration;
        const previousSequence = readyChat.nextMessageSequence || 0;
        const nextGeneration = new Types.ObjectId();
        const normalizedMessages = await insertMessageSet(
            chatId,
            nextGeneration,
            messages,
        );
        const updatedChat = await Chat.findOneAndUpdate(
            {
                _id: chatId,
                messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                messageStorageGeneration: previousGeneration,
                nextMessageSequence: previousSequence,
            },
            {
                $set: {
                    messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                    messageStorageGeneration: nextGeneration,
                    nextMessageSequence: normalizedMessages.length,
                    lastMessageSequence: normalizedMessages.length,
                    ...buildPreview(normalizedMessages),
                },
            },
            { new: true },
        );
        if (!updatedChat) {
            await ChatMessage.deleteMany({
                chatId,
                generationId: nextGeneration,
            });
            continue;
        }
        // Readers may still hold the previous generation under Cosmos bounded
        // staleness. Retain it for those readers and recovery. Cleanup must
        // separately verify that a generation is no longer referenced.
        return { chat: updatedChat, messages: normalizedMessages };
    }

    throw new Error(`Chat ${chatId} changed repeatedly during replacement`);
}

export async function updateChatMessages(chatOrId, messages) {
    const chatId = chatOrId?._id || chatOrId;
    const normalizedMessages = messages
        .filter((message) => Types.ObjectId.isValid(message?._id))
        .map(normalizeMessage);
    if (normalizedMessages.length === 0) return [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const readyChat = await ensureExternalMessageStorage(chatId);
        if (!readyChat) return [];
        const generationId = readyChat.messageStorageGeneration;
        await ChatMessage.bulkWrite(
            normalizedMessages.map((message) => ({
                updateOne: {
                    filter: {
                        chatId,
                        generationId,
                        messageId: message._id,
                    },
                    update: message.taskId
                        ? { $set: { message, taskId: message.taskId } }
                        : {
                              $set: { message },
                              $unset: { taskId: "" },
                          },
                },
            })),
            { ordered: false },
        );
        const stillCurrent = await Chat.exists({
            _id: chatId,
            messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
            messageStorageGeneration: generationId,
        });
        if (stillCurrent) return normalizedMessages;
    }

    throw new Error(`Chat ${chatId} message storage changed during update`);
}

export async function updateChatMessageByTaskId(chatOrId, taskId, task) {
    const chatId = chatOrId?._id || chatOrId;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const readyChat = await ensureExternalMessageStorage(chatId);
        if (!readyChat) return null;
        const generationId = readyChat.messageStorageGeneration;
        const document = await ChatMessage.findOne({
            chatId,
            generationId,
            taskId,
        }).lean();
        if (!document) return null;

        const nextMessage = normalizeMessage({
            ...document.message,
            task: task ? toPlain(task) : undefined,
        });
        const updated = await ChatMessage.findOneAndUpdate(
            { _id: document._id, chatId, generationId },
            { $set: { message: nextMessage } },
            { new: true },
        );
        const stillCurrent = await Chat.exists({
            _id: chatId,
            messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
            messageStorageGeneration: generationId,
        });
        if (updated && stillCurrent) return updated;
    }

    throw new Error(
        `Chat ${chatId} message storage changed during task update`,
    );
}

export async function deleteExternalChatMessages(chatId) {
    return ChatMessage.deleteMany({ chatId });
}
