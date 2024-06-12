import User from "../models/user";
import Chat from "../models/chat";
import { getCurrentUser } from "../utils/auth";

const getSimpleTitle = (message) => {
    return (message?.payload || "").substring(0, 14) || "New Chat";
};

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

// Function to get active chat ID for the current user
export async function getActiveChatId() {
    const currentUser = await getCurrentUser(false);
    return String(currentUser.activeChatId);
}

// Function to set active chat ID for the current user
export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    const currentUser = await getCurrentUser(false);

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { activeChatId: String(activeChatId) },
        },
        { new: true, useFindAndModify: false },
    );

    if (!updatedUser) throw new Error("User not found");

    return String(updatedUser.activeChatId);
}
