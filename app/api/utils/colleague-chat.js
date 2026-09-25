import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Chat from "../models/chat.mjs";
import Notification from "../models/notification.mjs";
import Share from "../models/share.js";
import Task from "../models/task.mjs";
import { normalizeNotificationDestination } from "../../../src/utils/notificationDestination.js";
import {
    appendChatMessage,
    EXTERNAL_MESSAGE_STORAGE,
} from "../chats/message-store.js";

export async function isShared(chat) {
    return Boolean(
        chat.isPublic ||
            (await Share.exists({
                entityType: "chat",
                entityId: chat._id,
                $or: [
                    { "link.enabled": true },
                    { "recipients.0": { $exists: true } },
                ],
            })),
    );
}

export function chatMatchesAssistant(chat, user, entityId) {
    return (
        chat?.selectedEntityId === entityId ||
        (entityId === user.personalEntityId && !chat?.selectedEntityId)
    );
}

// A job has one conversation. Background-only jobs derive a stable chat ID
// from their root task; questions never create a new thread per message.
export async function getAssistantConversation(
    user,
    task,
    { create = false } = {},
) {
    const root = await Task.findOne({
        _id: task.assistantRootId || task._id,
        owner: user._id,
    }).select("+assistantContext");
    if (!root)
        throw Object.assign(new Error("Task not found"), { status: 404 });
    const entityId = root.assistantEntityId || task.assistantEntityId;
    const sourceId =
        root.assistantContext?.sourceChatId || root.invokedFrom?.chatId;
    const chatId =
        sourceId ||
        createHash("sha256")
            .update(`assistant-job-chat:${root._id}`)
            .digest("hex")
            .slice(0, 24);
    if (!sourceId && create)
        await Chat.updateOne(
            { _id: chatId },
            {
                $setOnInsert: {
                    userId: user._id,
                    selectedEntityId: entityId,
                    title:
                        root.assistantContext?.title ||
                        root.assistantContext?.brief?.slice(0, 80) ||
                        entityId,
                    titleSetByUser: true,
                    messages: [],
                    isPublic: false,
                    messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
                    messageStorageGeneration: new mongoose.Types.ObjectId(),
                    nextMessageSequence: 0,
                },
            },
            { upsert: true },
        );
    const chat = await Chat.findOne({ _id: chatId, userId: user._id });
    if (!chat && !sourceId && !create) return { chat: null, root, entityId };
    if (
        !chat ||
        !chatMatchesAssistant(chat, user, entityId) ||
        (await isShared(chat))
    )
        throw Object.assign(
            new Error("The job conversation is unavailable or shared"),
            { status: 403 },
        );
    if (create && !root.invokedFrom?.chatId) {
        // Reuse the existing task/chat association for navigation and activity
        // queries. Keep invokedFrom.source (e.g. automation) unchanged.
        await Task.updateOne(
            {
                _id: root._id,
                owner: user._id,
                "invokedFrom.chatId": null,
            },
            { $set: { "invokedFrom.chatId": String(chat._id) } },
        );
    }
    return { chat, root, entityId };
}

export async function getColleagueChat(user, entityId, name) {
    const existing = await Chat.findOne({
        userId: user._id,
        selectedEntityId: entityId,
        isPublic: { $ne: true },
        archived: { $ne: true },
        assistantQuestionId: null,
    }).sort({ updatedAt: -1 });
    if (existing && !(await isShared(existing))) return existing;
    return Chat.create({
        userId: user._id,
        selectedEntityId: entityId,
        title: name,
        titleSetByUser: true,
        messages: [],
        messageStorageMode: EXTERNAL_MESSAGE_STORAGE,
        messageStorageGeneration: new mongoose.Types.ObjectId(),
        nextMessageSequence: 0,
    });
}

export function colleagueNotificationId(operationId) {
    return new mongoose.Types.ObjectId(
        createHash("sha256")
            .update(`colleague:${operationId}`)
            .digest("hex")
            .slice(0, 24),
    );
}

export async function publishColleagueMessage(user, message) {
    const _id = colleagueNotificationId(message._id);
    const pinnedChatId = message.chatId || message.preferredChatId;
    const pinned = pinnedChatId
        ? await Chat.findOne({ _id: pinnedChatId, userId: user._id })
        : null;
    if (
        pinnedChatId &&
        (!pinned ||
            !chatMatchesAssistant(pinned, user, message.entityId) ||
            (await isShared(pinned)))
    )
        throw new Error("Notification chat is unavailable or shared");
    let notification = await Notification.findOne({ _id, owner: user._id });
    if (!notification) {
        const chat =
            pinned ||
            (await getColleagueChat(user, message.entityId, message.name));
        try {
            notification = await Notification.findOneAndUpdate(
                { _id, owner: user._id },
                {
                    $setOnInsert: {
                        owner: user._id,
                        assistantRootId: message.teamId || null,
                        type: "colleague-message",
                        read: false,
                        dismissed: false,
                        metadata: {
                            entityId: message.entityId,
                            name: message.name,
                            message: message.message,
                            kind: message.kind,
                            entityKind: message.entityKind,
                            avatar: message.avatar,
                            url: normalizeNotificationDestination(message.url),
                            chatId: String(chat._id),
                        },
                    },
                },
                { upsert: true, new: true },
            );
        } catch (error) {
            if (error.code !== 11000) throw error;
            notification = await Notification.findOne({ _id, owner: user._id });
            if (!notification) throw error;
        }
    }
    // Pinned job delivery never falls back to whichever chat was most recent.
    let chat =
        pinned ||
        (await Chat.findOne({
            _id: notification.metadata.chatId,
            userId: user._id,
        }));
    let relocated = false;
    if (
        !pinned &&
        (!chat ||
            !chatMatchesAssistant(chat, user, message.entityId) ||
            (await isShared(chat)))
    ) {
        chat = await getColleagueChat(user, message.entityId, message.name);
        relocated = true;
    }
    if (
        (pinned || relocated) &&
        String(notification.metadata.chatId) !== String(chat._id)
    )
        notification = await Notification.findOneAndUpdate(
            { _id, owner: user._id },
            {
                $set: {
                    metadata: {
                        ...notification.metadata,
                        chatId: String(chat._id),
                    },
                },
            },
            { new: true },
        );
    if (chat) {
        const savedMessage = await appendChatMessage(
            chat,
            {
                payload: message.message,
                sender: "concierge",
                entityId: message.entityId,
                direction: "incoming",
                position: "single",
                sentTime: new Date(
                    message.createdAt || Date.now(),
                ).toISOString(),
                isServerGenerated: true,
            },
            { dedupeKey: `colleague:${message._id}` },
        );
        // A read receipt must refer to the actual persisted message, including
        // the existing message returned when an interrupted delivery retries.
        if (
            savedMessage?._id &&
            String(notification.metadata.messageId) !== String(savedMessage._id)
        ) {
            notification = await Notification.findOneAndUpdate(
                { _id, owner: user._id },
                { $set: { "metadata.messageId": String(savedMessage._id) } },
                { new: true },
            );
        }
    }
    return notification;
}
