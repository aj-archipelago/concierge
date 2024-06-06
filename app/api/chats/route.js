import { NextResponse } from "next/server";
import Chat from "../models/chat";
import { getCurrentUser, handleError } from "../utils/auth";

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const user = await getCurrentUser(false);
        const userId = user._id;

        // Fetch chats using the userId reference and sort by updatedAt in descending order
        const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

        return NextResponse.json(chats); // Use NextResponse to return JSON
    } catch (error) {
        return handleError(error);
    }
}

// Handle POST request to create a new chat
export async function POST(req) {
    try {
        const { messages, title } = await req.json();
        const currentUser = await getCurrentUser(false);
        const userId = currentUser._id;

        // Ensure messages is always an array
        const normalizedMessages = Array.isArray(messages)
            ? messages
            : [messages];

        const newChat = new Chat({
            userId,
            messages: normalizedMessages,
            title,
        });

        await newChat.save();

        return Response.json(newChat);
    } catch (error) {
        return handleError(error); // Handle errors appropriately
    }
}

// Handle PUT request to edit existing saved messages for the current user
export async function PUT(req) {
    try {
        const { chatId, newMessageContent } = await req.json();
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

        return Response.json(chat);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
