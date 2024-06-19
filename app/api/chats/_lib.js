import User from "../models/user";
import Chat from "../models/chat";
import { getCurrentUser } from "../utils/auth";
import mongoose from "mongoose";

const getSimpleTitle = (message) => {
    return (message?.payload || "").substring(0, 14) || "New Chat";
};

// Function to get all active chat IDs and their details for the current user
export async function getActiveChatsOfCurrentUser() {
    const currentUser = await getCurrentUser(false);
    const activeChatIds = currentUser.activeChatIds || [];

    // Fetch all active chat details without sorting
    const activeChatsUnordered = await Chat.find({
        _id: { $in: activeChatIds },
        userId: currentUser._id,
    });

    // Create an object for quick lookup
    const activeChatsMap = activeChatsUnordered.reduce((acc, chat) => {
        acc[chat._id] = chat;
        return acc;
    }, {});

    // Filter and map to ensure original order and remove invalid IDs
    const activeChats = activeChatIds
        .filter((id) => activeChatsMap[id]) // Remove invalid or non-existent IDs
        .map((id) => activeChatsMap[id]); // Ensure original order

    return activeChats;
}

// Function to get the chats of the current user
export async function getChatsOfCurrentUser() {
    const user = await getCurrentUser(false);
    const userId = user._id;

    // Fetch chats using the userId reference and sort by updatedAt in descending order
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });
    return chats;
}

// Function to create a new chat
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

    // Check for an existing default chat with 0 messages and remove it
    await Chat.deleteOne({ userId, messages: { $exists: true, $size: 0 } });

    // Create a new chat
    const newChat = new Chat({
        userId,
        messages: normalizedMessages,
        title: title || getSimpleTitle(normalizedMessages[0]),
        // createdAt: new Date(),
        // updatedAt: new Date(),
    });

    await newChat.save();

    //should update the active chat ids
    await setActiveChatId(newChat._id);
    return newChat;
}

// Function to update an existing chat
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

// Function to fetch a chat by ID for the current user
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
        throw new Error("Chat not found");
    }

    return chat;
}

// Function to set active chat ID for the current user
export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    // Check if activeChatId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(activeChatId)) {
        throw new Error("Invalid activeChatId");
    }

    const currentUser = await getCurrentUser(false);
    let activeChatIds = currentUser.activeChatIds || [];

    // Remove the chat ID if it already exists in the list
    activeChatIds = activeChatIds.filter(
        (id) => String(id) !== String(activeChatId),
    );
    // Add the new chat ID to the beginning of the list
    activeChatIds.unshift(activeChatId);

    // Ensure we only keep the last N active chat IDs (e.g., 10)
    const MAX_ACTIVE_CHATS = 10;
    if (activeChatIds.length > MAX_ACTIVE_CHATS) {
        activeChatIds = activeChatIds.slice(0, MAX_ACTIVE_CHATS);
    }

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { activeChatIds: activeChatIds },
        },
        { new: true, useFindAndModify: false }, // Make sure to return the updated document
    );

    if (!updatedUser) throw new Error("User not found");

    return updatedUser.activeChatIds;
}

// Function to get all chat IDs and the most recent active chat ID for the current user
export async function getUserChatInfo() {
    const currentUser = await getCurrentUser(false);
    const activeChatIds = currentUser.activeChatIds;
    const activeChatId = activeChatIds.length ? activeChatIds[0] : null;

    return {
        activeChatIds,
        activeChatId: activeChatId ? String(activeChatId) : null,
    };
}

// Function to get the most recent active chat ID for the current user
export async function getActiveChatId() {
    const { activeChatId } = await getUserChatInfo();

    if (!activeChatId) {
        throw new Error("No active chat IDs found");
    }

    return activeChatId;
}

// Function to get all active chat IDs for the current user
export async function getActiveChatIds() {
    const { activeChatIds } = await getUserChatInfo();
    return activeChatIds;
}

export async function deleteChatIdFromActiveList(chatId) {
    const currentUser = await getCurrentUser(false);
    let activeChatIds = currentUser.activeChatIds || [];

    activeChatIds = activeChatIds.filter((id) => String(id) !== String(chatId));

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { activeChatIds: activeChatIds },
        },
        { new: true, useFindAndModify: false }, // Make sure to return the updated document
    );

    if (!updatedUser) throw new Error("User not found");

    return {
        activeChatIds,
        activeChatId: activeChatIds.length ? activeChatIds[0] : null,
    };
}
