import { NextResponse } from "next/server";
import Chat from "../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../utils/auth";
import {
    deleteChatIdFromRecentList,
    getChatById,
    sanitizeMessage,
    removeArtifactsFromMessages,
} from "../_lib";

// Handle POST request to add a message to an existing chat for the current user
export async function POST(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const { message } = await req.json();

        // Remove artifacts from message before saving to prevent storing large base64 data
        const messagesWithoutArtifacts = removeArtifactsFromMessages([message]);
        const messageWithoutArtifacts = messagesWithoutArtifacts[0] || message;

        const chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        if (!chat) {
            throw new Error("Chat not found");
        }

        chat.messages = [...chat.messages, messageWithoutArtifacts];
        // One-way gate: if chat has messages, mark it as used
        chat.isUnused = false;
        await chat.save();

        // Sanitize messages in response to remove Mongoose metadata
        const chatObj = chat.toObject ? chat.toObject() : chat;
        const sanitizedMessages = (chatObj.messages || []).map(sanitizeMessage);

        return NextResponse.json({
            ...chatObj,
            messages: sanitizedMessages,
        });
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

        // Remove chatId from body if present (it's not part of the schema, just used for routing)
        if (body.chatId) {
            delete body.chatId;
        }

        // First, get the existing chat to preserve server-generated messages
        const existingChat = await Chat.findOne({
            _id: id,
            userId: currentUser._id,
        });

        if (!existingChat) {
            throw new Error("Chat not found");
        }

        // If the request contains messages, check if server has newer data
        if (body.messages) {
            // If server has more messages than incoming, it likely has server-persisted ones
            // Reject the update to preserve server state
            const serverMessageCount = existingChat.messages?.length || 0;
            const incomingMessageCount = body.messages.length;
            
            if (serverMessageCount > incomingMessageCount && body.messages.length > 0) {
                console.log(`[PUT /api/chats/${id}] Server has ${serverMessageCount} messages, incoming has ${incomingMessageCount}. Rejecting message update to preserve server-persisted messages.`);
                // Return current server state instead of updating
                const chatObj = existingChat.toObject ? existingChat.toObject() : existingChat;
                const sanitizedMessages = (chatObj.messages || []).map(sanitizeMessage);
                return NextResponse.json({
                    ...chatObj,
                    messages: sanitizedMessages,
                });
            }
            
            // Only preserve server messages if we're not clearing the chat
            // (when messages array is empty, we're clearing the chat)
            if (body.messages.length > 0) {
                // Remove artifacts from messages before saving to prevent storing large base64 data
                const messagesWithoutArtifacts = removeArtifactsFromMessages(
                    body.messages,
                );

                // Sanitize messages to remove Mongoose metadata fields (defense in depth)
                const sanitizedMessages = messagesWithoutArtifacts.map(
                    (msg) => {
                        if (!msg || typeof msg !== "object") return msg;
                        // Remove Mongoose metadata fields that shouldn't be in updates
                        const { createdAt, updatedAt, ...cleanMsg } = msg;
                        return cleanMsg;
                    },
                );

                // Create a Map of message IDs from incoming messages for quick lookup
                const incomingMessagesMap = new Map(
                    sanitizedMessages.map((msg) => [msg._id?.toString(), msg]),
                );

                // Check if this is a replay/truncation (incoming messages are fewer than original)
                const isReplay =
                    sanitizedMessages.length < existingChat.messages.length;

                if (isReplay) {
                    // During replay, the client explicitly sends the messages it wants to keep
                    // We should NOT preserve any server-generated messages (including coding agent messages)
                    // because they may have been intentionally removed by the replay
                    // The client's message list is the source of truth for what should remain
                } else {
                    // For normal updates: preserve all server-generated messages that aren't in incoming
                    const serverGeneratedMessages =
                        existingChat.messages.filter(
                            (msg) =>
                                msg.isServerGenerated === true ||
                                msg.taskId != null,
                        );

                    for (const serverMsg of serverGeneratedMessages) {
                        const msgId = serverMsg._id?.toString();
                        if (msgId && !incomingMessagesMap.has(msgId)) {
                            sanitizedMessages.push(sanitizeMessage(serverMsg));
                        }
                    }
                }

                // Sort messages by sentTime to maintain chronological order
                sanitizedMessages.sort((a, b) => {
                    const timeA = new Date(a.sentTime).getTime();
                    const timeB = new Date(b.sentTime).getTime();
                    return timeA - timeB;
                });

                body.messages = sanitizedMessages;

                // One-way gate: if chat has messages, mark it as used
                body.isUnused = false;
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
            {
                new: true,
                runValidators: true,
            },
        );

        if (!chat) {
            throw new Error("Failed to update chat");
        }

        // Sanitize messages in response to remove Mongoose metadata
        const chatObj = chat.toObject ? chat.toObject() : chat;
        const sanitizedMessages = (chatObj.messages || []).map(sanitizeMessage);

        return NextResponse.json({
            ...chatObj,
            messages: sanitizedMessages,
        });
    } catch (error) {
        console.error("Error in PUT /api/chats/[id]:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        return handleError(error);
    }
}
