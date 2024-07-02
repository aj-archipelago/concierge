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

    // Fetch chats using the userId reference and sort by updatedAt in descending order
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });
    return chats;
}

export async function createNewChat(data) {
    const { messages, title } = data;
    const currentUser = await getCurrentUser(false);
    const userId = currentUser._id;

    // Ensure messages is always an array
    const normalizedMessages = !messages
        ? []
        : Array.isArray(messages)
          ? messages
          : [messages];

    // Create a new chat
    const newChat = new Chat({
        userId,
        messages: normalizedMessages,
        title: title || getSimpleTitle(normalizedMessages[0]),
    });

    await newChat.save();

    // Should update the recent chat ids and set active chat id
    await setActiveChatId(newChat._id);
    return newChat;
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

    const chat = await Chat.findOne({ _id: chatId });

    if (!chat) {
        throw new Error("Chat not found");
    }

    if (String(chat.userId) !== String(currentUser._id) && !chat.isPublic) {
        throw new Error("Unauthorized access");
    }

    const isReadOnly = String(chat.userId) !== String(currentUser._id);
    const { _id, title, messages, isPublic } = chat;
    return { _id, title, messages, isPublic, readOnly: isReadOnly };
}

export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    // Check if activeChatId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(activeChatId)) {
        throw new Error("Invalid activeChatId");
    }

    const currentUser = await getCurrentUser(false);
    let recentChatIds = currentUser.recentChatIds || [];

    // Add the chat ID to the beginning of the list if it doesn't already exist
    if (!recentChatIds.includes(activeChatId)) {
        recentChatIds.unshift(activeChatId);
    } else if (recentChatIds.indexOf(activeChatId) >= 3) {
        // Remove the chat ID from the list if it exists beyond the top 3
        recentChatIds = recentChatIds.filter((id) => id !== activeChatId);
        recentChatIds.unshift(activeChatId);
    }

    // Ensure we only keep the last 30 recent chat IDs beyond the top 3
    const MAX_RECENT_CHATS = 30;
    if (recentChatIds.length > MAX_RECENT_CHATS) {
        const top3 = recentChatIds.slice(0, 3);
        const rest = recentChatIds.slice(3, MAX_RECENT_CHATS);
        recentChatIds = [...top3, ...rest];
    }

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { recentChatIds, activeChatId },
        },
        { new: true, useFindAndModify: false }, // Make sure to return the updated document
    );

    if (!updatedUser) throw new Error("User not found");

    return {
        recentChatIds: updatedUser.recentChatIds,
        activeChatId: updatedUser.activeChatId,
    };
}

export async function getUserChatInfo() {
    const currentUser = await getCurrentUser(false);
    const recentChatIds = currentUser.recentChatIds;
    let activeChatId = currentUser.activeChatId;

    if (!activeChatId) {
        // Create a new empty chat if no active chat ID exists
        const emptyChat = await createNewChat({
            messages: [],
            title: "",
        });
        activeChatId = emptyChat._id;
        await setActiveChatId(activeChatId);
    }

    return {
        recentChatIds,
        activeChatId: activeChatId ? String(activeChatId) : null,
    };
}

export async function getActiveChatId() {
    let { activeChatId } = await getUserChatInfo();

    if (!activeChatId) {
        // Create a new empty chat if no active chat ID exists
        const emptyChat = await createNewChat({
            messages: [],
            title: "",
        });
        activeChatId = emptyChat._id;
        await setActiveChatId(activeChatId);
    }

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

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { recentChatIds },
        },
        { new: true, useFindAndModify: false }, // Make sure to return the updated document
    );

    if (!updatedUser) throw new Error("User not found");

    // Ensure activeChatId is always valid
    let newActiveChatId = currentUser.activeChatId;
    if (String(newActiveChatId) === String(chatId)) {
        if (recentChatIds.length > 0) {
            newActiveChatId = recentChatIds[0];
        } else {
            const emptyChat = await createNewChat({
                messages: [],
                title: "",
            });
            newActiveChatId = emptyChat._id;
        }

        await User.findByIdAndUpdate(
            currentUser._id,
            { $set: { activeChatId: newActiveChatId } },
            { new: true, useFindAndModify: false },
        );
    }

    return {
        recentChatIds: updatedUser.recentChatIds,
        activeChatId: newActiveChatId,
    };
}
