import User from "../models/user";
import Chat from "../models/chat.mjs";
import { getCurrentUser } from "../utils/auth";
import mongoose from "mongoose";
import { Types } from "mongoose";
import { parseSearchQuery, matchesAllTerms } from "../utils/search-parser";
import {
    extractPreviewTextFromStoredPayload,
    extractSearchableText,
} from "../../../src/utils/assistantInlinePayload";
import { NEW_CHAT_ID } from "../../utils/chatClientIds";
import {
    CHAT_STORAGE_WARNING_BYTES,
    prepareMessagesForPersistence,
    sanitizeToolForPersistence,
} from "./persistence.js";

export {
    CHAT_DOCUMENT_LIMIT_BYTES,
    CHAT_STORAGE_WARNING_BYTES,
    prepareMessagesForPersistence,
    sanitizeMessagesForPersistence,
    sanitizeToolForPersistence,
} from "./persistence.js";

/**
 * Sanitizes a message object to remove Mongoose metadata fields (createdAt, updatedAt)
 * that shouldn't be sent to the client or included in updates.
 * Also limits tool metadata to the fields consumed by the client.
 */
export function sanitizeMessage(msg) {
    if (!msg) return null;
    const msgObj = msg.toObject ? msg.toObject() : msg;
    return {
        payload: msgObj.payload,
        sender: msgObj.sender,
        tool: sanitizeToolForPersistence(msgObj.tool) || null,
        sentTime: msgObj.sentTime,
        direction: msgObj.direction,
        position: msgObj.position,
        entityId: msgObj.entityId || null,
        taskId: msgObj.taskId || null,
        isServerGenerated: msgObj.isServerGenerated || false,
        ephemeralContent: msgObj.ephemeralContent || null,
        thinkingDuration: msgObj.thinkingDuration || 0,
        // Preserve toolCalls if it's an array, otherwise set to null (never undefined)
        toolCalls: Array.isArray(msgObj.toolCalls) ? msgObj.toolCalls : null,
        task: msgObj.task || null,
        _id: msgObj._id, // Keep _id for client-side reference
    };
}

const MAX_PREVIEW_LENGTH = 200;

const extractPreviewText = (message) => {
    if (!message || typeof message !== "object") return "";
    const payload = message.payload;
    return extractPreviewTextFromStoredPayload(payload);
};

export const buildLastMessagePreview = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) {
        return {
            lastMessagePreview: "",
            lastMessageSender: "",
            lastMessageAt: "",
        };
    }

    const lastMessage = messages[messages.length - 1];
    const preview = extractPreviewText(lastMessage);

    return {
        lastMessagePreview: preview ? preview.slice(0, MAX_PREVIEW_LENGTH) : "",
        lastMessageSender: lastMessage?.sender || "",
        lastMessageAt: lastMessage?.sentTime || "",
    };
};

const serializeForPersistenceComparison = (value) => {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

// Search limits for title search
const DEFAULT_TITLE_SEARCH_LIMIT = 20;
const DEFAULT_TITLE_SEARCH_SCAN_LIMIT = 500;
const getSimpleTitle = (message) => {
    return extractPreviewText(message).substring(0, 14);
};

export async function getRecentChatsOfCurrentUser() {
    const currentUser = await getCurrentUser(false);
    if (!currentUser?._id || currentUser.userId === "nodb") {
        return [];
    }
    const recentChatIds = currentUser.recentChatIds || [];

    const recentChatsUnordered = await Chat.find(
        {
            _id: { $in: recentChatIds },
            userId: currentUser._id,
        },
        { _id: 1, title: 1, titleSetByUser: 1, isUnused: 1 },
    ).lean();

    // For chats without a custom title, fetch the first message separately
    // This approach avoids truncating the messages array in the main cache
    const firstChatId =
        recentChatIds.length > 0 ? String(recentChatIds[0]) : null;
    const chatsNeedingFirstMessage = recentChatsUnordered.filter((chat) => {
        const isFirstChat = firstChatId && String(chat._id) === firstChatId;
        return (
            isFirstChat ||
            !chat.title ||
            chat.title === "New Chat" ||
            chat.title === ""
        );
    });

    if (chatsNeedingFirstMessage.length > 0) {
        const chatIds = chatsNeedingFirstMessage.map((chat) => chat._id);
        const chatsWithFirstMessage = await Chat.find(
            { _id: { $in: chatIds } },
            { messages: { $slice: 1 } },
        ).lean();
        const firstMessageMap = new Map(
            chatsWithFirstMessage.map((chat) => [
                String(chat._id),
                chat?.messages?.[0],
            ]),
        );

        for (const chat of chatsNeedingFirstMessage) {
            const firstMessage = firstMessageMap.get(String(chat._id));
            if (firstMessage) {
                chat.firstMessage = firstMessage;
            }
        }
    }

    const recentChatsMap = recentChatsUnordered.reduce((acc, chat) => {
        acc[chat._id] = chat;
        return acc;
    }, {});

    const recentChats = recentChatIds
        .filter((id) => recentChatsMap[id])
        .map((id) => recentChatsMap[id]);

    return recentChats;
}

export async function getChatsOfCurrentUser(page = 1, limit = 20) {
    const user = await getCurrentUser(false);
    if (!user?._id || user.userId === "nodb") {
        return [];
    }
    const userId = user._id;

    const skip = (page - 1) * limit;

    const projection = {
        _id: 1,
        title: 1,
        createdAt: 1,
        updatedAt: 1,
        isPublic: 1,
        isUnused: 1,
        titleSetByUser: 1,
        lastMessagePreview: 1,
        lastMessageSender: 1,
        lastMessageAt: 1,
    };

    // Filter out unused chats - they shouldn't appear in the saved chats list
    let chats = await Chat.find({ userId, isUnused: { $ne: true } }, projection)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // If no chats exist and it's the first page, create a default empty chat
    if (chats.length === 0 && page === 1) {
        const defaultChat = await createNewChat({
            messages: [],
            title: "",
        });
        chats = [defaultChat.toObject ? defaultChat.toObject() : defaultChat];
    }

    chats = chats.map((chat) => ({
        ...chat,
        messagesTruncated: true,
    }));

    const missingPreviewIds = chats
        .filter((chat) => {
            if (chat.isUnused) return false;
            const missingPreview =
                !chat.lastMessagePreview || chat.lastMessagePreview === "";
            const missingSender =
                !chat.lastMessageSender || chat.lastMessageSender === "";
            const missingAt = !chat.lastMessageAt || chat.lastMessageAt === "";
            return missingPreview && missingSender && missingAt;
        })
        .map((chat) => chat._id);

    if (missingPreviewIds.length > 0) {
        const previews = await Chat.find(
            { _id: { $in: missingPreviewIds }, userId },
            { _id: 1, updatedAt: 1, messages: { $slice: -1 } },
        ).lean();

        const previewMap = new Map();
        const bulkOps = [];

        for (const previewChat of previews) {
            const preview = buildLastMessagePreview(previewChat.messages || []);
            if (
                !preview.lastMessagePreview &&
                !preview.lastMessageSender &&
                !preview.lastMessageAt &&
                Array.isArray(previewChat.messages) &&
                previewChat.messages.length > 0
            ) {
                // Non-text or legacy messages may not generate a preview.
                // Persist lastMessageAt to prevent repeated backfill queries.
                preview.lastMessageAt =
                    previewChat.messages[0]?.sentTime || previewChat.updatedAt;
            }
            previewMap.set(String(previewChat._id), preview);
            if (
                preview.lastMessagePreview ||
                preview.lastMessageSender ||
                preview.lastMessageAt
            ) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: previewChat._id },
                        update: { $set: preview },
                    },
                });
            }
        }

        if (bulkOps.length > 0) {
            Chat.bulkWrite(bulkOps, { ordered: false }).catch((error) => {
                console.warn("Failed to backfill chat previews:", error);
            });
        }

        chats = chats.map((chat) => {
            const preview = previewMap.get(String(chat._id));
            if (!preview) return chat;
            return { ...chat, ...preview };
        });
    }

    return chats;
}

export async function createNewChat(
    data,
    { setActive = true, forceNew = false } = {},
) {
    const { messages, title, isUnused } = data;
    const currentUser = await getCurrentUser(false);
    const userId = currentUser._id;

    const normalizedMessages = Array.isArray(messages)
        ? messages
        : messages
          ? [messages]
          : [];

    const prepared = prepareMessagesForPersistence(normalizedMessages);
    const messagesForPersistence = prepared.messages;

    // Only look for existing unused chat if we're creating a new empty chat and not forcing new
    if (!forceNew && messagesForPersistence.length === 0) {
        const activeChatIdStr = currentUser.activeChatId
            ? String(currentUser.activeChatId)
            : null;
        // Prefer an unused chat that isn't the current active one
        const unusedChats = await Chat.find({
            userId: currentUser._id,
            isUnused: true,
        })
            .sort({ createdAt: -1 })
            .limit(2);

        const unusedChat = unusedChats.find(
            (chat) => String(chat._id) !== activeChatIdStr,
        );
        if (unusedChat) {
            if (setActive) {
                await setActiveChatId(unusedChat._id);
            }
            return unusedChat;
        }
    }

    const chat = new Chat({
        userId,
        messages: messagesForPersistence,
        isUnused:
            typeof isUnused === "boolean"
                ? isUnused
                : messagesForPersistence.length === 0,
        title: title || getSimpleTitle(messagesForPersistence[0] || ""),
        messageStorageBytes: prepared.messageStorageBytes,
        messagesCompacted: prepared.messagesCompacted,
        messagesCompactedAt: prepared.messagesCompacted ? new Date() : null,
        ...buildLastMessagePreview(messagesForPersistence),
    });

    await chat.save();
    if (setActive) {
        await setActiveChatId(chat._id);
    }
    return chat;
}

export async function getChatById(chatId, { limit } = {}) {
    if (chatId === NEW_CHAT_ID) {
        return {
            _id: NEW_CHAT_ID,
            title: "",
            messages: [],
            isPublic: false,
            readOnly: false,
            isChatLoading: false,
            isTemporary: true,
        };
    }

    if (!chatId || !Types.ObjectId.isValid(chatId)) {
        return null;
    }

    const currentUser = await getCurrentUser(false);

    const effectiveLimit =
        typeof limit === "number" && limit > 0 ? limit + 1 : null;
    const messageProjection = effectiveLimit ? { $slice: -effectiveLimit } : 1;

    let chat = await Chat.findOne(
        { _id: chatId },
        {
            _id: 1,
            title: 1,
            messages: messageProjection,
            isPublic: 1,
            isChatLoading: 1,
            activeSubscriptionId: 1,
            titleSetByUser: 1,
            selectedEntityId: 1,
            messageStorageBytes: 1,
            messagesCompacted: 1,
            messagesCompactedAt: 1,
            userId: 1,
        },
    ).lean();

    if (!chat) {
        return null;
    }

    const isOwner = String(chat.userId) === String(currentUser._id);
    if (!isOwner && !chat.isPublic) {
        throw new Error("Unauthorized access");
    }

    if (
        isOwner &&
        Number(chat.messageStorageBytes || 0) >= CHAT_STORAGE_WARNING_BYTES
    ) {
        const fullChat = await Chat.findOne(
            { _id: chatId, userId: currentUser._id },
            {
                messages: 1,
            },
        ).lean();
        const prepared = prepareMessagesForPersistence(
            fullChat?.messages || [],
        );
        const messagesChanged =
            serializeForPersistenceComparison(fullChat?.messages || []) !==
            serializeForPersistenceComparison(prepared.messages);
        const compactionTimestampNeedsUpdate = prepared.messagesCompacted
            ? !chat.messagesCompactedAt
            : Boolean(chat.messagesCompactedAt);
        const currentMessagesCompacted = chat.messagesCompacted === true;
        const storageStatusChanged =
            Number(chat.messageStorageBytes || 0) !==
                prepared.messageStorageBytes ||
            currentMessagesCompacted !== prepared.messagesCompacted ||
            compactionTimestampNeedsUpdate;
        let nextMessagesCompactedAt = null;
        if (prepared.messagesCompacted) {
            nextMessagesCompactedAt =
                messagesChanged || !chat.messagesCompactedAt
                    ? new Date()
                    : chat.messagesCompactedAt;
        }

        const storageUpdate = {
            messages: prepared.messages,
            messageStorageBytes: prepared.messageStorageBytes,
            messagesCompacted: prepared.messagesCompacted,
            messagesCompactedAt: nextMessagesCompactedAt,
            ...buildLastMessagePreview(prepared.messages),
        };

        if (messagesChanged || storageStatusChanged) {
            await Chat.updateOne(
                { _id: chatId, userId: currentUser._id },
                { $set: storageUpdate },
            );
        }

        chat = {
            ...chat,
            ...storageUpdate,
            messages: effectiveLimit
                ? prepared.messages.slice(-effectiveLimit)
                : prepared.messages,
        };
    }

    const isReadOnly = !isOwner;
    const {
        _id,
        title,
        messages,
        isPublic,
        isChatLoading,
        activeSubscriptionId,
        titleSetByUser,
        selectedEntityId,
        messageStorageBytes,
        messagesCompacted,
        messagesCompactedAt,
    } = chat;

    const rawMessages = Array.isArray(messages) ? messages : [];
    const trimmedMessages = effectiveLimit
        ? rawMessages.slice(-limit)
        : rawMessages;

    // Sanitize messages to remove Mongoose metadata fields (createdAt, updatedAt)
    // that shouldn't be sent to the client
    const sanitizedMessages = trimmedMessages.map(sanitizeMessage);

    const hasMoreMessages = effectiveLimit ? rawMessages.length > limit : false;

    const result = {
        _id,
        title,
        messages: sanitizedMessages,
        isPublic,
        readOnly: isReadOnly,
        isChatLoading,
        activeSubscriptionId: activeSubscriptionId || null,
        titleSetByUser,
        selectedEntityId,
        messageStorageBytes: messageStorageBytes || 0,
        messagesCompacted: messagesCompacted === true,
        messagesCompactedAt: messagesCompactedAt || null,
        messagesTruncated: hasMoreMessages,
        hasMoreMessages,
    };

    if (isReadOnly) {
        const owner = await User.findById(chat.userId)
            .select({ name: 1, username: 1 })
            .lean();
        if (owner) {
            result.owner = {
                name: owner.name,
                username: owner.username,
            };
        }
    }

    return result;
}

export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    if (!mongoose.Types.ObjectId.isValid(activeChatId)) {
        throw new Error("Invalid activeChatId");
    }

    const currentUser = await getCurrentUser(false);
    let recentChatIds = currentUser.recentChatIds || [];
    // Normalize to strings and remove duplicates while preserving order
    const seenIds = new Set();
    recentChatIds = recentChatIds
        .map((id) => String(id))
        .filter((id) => {
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });

    const activeChatIdStr = String(activeChatId);
    const existingIndex = recentChatIds.indexOf(activeChatIdStr);

    if (existingIndex === -1) {
        recentChatIds.unshift(activeChatIdStr);
    } else if (existingIndex > 0) {
        recentChatIds.splice(existingIndex, 1);
        recentChatIds.unshift(activeChatIdStr);
    }

    // Ensure we only keep the last n recent chat IDs
    const MAX_RECENT_CHATS = 1_000;
    recentChatIds = recentChatIds.slice(0, MAX_RECENT_CHATS);

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        { $set: { recentChatIds, activeChatId } },
        { new: true, useFindAndModify: false },
    );

    if (!updatedUser) throw new Error("User not found");

    return {
        recentChatIds: updatedUser.recentChatIds,
        activeChatId: updatedUser.activeChatId,
    };
}

export async function getUserChatInfo() {
    const currentUser = await getCurrentUser(false);
    if (!currentUser?._id || currentUser.userId === "nodb") {
        return {
            recentChatIds: [],
            activeChatId: null,
        };
    }
    let recentChatIds = currentUser.recentChatIds || [];
    let activeChatId = currentUser.activeChatId;

    if (activeChatId) {
        const chatExists = await Chat.exists({
            _id: activeChatId,
            userId: currentUser._id,
        });
        if (!chatExists) {
            activeChatId = null;
        }
    }

    if (!activeChatId) {
        // Find the latest unused chat, or create a new one
        const existingUnusedChat = await Chat.findOne({
            userId: currentUser._id,
            isUnused: true,
        }).sort({ createdAt: -1 });

        if (existingUnusedChat) {
            activeChatId = existingUnusedChat._id;
        } else {
            const emptyChat = await createNewChat({
                messages: [],
                title: "",
            });
            activeChatId = emptyChat._id;
        }

        await User.findByIdAndUpdate(
            currentUser._id,
            {
                $set: { activeChatId },
                $addToSet: { recentChatIds: activeChatId },
            },
            { new: true, useFindAndModify: false },
        );
    }

    // Maintain order and remove non-existing chats
    const existingChats = await Chat.find(
        {
            _id: { $in: recentChatIds },
            userId: currentUser._id,
        },
        "_id",
    );
    const existingChatIds = new Set(
        existingChats.map((chat) => chat._id.toString()),
    );
    recentChatIds = recentChatIds.filter((id) =>
        existingChatIds.has(id.toString()),
    );

    return {
        recentChatIds,
        activeChatId: activeChatId ? String(activeChatId) : null,
    };
}

export async function getActiveChatId() {
    const { activeChatId } = await getUserChatInfo();
    return activeChatId;
}

// Timeout for stop requested subscription IDs (30 minutes)
// Streams should complete well before this, so any IDs older than this are orphaned
export const STOP_REQUESTED_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Helper to extract subscriptionId from entry (handles both legacy string and new object format)
 */
export function getEntrySubscriptionId(entry) {
    if (typeof entry === "string") return entry;
    return entry?.subscriptionId;
}

/**
 * Helper to check if entry matches subscriptionId (with type coercion)
 */
function entryMatchesSubscriptionId(entry, normalizedId) {
    const entryId = getEntrySubscriptionId(entry);
    return entryId && String(entryId) === normalizedId;
}

/**
 * Clean up stale stop requested subscription IDs
 * Removes entries older than STOP_REQUESTED_TIMEOUT_MS
 * Also removes legacy string format entries
 */
export function cleanupStaleStopRequestedIds(stopRequestedIds) {
    if (!Array.isArray(stopRequestedIds)) return [];
    const now = Date.now();
    return stopRequestedIds.filter((entry) => {
        // Handle legacy string format - remove it (no timestamp, can't verify age)
        if (typeof entry === "string") {
            return false;
        }
        // Handle new format (object with timestamp)
        if (entry && entry.subscriptionId && entry.timestamp) {
            const age = now - new Date(entry.timestamp).getTime();
            return age < STOP_REQUESTED_TIMEOUT_MS;
        }
        // Invalid format - remove it
        return false;
    });
}

/**
 * Check if a subscription ID is in the stop requested array
 * Handles type coercion for robust comparison
 */
export function isSubscriptionStopped(stopRequestedIds, subscriptionId) {
    if (!Array.isArray(stopRequestedIds) || !subscriptionId) return false;
    const normalizedId = String(subscriptionId);
    return stopRequestedIds.some((entry) =>
        entryMatchesSubscriptionId(entry, normalizedId),
    );
}

/**
 * Remove a subscription ID from the stop requested array
 * Handles type coercion for robust comparison
 */
export function removeStoppedSubscription(stopRequestedIds, subscriptionId) {
    if (!Array.isArray(stopRequestedIds) || !subscriptionId) return [];
    const normalizedId = String(subscriptionId);
    return stopRequestedIds.filter(
        (entry) => !entryMatchesSubscriptionId(entry, normalizedId),
    );
}

/**
 * Add a subscription ID to the stop requested array (or update timestamp if exists)
 * Normalizes subscriptionId to string for consistency
 */
export function addStoppedSubscription(stopRequestedIds, subscriptionId) {
    if (!subscriptionId) return stopRequestedIds || [];
    const normalizedId = String(subscriptionId);
    const cleaned = cleanupStaleStopRequestedIds(stopRequestedIds || []);
    const now = new Date();

    // Check if already exists
    const existingIndex = cleaned.findIndex((entry) =>
        entryMatchesSubscriptionId(entry, normalizedId),
    );

    if (existingIndex >= 0) {
        // Update timestamp
        return cleaned.map((entry, index) =>
            index === existingIndex
                ? { subscriptionId: normalizedId, timestamp: now }
                : entry,
        );
    }

    // Add new entry
    return [...cleaned, { subscriptionId: normalizedId, timestamp: now }];
}

export async function getRecentChatIds() {
    const { recentChatIds } = await getUserChatInfo();
    return recentChatIds;
}

export async function deleteChatIdFromRecentList(chatId) {
    const currentUser = await getCurrentUser(false);
    const userId = currentUser._id;

    // Get current user data
    const user = await User.findById(userId);
    let recentChatIds = user.recentChatIds.filter(
        (id) => id.toString() !== chatId.toString(),
    );
    let activeChatId = user.activeChatId;

    // Validate existing chats while preserving order
    const existingChats = await Chat.find(
        { _id: { $in: recentChatIds }, userId },
        "_id",
    );
    const existingChatIds = new Set(
        existingChats.map((chat) => chat._id.toString()),
    );
    recentChatIds = recentChatIds.filter((id) =>
        existingChatIds.has(id.toString()),
    );

    // Check if activeChatId is valid
    const activeChatExists = await Chat.exists({ _id: activeChatId, userId });
    if (!activeChatExists) {
        if (recentChatIds.length > 0) {
            activeChatId = recentChatIds[0];
        } else {
            const userChat = await Chat.findOne({ userId });
            if (userChat) {
                activeChatId = userChat._id;
                recentChatIds.push(activeChatId.toString());
            } else {
                const emptyChat = await createNewChat({
                    messages: [],
                    title: "",
                });
                activeChatId = emptyChat._id;
                recentChatIds.push(activeChatId.toString());
            }
        }
    }

    // Update user with validated data
    await User.updateOne(
        { _id: userId },
        { $set: { recentChatIds, activeChatId } },
    );

    return { recentChatIds, activeChatId: activeChatId.toString() };
}

// Returns total number of chats for current user
export async function getTotalChatCount() {
    const currentUser = await getCurrentUser(false);
    return await Chat.countDocuments({ userId: currentUser._id });
}

// Title search that avoids regex on encrypted fields by filtering in memory
// Scans recent chats up to scanLimit and returns up to limit matches
// Supports space-separated terms with AND logic and "quoted phrases"
export async function searchChatTitles(
    searchTerm,
    {
        limit = DEFAULT_TITLE_SEARCH_LIMIT,
        scanLimit = DEFAULT_TITLE_SEARCH_SCAN_LIMIT,
    } = {},
) {
    const currentUser = await getCurrentUser(false);
    const term = String(searchTerm || "").trim();
    if (!term) return [];

    // Parse search query into terms (handles quotes and spaces)
    const searchTerms = parseSearchQuery(term);
    if (searchTerms.length === 0) return [];

    // Fetch a window of recent chats; fields will be auto-decrypted by CSFLE
    const chats = await Chat.find(
        { userId: currentUser._id },
        {
            _id: 1,
            title: 1,
            createdAt: 1,
            updatedAt: 1,
            lastMessagePreview: 1,
            lastMessageSender: 1,
            lastMessageAt: 1,
        },
    )
        .sort({ updatedAt: -1 })
        .limit(scanLimit)
        .lean();

    const results = [];
    for (const chat of chats) {
        const title = chat?.title || "";
        if (matchesAllTerms(title, searchTerms)) {
            results.push(chat);
            if (results.length >= limit) break;
        }
    }
    return results;
}

// Content search that avoids regex on encrypted fields by filtering in memory
// Scans recent chats (by updatedAt desc) up to scanLimit
// For speed, only inspects the last `slice` messages per chat
// Supports space-separated terms with AND logic and "quoted phrases"
const MIN_MESSAGE_SLICE = 1;

const getMessageSliceWindow = (slice) => -Math.max(MIN_MESSAGE_SLICE, slice);

export async function searchChatContent(
    searchTerm,
    { limit = 20, scanLimit = 500, slice = 50 } = {},
) {
    const currentUser = await getCurrentUser(false);
    const term = String(searchTerm || "").trim();
    if (!term) return [];

    // Parse search query into terms (handles quotes and spaces)
    const searchTerms = parseSearchQuery(term);
    if (searchTerms.length === 0) return [];

    // Fetch a window of recent chats; fields will be auto-decrypted by CSFLE
    const chats = await Chat.find(
        { userId: currentUser._id },
        {
            _id: 1,
            title: 1,
            createdAt: 1,
            updatedAt: 1,
            lastMessagePreview: 1,
            lastMessageSender: 1,
            lastMessageAt: 1,
            // Use a helper to ensure at least one message is returned when slice <= 0.
            messages: { $slice: getMessageSliceWindow(slice) },
        },
    )
        .sort({ updatedAt: -1 })
        .limit(scanLimit)
        .lean();

    const results = [];
    for (const chat of chats) {
        const msgs = Array.isArray(chat?.messages) ? chat.messages : [];
        const hasMatch = msgs.some((m) => {
            const text = extractSearchableText(m?.payload);
            return text ? matchesAllTerms(text, searchTerms) : false;
        });
        if (hasMatch) {
            results.push(chat);
            if (results.length >= limit) break;
        }
    }
    return results;
}
