import { NextResponse } from "next/server";
import { Types } from "mongoose";
import Chat from "../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../utils/auth";
import {
    deleteChatIdFromRecentList,
    getChatById,
    sanitizeMessage,
    sanitizeMessagesForPersistence,
    prepareMessagesForPersistence,
    addStoppedSubscription,
    buildLastMessagePreview,
} from "../_lib";

export const dynamic = "force-dynamic";

const isServerOwnedAssistantMessage = (message) =>
    message?.isServerGenerated === true ||
    message?.taskId != null ||
    (message?.sender === "assistant" && message?.direction === "incoming");

// Handle POST request to add a message to an existing chat for the current user
export async function POST(req, { params }) {
    params = await params;
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const { message } = await req.json();

        const messagesForPersistence = sanitizeMessagesForPersistence([
            message,
        ]);
        const messageForPersistence = messagesForPersistence[0] || message;

        const chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        if (!chat) {
            throw new Error("Chat not found");
        }

        const prepared = prepareMessagesForPersistence([
            ...(chat.messages || []),
            messageForPersistence,
        ]);
        chat.messages = prepared.messages;
        chat.messageStorageBytes = prepared.messageStorageBytes;
        if (prepared.messagesCompacted) {
            chat.messagesCompacted = true;
            chat.messagesCompactedAt = new Date();
        }
        Object.assign(chat, buildLastMessagePreview(chat.messages));
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
    params = await params;
    try {
        const { id } = params;
        if (!id || !Types.ObjectId.isValid(id)) {
            return Response.json({ error: "Invalid Chat ID" }, { status: 400 });
        }

        const currentUser = await getCurrentUser(false);

        const chat = await Chat.findOneAndDelete({
            _id: id,
            userId: currentUser._id,
        });

        const response = await deleteChatIdFromRecentList(id);

        return NextResponse.json({
            ...response,
            deletedChat: chat || null,
            missing: !chat,
        });
    } catch (error) {
        return handleError(error);
    }
}

// Handle GET request to retrieve a chat for the current user
export async function GET(req, { params }) {
    params = await params;
    try {
        const start = performance.now();
        const { id } = params;
        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get("limit");
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;
        const chat = await getChatById(id, { limit });
        const response = NextResponse.json(chat);
        response.headers.set(
            "Server-Timing",
            `chatById;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to update a chat for the current user
export async function PUT(req, { params }) {
    params = await params;
    try {
        const { id } = params;
        if (!id || !Types.ObjectId.isValid(id)) {
            return Response.json({ error: "Invalid Chat ID" }, { status: 400 });
        }

        const currentUser = await getCurrentUser(false);

        let body;
        try {
            body = await req.json();
        } catch (e) {
            return Response.json(
                { error: "Invalid or missing JSON body" },
                { status: 400 },
            );
        }

        if (!body || typeof body !== "object") {
            return Response.json({ error: "Invalid body" }, { status: 400 });
        }

        const allowMessageTruncation = body.allowMessageTruncation === true;

        // Remove client-only fields if present (they're not part of the schema,
        // just used for routing / update intent).
        if (body.chatId) {
            delete body.chatId;
        }
        if (
            Object.prototype.hasOwnProperty.call(body, "allowMessageTruncation")
        ) {
            delete body.allowMessageTruncation;
        }

        // First, get the existing chat to preserve server-generated messages
        const existingChat = await Chat.findOne({
            _id: id,
            userId: currentUser._id,
        });

        if (!existingChat) {
            throw new Error("Chat not found");
        }

        // If the request contains messages, preserve server-owned assistant
        // output unless the client explicitly marks this as replay/truncation.
        if (body.messages) {
            // Only preserve server messages if we're not clearing the chat
            // (when messages array is empty, we're clearing the chat)
            if (body.messages.length > 0) {
                const messagesForPersistence = sanitizeMessagesForPersistence(
                    body.messages,
                );

                // Sanitize messages to remove Mongoose metadata fields (defense in depth)
                const sanitizedMessages = messagesForPersistence.map((msg) => {
                    if (!msg || typeof msg !== "object") return msg;
                    // Remove Mongoose metadata fields that shouldn't be in updates
                    const { createdAt, updatedAt, ...cleanMsg } = msg;
                    return cleanMsg;
                });

                // Create a Map of message IDs from incoming messages for quick lookup
                const incomingMessagesMap = new Map(
                    sanitizedMessages.map((msg) => [msg._id?.toString(), msg]),
                );

                const isReplay = allowMessageTruncation;

                if (isReplay) {
                    // During replay, the client explicitly sends the messages it wants to keep
                    // We should NOT preserve any server-generated messages
                    // because they may have been intentionally removed by the replay
                    // The client's message list is the source of truth for what should remain
                } else {
                    // For normal updates: preserve all server-generated messages that aren't in incoming
                    const serverGeneratedMessages =
                        existingChat.messages.filter((msg) =>
                            isServerOwnedAssistantMessage(msg),
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

                const prepared =
                    prepareMessagesForPersistence(sanitizedMessages);

                body.messages = prepared.messages;
                body.messageStorageBytes = prepared.messageStorageBytes;
                if (prepared.messagesCompacted) {
                    body.messagesCompacted = true;
                    body.messagesCompactedAt = new Date();
                }

                // One-way gate: if chat has messages, mark it as used
                body.isUnused = false;

                Object.assign(body, buildLastMessagePreview(body.messages));
            }
            // If body.messages is empty, we don't add server messages back
            // This allows clearing all messages including server-generated ones
            if (body.messages?.length === 0) {
                body.lastMessagePreview = "";
                body.lastMessageSender = "";
                body.lastMessageAt = "";
                body.messageStorageBytes = 0;
                body.messagesCompacted = false;
                body.messagesCompactedAt = null;
            }
        }

        // If stopRequested is being set, add current activeSubscriptionId to stopRequestedSubscriptionIds array
        // This ensures we only stop the correct stream, not a new one that started after
        if (body.stopRequested && existingChat?.activeSubscriptionId) {
            body.stopRequestedSubscriptionIds = addStoppedSubscription(
                existingChat.stopRequestedSubscriptionIds,
                existingChat.activeSubscriptionId,
            );
        }

        // If isChatLoading is being set to false, ensure it's not overwriting an active stream
        // The stream endpoint sets isChatLoading: true when it starts, so preserve that if it exists
        // Exception: allow it if stopRequested is also being set (user explicitly stopped)
        if (
            existingChat?.isChatLoading &&
            body.isChatLoading === false &&
            !body.stopRequested
        ) {
            // Don't allow setting isChatLoading to false if stream is active
            // The stream endpoint will set it to false when it completes
            // Unless user explicitly stopped (stopRequested is true)
            delete body.isChatLoading;
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
