import User from "../models/user";
import Chat from "../models/chat.mjs";
import { getCurrentUser } from "../utils/auth";
import mongoose from "mongoose";
import { Types } from "mongoose";

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
        { _id: 1, title: 1, titleSetByUser: 1 },
    );

    // For chats without a custom title, fetch the first message separately
    // This approach avoids truncating the messages array in the main cache
    for (const chat of recentChatsUnordered) {
        if (!chat.title || chat.title === "New Chat" || chat.title === "") {
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

    // Only look for existing empty chat if we're creating a new empty chat
    if (normalizedMessages.length === 0) {
        // First find chats marked as empty
        const emptyChats = await Chat.find({
            userId: currentUser._id,
            isEmpty: true,
        });

        // Then verify they are actually empty by checking messages
        for (const chat of emptyChats) {
            if (!chat.messages || chat.messages.length === 0) {
                await setActiveChatId(chat._id);
                return chat;
            }
            // If we find a chat marked as empty but with messages, fix it
            if (chat.messages && chat.messages.length > 0) {
                chat.isEmpty = false;
                await chat.save();
            }
        }
    }

    const chat = new Chat({
        userId,
        messages: normalizedMessages,
        isEmpty: normalizedMessages.length === 0,
        title: title || getSimpleTitle(normalizedMessages[0] || ""),
    });

    await chat.save();
    await setActiveChatId(chat._id);
    return chat;
}

export async function updateChat(data) {
    const { chatId, newMessageContent } = data;
    const currentUser = await getCurrentUser(false);

    const messageArray = Array.isArray(newMessageContent)
        ? newMessageContent
        : [];
    const hasMessages = messageArray.length > 0;

    const chat = await Chat.findOneAndUpdate(
        { _id: chatId, userId: currentUser._id },
        {
            $set: {
                messages: messageArray,
                isEmpty: !hasMessages,
            },
        },
        { new: true, useFindAndModify: false },
    );

    if (!chat) throw new Error("Chat not found");

    // Double check the isEmpty state matches reality
    if (chat.isEmpty !== !hasMessages) {
        chat.isEmpty = !hasMessages;
        await chat.save();
    }

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
    const result = {
        _id,
        title,
        messages,
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
        const existingEmptyChat = await Chat.findOne({
            userId: currentUser._id,
            isEmpty: true,
        });

        if (existingEmptyChat) {
            activeChatId = existingEmptyChat._id;
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

    const lowerTerm = term.toLowerCase();
    const results = [];
    for (const chat of chats) {
        const title = (chat?.title || "").toLowerCase();
        if (title.includes(lowerTerm)) {
            results.push(chat);
            if (results.length >= limit) break;
        }
    }
    return results;
}
