import User from "../models/user";
import Chat from "../models/chat.mjs";
import Task from "../models/task.mjs";
import { consolidateQuestionConversation } from "../utils/assistant-conversation.mjs";
import { getCurrentUser } from "../utils/auth";
import { resolveShareAccess } from "../utils/shareAccess";
import {
    attachShareFlagsToChats,
    computeIsShared,
} from "../utils/shareHelpers";
import Share from "../models/share.js";
import mongoose from "mongoose";
import { Types } from "mongoose";
import { parseSearchQuery, matchesAllTerms } from "../utils/search-parser";
import {
    extractPreviewTextFromStoredPayload,
    extractSearchableText,
} from "../../../src/utils/assistantInlinePayload";
import { sanitizeToolForPersistence } from "./persistence.js";
import {
    EXTERNAL_MESSAGE_STORAGE,
    MESSAGE_SEARCH_BATCH_SIZE,
    findChatsWithMatchingMessages,
    readChatMessages,
    replaceChatMessages,
    usesExternalMessageStorage,
} from "./message-store.js";

export {
    prepareMessageForPersistence,
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
        // Early inbox deliveries used "bot", which the chat UI treated as a
        // user message. Keep those stored notifications readable as assistants.
        sender:
            msgObj.sender === "bot" && msgObj.isServerGenerated
                ? "concierge"
                : msgObj.sender,
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

// Search limits for title search
const DEFAULT_TITLE_SEARCH_LIMIT = 20;
const DEFAULT_TITLE_SEARCH_SCAN_LIMIT = 500;
// Leave most of the 10-connection Mongo pool available to interactive chat
// traffic while background/list search reads walk individual chat partitions.
const MESSAGE_READ_CONCURRENCY = 4;
const DEFAULT_RECENT_CHAT_LIMIT = 20;
const NEW_CHAT_TITLE = "New Chat";
const getSimpleTitle = (message) => {
    return extractPreviewText(message).substring(0, 14);
};

const nonEmptyFieldQuery = (field) => ({
    [field]: { $exists: true, $nin: ["", null] },
});

const buildVisibleChatQuery = (userId, activeChatId, extraQuery = {}) => {
    const visibilityClauses = [
        { "messages.0": { $exists: true } },
        { titleSetByUser: true },
        {
            title: NEW_CHAT_TITLE,
            titleSetByUser: { $ne: true },
            "messages.0": { $exists: false },
        },
        { isPublic: true },
        { nextMessageSequence: { $gt: 0 } },
        nonEmptyFieldQuery("lastMessageSender"),
        nonEmptyFieldQuery("lastMessageAt"),
        nonEmptyFieldQuery("selectedEntityId"),
    ];

    if (activeChatId) {
        visibilityClauses.push({ _id: activeChatId });
    }

    return {
        archived: { $ne: true },
        ...extraQuery,
        userId,
        $or: visibilityClauses,
    };
};

const RECENT_CHAT_PROJECTION = {
    _id: 1,
    title: 1,
    titleSetByUser: 1,
    lastMessagePreview: 1,
    lastMessageSender: 1,
    lastMessageAt: 1,
    isChatLoading: 1,
    updatedAt: 1,
    pinned: 1,
    pinnedAt: 1,
    archived: 1,
};

const sortRecentChatsForSidebar = (chats) =>
    [...chats].sort((a, b) => {
        const aPinned = a?.pinned ? 1 : 0;
        const bPinned = b?.pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return (
            new Date(b?.updatedAt || 0).getTime() -
            new Date(a?.updatedAt || 0).getTime()
        );
    });

const CHAT_TASK_NOTIFICATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const toIsoTimestamp = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const ACTIVE_CHAT_TASK_STATUSES = new Set(["pending", "in_progress"]);
const TERMINAL_CHAT_TASK_STATUSES = new Set(["completed", "failed"]);

function collectLatestChatTasks(tasks, chatIdSet, latestByChat) {
    for (const task of tasks) {
        // Any task linked to a chat (chatId) counts — callers often use
        // sources like "canvas_image_modify" rather than literal "chat".
        const chatId = task?.invokedFrom?.chatId
            ? String(task.invokedFrom.chatId)
            : "";
        if (!chatId || !chatIdSet.has(chatId) || latestByChat.has(chatId)) {
            continue;
        }
        latestByChat.set(chatId, {
            latestTaskStatus: task.status,
            latestTaskAt: toIsoTimestamp(task.updatedAt || task.createdAt),
        });
        if (latestByChat.size >= chatIdSet.size) break;
    }
}

/**
 * Attach the most recent chat-sourced task per chat so the sidebar can show
 * gray pulse (in progress), blue (completed while away), or red (failed) dots.
 *
 * Cosmos/CSFLE cannot filter on nested `invokedFrom.*` paths with ORDER BY, so
 * we query owner/status/time with a single-field sort and match chat ids in JS.
 * Sort/filter on `createdAt` (composite index), not `updatedAt` — Cosmos
 * rejects ORDER BY on excluded index paths.
 * Active tasks are preferred over terminal ones for the same chat.
 */
export async function attachLatestChatTaskStatus(chats, userId) {
    if (!Array.isArray(chats) || chats.length === 0 || !userId) {
        return chats;
    }

    const chatIdSet = new Set(
        chats
            .map((chat) => (chat?._id ? String(chat._id) : ""))
            .filter(Boolean),
    );
    if (chatIdSet.size === 0) return chats;

    const since = new Date(Date.now() - CHAT_TASK_NOTIFICATION_WINDOW_MS);
    // Bound the scan; sidebar only needs the latest task per visible chat.
    const fetchLimit = Math.min(500, Math.max(50, chatIdSet.size * 10));
    const projection = {
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        invokedFrom: 1,
    };

    let activeTasks = [];
    let terminalTasks = [];
    try {
        [activeTasks, terminalTasks] = await Promise.all([
            Task.find(
                {
                    owner: userId,
                    type: { $ne: "resource-shared" },
                    dismissed: { $ne: true },
                    status: { $in: [...ACTIVE_CHAT_TASK_STATUSES] },
                },
                projection,
            )
                .sort({ createdAt: -1 })
                .limit(fetchLimit)
                .lean(),
            Task.find(
                {
                    owner: userId,
                    type: { $ne: "resource-shared" },
                    dismissed: { $ne: true },
                    status: { $in: [...TERMINAL_CHAT_TASK_STATUSES] },
                    createdAt: { $gte: since },
                },
                projection,
            )
                .sort({ createdAt: -1 })
                .limit(fetchLimit)
                .lean(),
        ]);
    } catch (error) {
        console.error(
            "attachLatestChatTaskStatus: failed to load chat tasks",
            error,
        );
        return chats;
    }

    const latestByChat = new Map();
    // Prefer in-flight tasks so a chat with a running job shows the gray pulse.
    collectLatestChatTasks(activeTasks, chatIdSet, latestByChat);
    collectLatestChatTasks(terminalTasks, chatIdSet, latestByChat);

    for (const chat of chats) {
        const info = latestByChat.get(String(chat._id));
        if (!info) continue;
        chat.latestTaskStatus = info.latestTaskStatus;
        chat.latestTaskAt = info.latestTaskAt;
    }

    return chats;
}

export async function getRecentChatsOfCurrentUser() {
    const currentUser = await getCurrentUser(false);
    if (!currentUser?._id || currentUser.userId === "nodb") {
        return [];
    }

    // Cosmos DB rejects multi-field ORDER BY without a composite index, so
    // keep DB sorts single-field and merge/pin-sort in memory.
    const visibleQuery = buildVisibleChatQuery(
        currentUser._id,
        currentUser.activeChatId,
    );
    const [recentChats, pinnedChats] = await Promise.all([
        Chat.find(visibleQuery, RECENT_CHAT_PROJECTION)
            .sort({ updatedAt: -1 })
            .limit(DEFAULT_RECENT_CHAT_LIMIT)
            .lean(),
        Chat.find(
            buildVisibleChatQuery(currentUser._id, currentUser.activeChatId, {
                pinned: true,
            }),
            RECENT_CHAT_PROJECTION,
        )
            .sort({ updatedAt: -1 })
            .limit(DEFAULT_RECENT_CHAT_LIMIT)
            .lean(),
    ]);

    const byId = new Map();
    for (const chat of [...pinnedChats, ...recentChats]) {
        if (!chat?._id) continue;
        byId.set(String(chat._id), chat);
    }
    const mergedChats = sortRecentChatsForSidebar([...byId.values()]).slice(
        0,
        DEFAULT_RECENT_CHAT_LIMIT,
    );

    // For chats without a custom title, fetch the first message separately
    // This approach avoids truncating the messages array in the main cache
    const firstChatId = mergedChats[0]?._id ? String(mergedChats[0]._id) : null;
    const chatsNeedingFirstMessage = mergedChats.filter((chat) => {
        const isFirstChat = firstChatId && String(chat._id) === firstChatId;
        return (
            isFirstChat ||
            !chat.title ||
            chat.title === "New Chat" ||
            chat.title === ""
        );
    });

    if (chatsNeedingFirstMessage.length > 0) {
        const chatsWithStorage = await Chat.find(
            { _id: { $in: chatsNeedingFirstMessage.map((chat) => chat._id) } },
            {
                messages: { $slice: 1 },
                messageStorageMode: 1,
                messageStorageGeneration: 1,
            },
        ).lean();
        const firstMessageEntries = [];
        for (
            let offset = 0;
            offset < chatsWithStorage.length;
            offset += MESSAGE_READ_CONCURRENCY
        ) {
            const batch = chatsWithStorage.slice(
                offset,
                offset + MESSAGE_READ_CONCURRENCY,
            );
            firstMessageEntries.push(
                ...(await Promise.all(
                    batch.map(async (chat) => {
                        const page = await readChatMessages(chat, {
                            limit: 1,
                            fromStart: true,
                        });
                        return [String(chat._id), page.messages[0]];
                    }),
                )),
            );
        }
        const firstMessageMap = new Map(firstMessageEntries);

        for (const chat of chatsNeedingFirstMessage) {
            const firstMessage = firstMessageMap.get(String(chat._id));
            if (firstMessage) {
                chat.firstMessage = firstMessage;
            }
        }
    }

    try {
        await attachLatestChatTaskStatus(mergedChats, currentUser._id);
    } catch (error) {
        // Never fail the sidebar chat list because of task-status enrichment.
        console.error(
            "getRecentChatsOfCurrentUser: attachLatestChatTaskStatus failed",
            error,
        );
    }
    return mergedChats;
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
        titleSetByUser: 1,
        lastMessagePreview: 1,
        lastMessageSender: 1,
        lastMessageAt: 1,
    };

    let chats = await Chat.find(
        buildVisibleChatQuery(userId, user.activeChatId),
        projection,
    )
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

    chats = await attachShareFlagsToChats(
        chats.map((chat) => ({
            ...chat,
            messagesTruncated: true,
        })),
    );

    const missingPreviewIds = chats
        .filter((chat) => {
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

export async function createNewChat(data, { setActive = true } = {}) {
    const { messages, title } = data;
    const currentUser = await getCurrentUser(false);
    const userId = currentUser._id;
    let selectedEntityId;
    if (data.selectedEntityId) {
        const { requireColleague } = await import("../utils/colleagues.js");
        selectedEntityId = (
            await requireColleague(currentUser, data.selectedEntityId)
        ).id;
    }

    const normalizedMessages = Array.isArray(messages)
        ? messages
        : messages
          ? [messages]
          : [];

    const hasExplicitTitle =
        typeof title === "string" ? title.trim().length > 0 : Boolean(title);

    const chat = new Chat({
        userId,
        ...(selectedEntityId ? { selectedEntityId } : {}),
        messages: [],
        messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
        messageStorageGeneration: new Types.ObjectId(),
        nextMessageSequence: 0,
        title:
            title ||
            (normalizedMessages.length === 0
                ? NEW_CHAT_TITLE
                : getSimpleTitle(normalizedMessages[0] || "")),
        titleSetByUser: hasExplicitTitle,
        ...buildLastMessagePreview(normalizedMessages),
    });

    await chat.save();
    let result = chat;
    if (normalizedMessages.length > 0) {
        const replacement = await replaceChatMessages(chat, normalizedMessages);
        result = replacement.chat;
        result.messages = replacement.messages;
    }
    if (setActive) {
        await setActiveChatId(chat._id);
    }
    return result;
}

export async function getChatForOwnerWrite(chatId, userId) {
    if (!chatId || !Types.ObjectId.isValid(chatId)) {
        return { ok: false, status: 400, error: "Invalid Chat ID" };
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
        return { ok: false, status: 404, error: "Chat not found" };
    }

    const access = await resolveShareAccess({
        entityType: "chat",
        entityId: chat._id,
        userId,
        ownerId: chat.userId,
        legacyPublic: Boolean(chat.isPublic),
    });

    if (!access.canAccess) {
        return { ok: false, status: 404, error: "Chat not found" };
    }

    if (!access.isOwner) {
        return { ok: false, status: 403, error: "Unauthorized access" };
    }

    return { ok: true, chat, access };
}

export async function getChatById(chatId, { limit, before } = {}) {
    if (!chatId || !Types.ObjectId.isValid(chatId)) {
        return null;
    }

    const currentUser = await getCurrentUser(false);

    const boundedLimit =
        Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
    const messageProjection =
        boundedLimit && !before ? { $slice: -(boundedLimit + 1) } : 1;

    const chat = await Chat.findOne(
        { _id: chatId },
        {
            _id: 1,
            title: 1,
            messages: messageProjection,
            messageStorageMode: 1,
            messageStorageGeneration: 1,
            isPublic: 1,
            isChatLoading: 1,
            activeSubscriptionId: 1,
            titleSetByUser: 1,
            selectedEntityId: 1,
            assistantQuestionId: 1,
            userId: 1,
            createdAt: 1,
        },
    ).lean();

    if (!chat) {
        return null;
    }

    const isOwner = String(chat.userId) === String(currentUser._id);
    let shareRole = isOwner ? "editor" : null;
    if (!isOwner) {
        const access = await resolveShareAccess({
            entityType: "chat",
            entityId: chat._id,
            userId: currentUser?._id,
            ownerId: chat.userId,
            legacyPublic: Boolean(chat.isPublic),
        });
        if (!access.canAccess) {
            throw new Error("Unauthorized access");
        }
        shareRole = access.role === "editor" ? "viewer" : access.role;
    }

    const isReadOnly = !isOwner;
    const {
        _id,
        title,
        isPublic,
        isChatLoading,
        activeSubscriptionId,
        titleSetByUser,
        selectedEntityId,
    } = chat;

    const messagePage = await readChatMessages(chat, {
        limit: boundedLimit || undefined,
        before,
    });

    // Sanitize messages to remove Mongoose metadata fields (createdAt, updatedAt)
    // that shouldn't be sent to the client
    const sanitizedMessages = messagePage.messages.map(sanitizeMessage);

    const shareDoc = await Share.findOne({
        entityType: "chat",
        entityId: chat._id,
    }).lean();
    const isShared = computeIsShared(shareDoc, {
        legacyPublic: Boolean(isPublic),
    });

    const result = {
        _id,
        title,
        createdAt: chat.createdAt,
        messages: sanitizedMessages,
        isPublic,
        isShared,
        shareRole,
        isOwner,
        readOnly: isReadOnly,
        isChatLoading,
        activeSubscriptionId: activeSubscriptionId || null,
        titleSetByUser,
        selectedEntityId,
        messagesTruncated: messagePage.hasMoreMessages,
        hasMoreMessages: messagePage.hasMoreMessages,
        messageStorageMode: usesExternalMessageStorage(chat)
            ? EXTERNAL_MESSAGE_STORAGE
            : "embedded",
    };

    if (isOwner && !isShared && chat.assistantQuestionId) {
        const canonicalChatId = await consolidateQuestionConversation(
            currentUser,
            chat,
        );
        if (canonicalChatId) result.canonicalChatId = canonicalChatId;
    }

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
        const emptyChat = await createNewChat({
            messages: [],
            title: "",
        });
        activeChatId = emptyChat._id;

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
            const userChat = await Chat.findOne(
                buildVisibleChatQuery(userId, user.activeChatId),
            );
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
    return await Chat.countDocuments(
        buildVisibleChatQuery(currentUser._id, currentUser.activeChatId),
    );
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
            messageStorageMode: 1,
            messageStorageGeneration: 1,
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
            messageStorageMode: 1,
            messageStorageGeneration: 1,
            nextMessageSequence: 1,
        },
    )
        .sort({ updatedAt: -1 })
        .limit(scanLimit)
        .lean();

    const results = [];
    for (
        let offset = 0;
        offset < chats.length && results.length < limit;
        offset += MESSAGE_SEARCH_BATCH_SIZE
    ) {
        const batch = chats.slice(offset, offset + MESSAGE_SEARCH_BATCH_SIZE);
        const matchedIds = await findChatsWithMatchingMessages(
            batch,
            (message) => {
                const text = extractSearchableText(message?.payload);
                return text ? matchesAllTerms(text, searchTerms) : false;
            },
            { limit: slice },
        );

        for (const chat of batch) {
            const hasMatch = matchedIds.has(String(chat._id));
            if (hasMatch) {
                results.push(chat);
                if (results.length >= limit) break;
            }
        }
    }
    return results;
}
