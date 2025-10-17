import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import { createNewChat, deleteChatIdFromRecentList } from "../_lib";
import Chat from "../../models/chat.mjs";
import User from "../../models/user";
import { Types } from "mongoose";

const MAX_RECENT_CHATS = 1_000;
const AUTO_TITLE_MAX_LENGTH = 14;

const normalizeChatsPayload = (payload) => {
    if (Array.isArray(payload?.chats)) return payload.chats;
    if (Array.isArray(payload)) return payload;
    return [];
};

const isValidPayload = (value) =>
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"));

const sanitizeMessage = (message) => {
    if (!message || typeof message !== "object") return null;

    const payload = message.payload;
    if (!isValidPayload(payload)) return null;

    const sender = typeof message.sender === "string" ? message.sender : null;
    const direction =
        typeof message.direction === "string" ? message.direction : null;
    if (!sender || !direction) return null;

    const position =
        typeof message.position === "string" && message.position.trim()
            ? message.position
            : "single";
    const sentTime =
        typeof message.sentTime === "string" && message.sentTime.trim()
            ? message.sentTime
            : new Date().toISOString();

    const sanitized = {
        payload,
        sender,
        direction,
        position,
        sentTime,
        tool:
            typeof message.tool === "string" || message.tool === null
                ? message.tool
                : null,
        entityId:
            typeof message.entityId === "string" || message.entityId === null
                ? message.entityId
                : null,
        taskId: Types.ObjectId.isValid(message.taskId)
            ? new Types.ObjectId(message.taskId)
            : null,
        isServerGenerated: Boolean(message.isServerGenerated),
        ephemeralContent:
            typeof message.ephemeralContent === "string"
                ? message.ephemeralContent
                : null,
        thinkingDuration: Number.isFinite(message.thinkingDuration)
            ? message.thinkingDuration
            : 0,
    };

    if (message.task && typeof message.task === "object") {
        sanitized.task = message.task;
    }

    return sanitized;
};

const deriveTitle = (chat, messages) => {
    if (typeof chat?.title === "string" && chat.title.trim()) {
        return chat.title.trim();
    }
    const firstPayload = messages[0]?.payload;
    if (typeof firstPayload === "string" && firstPayload.trim()) {
        return firstPayload.substring(0, AUTO_TITLE_MAX_LENGTH);
    }
    if (Array.isArray(firstPayload) && firstPayload.length) {
        return firstPayload.join(" ").substring(0, AUTO_TITLE_MAX_LENGTH);
    }
    return "";
};

// POST expects array of chats (or {chats: [...] }). Each chat must include messages array.
export async function POST(req) {
    try {
        const currentUser = await getCurrentUser(false);
        const body = await req.json();
        const rawChats = normalizeChatsPayload(body);

        if (!rawChats.length) {
            return NextResponse.json(
                { error: "Request must include at least one chat" },
                { status: 400 },
            );
        }

        const createdIds = [];
        const createdChats = [];
        const errors = [];

        for (let index = 0; index < rawChats.length; index += 1) {
            const chat = rawChats[index];
            const messagesInput = Array.isArray(chat?.messages)
                ? chat.messages
                : null;

            if (!messagesInput || !messagesInput.length) {
                errors.push({ index, error: "Chat must include messages" });
                continue;
            }

            const sanitizedMessages = [];
            let isInvalid = false;
            for (const message of messagesInput) {
                const sanitized = sanitizeMessage(message);
                if (!sanitized) {
                    isInvalid = true;
                    break;
                }
                sanitizedMessages.push(sanitized);
            }

            if (isInvalid) {
                errors.push({
                    index,
                    error: "One or more messages are invalid",
                });
                continue;
            }

            try {
                const newChat = await createNewChat({
                    messages: sanitizedMessages,
                    title: deriveTitle(chat, sanitizedMessages),
                });
                const plainChat = newChat?.toObject
                    ? newChat.toObject({ depopulate: true })
                    : newChat;
                if (plainChat?._id) {
                    plainChat._id = plainChat._id.toString();
                }
                if (plainChat?.userId) {
                    plainChat.userId = plainChat.userId.toString();
                }
                createdIds.push(String(newChat?._id));
                createdChats.push(plainChat);
            } catch (error) {
                errors.push({
                    index,
                    error: error?.message || "Failed to import chat",
                });
            }
        }

        if (createdIds.length) {
            const user = await User.findById(currentUser._id);
            if (user) {
                const existingRecent = Array.isArray(user.recentChatIds)
                    ? user.recentChatIds.filter(Boolean).map(String)
                    : [];
                const merged = [
                    ...createdIds,
                    ...existingRecent.filter((id) => !createdIds.includes(id)),
                ].slice(0, MAX_RECENT_CHATS);

                user.recentChatIds = merged;
                if (!user.activeChatId) {
                    user.activeChatId = createdIds[0];
                }
                await user.save();
            }
        }

        return NextResponse.json({
            createdIds,
            createdChats,
            createdCount: createdIds.length,
            errors,
        });
    } catch (error) {
        return handleError(error);
    }
}

// DELETE expects array of chat ids (or {chatIds: [...] }). Invalid IDs are reported via missingIds.
export async function DELETE(req) {
    try {
        const currentUser = await getCurrentUser(false);
        const body = await req.json();
        const chatIds = Array.isArray(body?.chatIds) ? body.chatIds : [];

        if (!chatIds.length) {
            return NextResponse.json(
                { error: "Request must include chatIds" },
                { status: 400 },
            );
        }

        const deletedIds = [];
        const missingIds = [];

        for (const rawId of chatIds) {
            if (!Types.ObjectId.isValid(rawId)) {
                missingIds.push(String(rawId));
                continue;
            }

            const id = String(rawId);
            const chat = await Chat.findOneAndDelete({
                _id: id,
                userId: currentUser._id,
            });

            if (chat) {
                deletedIds.push(id);
                await deleteChatIdFromRecentList(id);
            } else {
                missingIds.push(id);
            }
        }

        return NextResponse.json({ deletedIds, missingIds });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
