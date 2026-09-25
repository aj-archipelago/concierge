import { NextResponse } from "next/server";
import { Types } from "mongoose";
import Chat from "../../models/chat.mjs";
import { getCurrentUser, handleError } from "../../utils/auth";
import {
    deleteEntityShare,
    syncChatLinkSharing,
} from "../../utils/shareHelpers";
import {
    deleteChatIdFromRecentList,
    getChatById,
    sanitizeMessagesForPersistence,
    addStoppedSubscription,
    getChatForOwnerWrite,
} from "../_lib";
import {
    appendChatMessage,
    deleteExternalChatMessages,
    replaceChatMessages,
    updateChatMessages,
} from "../message-store.js";
import { DEFAULT_CHAT_MESSAGES_LIMIT } from "../../../constants/chats.js";

export const dynamic = "force-dynamic";

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

        const loaded = await getChatForOwnerWrite(id, currentUser?._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }
        const chat = loaded.chat;

        await appendChatMessage(chat, messageForPersistence, {
            dedupeKey: message?._clientId || message?._id,
        });
        return NextResponse.json(
            await getChatById(id, { limit: DEFAULT_CHAT_MESSAGES_LIMIT }),
        );
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
        if (chat) {
            await deleteExternalChatMessages(chat._id);
            await deleteEntityShare("chat", chat._id);
        }

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
        const before = searchParams.get("before") || undefined;
        const chat = await getChatById(id, { limit, before });
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

        const messageUpdates = Array.isArray(body.messageUpdates)
            ? body.messageUpdates
            : null;
        const messageToAppend = body.appendMessage || null;

        // Remove client-only fields if present (they're not part of the schema,
        // just used for routing / update intent).
        if (body.chatId) {
            delete body.chatId;
        }
        delete body.messageUpdates;
        delete body.appendMessage;

        // First, get the existing chat to preserve server-generated messages
        const loaded = await getChatForOwnerWrite(id, currentUser._id);
        if (!loaded.ok) {
            return NextResponse.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        }
        const existingChat = loaded.chat;
        const { access } = loaded;

        if (
            Object.prototype.hasOwnProperty.call(body, "isPublic") &&
            !access.isOwner
        ) {
            delete body.isPublic;
        }

        if (Object.prototype.hasOwnProperty.call(body, "messages")) {
            const replacementMessages = sanitizeMessagesForPersistence(
                body.messages,
            );
            await replaceChatMessages(existingChat, replacementMessages);
            delete body.messages;
        }

        if (messageUpdates?.length) {
            await updateChatMessages(existingChat, messageUpdates);
        }

        if (messageToAppend) {
            await appendChatMessage(existingChat, messageToAppend, {
                dedupeKey: messageToAppend?._clientId || messageToAppend?._id,
            });
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

        if (Object.prototype.hasOwnProperty.call(body, "isPublic")) {
            await syncChatLinkSharing({
                chatId: id,
                ownerId: existingChat.userId,
                linkEnabled: Boolean(body.isPublic),
            });
        }

        const chat = await Chat.findOneAndUpdate(
            {
                _id: id,
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

        return NextResponse.json(
            await getChatById(id, { limit: DEFAULT_CHAT_MESSAGES_LIMIT }),
        );
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
