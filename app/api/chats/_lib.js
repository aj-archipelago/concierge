import User from "../models/user";
import Chat from "../models/chat.mjs";
import { getCurrentUser } from "../utils/auth";
import mongoose from "mongoose";
import { Types } from "mongoose";
import { parseSearchQuery, matchesAllTerms } from "../utils/search-parser";

/**
 * Sanitizes a message object to remove Mongoose metadata fields (createdAt, updatedAt)
 * that shouldn't be sent to the client or included in updates
 */
export function sanitizeMessage(msg) {
    if (!msg) return null;
    const msgObj = msg.toObject ? msg.toObject() : msg;
    return {
        payload: msgObj.payload,
        sender: msgObj.sender,
        tool: msgObj.tool || null,
        sentTime: msgObj.sentTime,
        direction: msgObj.direction,
        position: msgObj.position,
        entityId: msgObj.entityId || null,
        taskId: msgObj.taskId || null,
        isServerGenerated: msgObj.isServerGenerated || false,
        ephemeralContent: msgObj.ephemeralContent || null,
        thinkingDuration: msgObj.thinkingDuration || 0,
        _id: msgObj._id, // Keep _id for client-side reference
    };
}

// Search limits for title search
const DEFAULT_TITLE_SEARCH_LIMIT = 20;
const DEFAULT_TITLE_SEARCH_SCAN_LIMIT = 500;

const getSimpleTitle = (message) => {
    return (message?.payload || "").substring(0, 14);
};

export async function getRecentChatsOfCurrentUser() {
    const currentUser = await getCurrentUser(false);
    const recentChatIds = currentUser.recentChatIds || [];

    const recentChatsUnordered = await Chat.find(
        {
            _id: { $in: recentChatIds },
            userId: currentUser._id,
        },
        { _id: 1, title: 1, titleSetByUser: 1, isUnused: 1 },
    );

    // For chats without a custom title, fetch the first message separately
    // This approach avoids truncating the messages array in the main cache
    const firstChatId =
        recentChatIds.length > 0 ? String(recentChatIds[0]) : null;
    for (const chat of recentChatsUnordered) {
        const isFirstChat = firstChatId && String(chat._id) === firstChatId;
        const needsFirstMessage =
            isFirstChat ||
            !chat.title ||
            chat.title === "New Chat" ||
            chat.title === "";

        if (needsFirstMessage) {
            const chatWithFirstMessage = await Chat.findOne(
                { _id: chat._id },
                { messages: { $slice: 1 } },
            );
            if (
                chatWithFirstMessage &&
                chatWithFirstMessage.messages &&
                chatWithFirstMessage.messages.length > 0
            ) {
                chat._doc.firstMessage = chatWithFirstMessage.messages[0];
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
    const userId = user._id;

    const skip = (page - 1) * limit;

    let chats = await Chat.find({ userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

    // If no chats exist and it's the first page, create a default empty chat
    if (chats.length === 0 && page === 1) {
        const defaultChat = await createNewChat({
            messages: [],
            title: "",
        });
        chats = [defaultChat];
    }

    return chats;
}

export async function createNewChat(data) {
    const { messages, title } = data;
    const currentUser = await getCurrentUser(false);
    const userId = currentUser._id;

    const normalizedMessages = Array.isArray(messages)
        ? messages
        : messages
          ? [messages]
          : [];

    // Only look for existing unused chat if we're creating a new empty chat
    if (normalizedMessages.length === 0) {
        // Find the latest unused chat (one-way gate: once used, never unused again)
        const unusedChat = await Chat.findOne({
            userId: currentUser._id,
            isUnused: true,
        }).sort({ createdAt: -1 });

        if (unusedChat) {
            await setActiveChatId(unusedChat._id);
            return unusedChat;
        }
    }

    const chat = new Chat({
        userId,
        messages: normalizedMessages,
        isUnused: normalizedMessages.length === 0,
        title: title || getSimpleTitle(normalizedMessages[0] || ""),
    });

    await chat.save();
    await setActiveChatId(chat._id);
    return chat;
}

export async function getChatById(chatId) {
    // Handle temporary chat IDs from client-side optimistic updates
    if (chatId && typeof chatId === "string" && chatId.startsWith("temp_")) {
        // Return a minimal temporary chat object
        return {
            _id: chatId,
            title: "",
            messages: [],
            isPublic: false,
            readOnly: false,
            isChatLoading: false,
            isTemporary: true,
        };
    }

    if (!chatId || !Types.ObjectId.isValid(chatId)) {
        console.error("Invalid chatId: ", chatId);
        return null;
    }

    const currentUser = await getCurrentUser(false);

    const chat = await Chat.findOne({ _id: chatId }).populate(
        "userId",
        "name username",
    );

    if (!chat) {
        return null;
    }

    if (String(chat.userId._id) !== String(currentUser._id) && !chat.isPublic) {
        throw new Error("Unauthorized access");
    }

    const isReadOnly = String(chat.userId._id) !== String(currentUser._id);
    const {
        _id,
        title,
        messages,
        isPublic,
        isChatLoading,
        codeRequestId,
        titleSetByUser,
        selectedEntityId,
        researchMode,
    } = chat;

    // Sanitize messages to remove Mongoose metadata fields (createdAt, updatedAt)
    // that shouldn't be sent to the client
    const sanitizedMessages = (messages || []).map(sanitizeMessage);

    const result = {
        _id,
        title,
        messages: sanitizedMessages,
        isPublic,
        readOnly: isReadOnly,
        isChatLoading,
        codeRequestId,
        titleSetByUser,
        selectedEntityId,
        researchMode,
    };

    if (isReadOnly) {
        result.owner = {
            name: chat.userId.name,
            username: chat.userId.username,
        };
    }

    return result;
}

export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    // Handle temporary chat IDs from client-side optimistic updates
    if (typeof activeChatId === "string" && activeChatId.startsWith("temp_")) {
        // Return a successful response without making database changes
        // The real chat ID will be set after the server creates the actual chat
        return {
            recentChatIds: [],
            activeChatId: activeChatId,
        };
    }

    if (!mongoose.Types.ObjectId.isValid(activeChatId)) {
        throw new Error("Invalid activeChatId");
    }

    const currentUser = await getCurrentUser(false);
    let recentChatIds = currentUser.recentChatIds || [];

    const activeChatIdStr = String(activeChatId);
    const existingIndex = recentChatIds.indexOf(activeChatIdStr);

    if (existingIndex === -1) {
        // If the chat is not in the list, add it to the beginning
        recentChatIds.unshift(activeChatIdStr);
    } else if (existingIndex >= 3) {
        // If the chat is beyond the top 3, move it to the beginning
        recentChatIds.splice(existingIndex, 1);
        recentChatIds.unshift(activeChatIdStr);
    }
    // If it's already in the top 3, do nothing to preserve order

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
            messages: { $slice: 1 },
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
            if (!m || typeof m.payload !== "string") return false;
            return matchesAllTerms(m.payload, searchTerms);
        });
        if (hasMatch) {
            results.push(chat);
            if (results.length >= limit) break;
        }
    }
    return results;
}
