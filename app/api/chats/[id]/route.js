import { NextResponse } from "next/server";
import Chat from "../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../utils/auth";
import { deleteChatIdFromRecentList, getChatById } from "../_lib";

// Handle POST request to add a message to an existing chat for the current user
export async function POST(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const { message } = await req.json();

        const chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        if (chat) {
            chat.messages = [...chat.messages, message];
            await chat.save();
        }

        if (!chat) {
            throw new Error("Chat not found");
        }

        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}

// Handle DELETE request to delete a chat for the current user
export async function DELETE(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);

        const chat = await Chat.findOneAndDelete({
            _id: id,
            userId: currentUser._id,
        });

        if (!chat) {
            throw new Error("Chat not found");
        }

        const response = await deleteChatIdFromRecentList(id);

        return NextResponse.json({ ...response, deletedChat: chat });
    } catch (error) {
        return handleError(error);
    }
}

// Handle GET request to retrieve a chat for the current user
export async function GET(req, { params }) {
    try {
        const { id } = params;
        const chat = await getChatById(id);
        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to update a chat for the current user
export async function PUT(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const body = await req.json();

        // First, get the existing chat to preserve server-generated messages
        const existingChat = await Chat.findOne({
            _id: id,
            userId: currentUser._id,
        });

        if (!existingChat) {
            throw new Error("Chat not found");
        }

        // If the request contains messages, handle server-generated messages
        if (body.messages) {
            // Only preserve server messages if we're not clearing the chat
            // (when messages array is empty, we're clearing the chat)
            if (body.messages.length > 0) {
                // Find all server-generated messages in the existing chat
                const serverGeneratedMessages = existingChat.messages.filter(
                    (msg) => msg.isServerGenerated === true,
                );

                // Create a Map of message IDs from incoming messages for quick lookup
                const incomingMessagesMap = new Map(
                    body.messages.map((msg) => [msg._id?.toString(), msg]),
                );

                // Add server-generated messages that aren't in the incoming messages
                for (const serverMsg of serverGeneratedMessages) {
                    const msgId = serverMsg._id?.toString();
                    if (!incomingMessagesMap.has(msgId)) {
                        // Add to the body.messages array
                        body.messages.push(serverMsg);
                    }
                }

                // Sort messages by sentTime to maintain chronological order
                body.messages.sort((a, b) => {
                    const timeA = new Date(a.sentTime).getTime();
                    const timeB = new Date(b.sentTime).getTime();
                    return timeA - timeB;
                });
            }
            // If body.messages is empty, we don't add server messages back
            // This allows clearing all messages including server-generated ones
        }

        const chat = await Chat.findOneAndUpdate(
            {
                _id: id,
                userId: currentUser._id,
            },
            body,
            { new: true },
        );

        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}
