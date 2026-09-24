import mongoose from "mongoose";
import { messageSchema } from "./message.mjs";

// Define the schema for lists of message lists with an auto-generated ID
const chatSchema = new mongoose.Schema(
    {
        messages: [messageSchema],
        messageStorageMode: {
            type: String,
            enum: ["external"],
            default: null,
        },
        messageStorageGeneration: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        nextMessageSequence: {
            type: Number,
            default: 0,
        },
        lastMessageSequence: {
            type: Number,
            default: 0,
        },
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            auto: true,
        },
        title: {
            type: String,
            default: "Chat",
        },
        titleSetByUser: {
            type: Boolean,
            default: false,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
        isChatLoading: {
            type: Boolean,
            default: false,
        },
        lastMessagePreview: {
            type: String,
            default: "",
        },
        lastMessageSender: {
            type: String,
            default: "",
        },
        lastMessageAt: {
            type: String,
            default: "",
        },
        stopRequestedSubscriptionIds: {
            type: [
                {
                    subscriptionId: String,
                    timestamp: Date,
                },
            ],
            default: [],
        },
        activeSubscriptionId: {
            type: String,
            default: null,
        },
        // A private, one-shot opening reservation. Draft replies never enter
        // conversation history until the browser confirms continued idleness.
        conversationOpening: {
            type: mongoose.Schema.Types.Mixed,
            select: false,
        },
        selectedEntityId: {
            type: String,
            default: "",
        },
        assistantQuestionId: mongoose.Schema.Types.ObjectId,
        pinned: {
            type: Boolean,
            default: false,
        },
        pinnedAt: {
            type: Date,
            default: null,
        },
        archived: {
            type: Boolean,
            default: false,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

// Add indexes
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ userId: 1, updatedAt: -1 });
chatSchema.index({ userId: 1, createdAt: -1 });
chatSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });

// Create the Chat model from the schema
const Chat = mongoose.models?.Chat || mongoose.model("Chat", chatSchema);

export default Chat;
