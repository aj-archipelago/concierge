import User from "../models/user";
import Chat from "../models/chat";
import { getCurrentUser } from "../utils/auth";
import mongoose from "mongoose";

const getSimpleTitle = (message) => {
    return (message?.payload || "").substring(0, 14);
};

export async function getRecentChatsOfCurrentUser() {
    const currentUser = await getCurrentUser(false);
    const recentChatIds = currentUser.recentChatIds || [];

    // Fetch all recent chat details without sorting
    const recentChatsUnordered = await Chat.find({
        _id: { $in: recentChatIds },
        userId: currentUser._id,
    });

    // Create an object for quick lookup
    const recentChatsMap = recentChatsUnordered.reduce((acc, chat) => {
        acc[chat._id] = chat;
        return acc;
    }, {});

    // Filter and map to ensure original order and remove invalid IDs
    const recentChats = recentChatIds
        .filter((id) => recentChatsMap[id]) // Remove invalid or non-existent IDs
        .map((id) => recentChatsMap[id]); // Ensure original order

    return recentChats;
}

export async function getChatsOfCurrentUser() {
    const user = await getCurrentUser(false);
    const userId = user._id;

    let chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

    // If no chats exist, create a default empty chat
    if (chats.length === 0) {
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

    const chat = new Chat({
        userId,
        messages: normalizedMessages,
        title: title || getSimpleTitle(normalizedMessages[0] || ""),
    });

    await chat.save();
    await setActiveChatId(chat._id);
    return chat;
}

export async function updateChat(data) {
    const { chatId, newMessageContent } = data;
    const currentUser = await getCurrentUser(false);

    const chat = await Chat.findOneAndUpdate(
        { _id: chatId, userId: currentUser._id },
        {
            $set: {
                messages: newMessageContent,
            },
        },
        { new: true, useFindAndModify: false },
    );

    if (!chat) throw new Error("Chat not found");

    return chat;
}

export async function getChatById(chatId) {
    if (!chatId) {
        throw new Error("Chat ID is required");
    }

    const currentUser = await getCurrentUser(false);

    const chat = await Chat.findOne({
        _id: chatId,
        userId: currentUser._id,
    });

    if (!chat) {
        return null;
    }

    return chat;
}

export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");
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

    // Check if activeChatId exists and is valid
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
        // Look for an existing empty chat
        const existingEmptyChat = await Chat.findOne({
            userId: currentUser._id,
            messages: { $size: 0 },
        });

        if (existingEmptyChat) {
            activeChatId = existingEmptyChat._id;
        } else {
            // Create a new empty chat only if no existing empty chat
            const emptyChat = await createNewChat({
                messages: [],
                title: "",
            });
            activeChatId = emptyChat._id;
        }

        // Update user's activeChatId and recentChatIds
        await User.findByIdAndUpdate(
            currentUser._id,
            {
                $set: { activeChatId },
                $addToSet: { recentChatIds: activeChatId },
            },
            { new: true, useFindAndModify: false },
        );
    }

    // Ensure recentChatIds only contains existing chats and remove duplicates
    const existingChats = await Chat.find(
        {
            _id: { $in: recentChatIds },
            userId: currentUser._id,
        },
        "_id",
    );
    recentChatIds = [
        ...new Set(existingChats.map((chat) => chat._id.toString())),
    ];

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
    let recentChatIds = currentUser.recentChatIds || [];
    recentChatIds = recentChatIds.filter((id) => String(id) !== String(chatId));

    const existingChats = await Chat.find(
        { _id: { $in: recentChatIds }, userId: currentUser._id },
        "_id",
    );
    const existingChatIds = existingChats.map((chat) => chat._id.toString());
    recentChatIds = recentChatIds.filter((id) => existingChatIds.includes(id));

    let newActiveChatId = currentUser.activeChatId;
    const activeChatExists = await Chat.exists({
        _id: newActiveChatId,
        userId: currentUser._id,
    });

    if (!activeChatExists) {
        if (recentChatIds.length > 0) {
            newActiveChatId = recentChatIds[0];
        } else {
            const emptyChat = await createNewChat({ messages: [], title: "" });
            newActiveChatId = emptyChat._id;
            recentChatIds.push(newActiveChatId);
        }
    }

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        { $set: { recentChatIds, activeChatId: newActiveChatId } },
        { new: true, useFindAndModify: false },
    );

    if (!updatedUser) throw new Error("User not found");

    return {
        recentChatIds: updatedUser.recentChatIds,
        activeChatId: updatedUser.activeChatId,
    };
}
