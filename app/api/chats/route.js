import { NextResponse } from "next/server";
import Chat from "../models/chat";
import { getCurrentUser, handleError } from "../utils/auth";

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
async function updateChat(data) {
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

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const chats = await getChatsOfCurrentUser();
        return NextResponse.json(chats); // Use NextResponse to return JSON
    } catch (error) {
        return handleError(error);
    }
}

const getSimpleTitle = (message) => {
    return (message?.payload || "").substring(0, 14) || "New Chat";
};

export async function POST(req) {
    try {
        const data = await req.json();
        const newChat = await createNewChat(data);
        return NextResponse.json(newChat);
    } catch (error) {
        return handleError(error); // Handle errors appropriately
    }
}

// Handle PUT request to edit existing saved messages for the current user
export async function PUT(req) {
    try {
        const data = await req.json();
        const updatedChat = await updateChat(data);
        return Response.json(updatedChat);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
