import mongoose from "mongoose";

const validatePayload = (value) => {
    return (
        typeof value === "string" ||
        (Array.isArray(value) &&
            value.every((item) => typeof item === "string"))
    );
};

// Define the individual message schema
const messageSchema = new mongoose.Schema(
    {
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            validate: [
                validatePayload,
                "Payload should be a string or an array of strings",
            ],
        },
        sender: {
            type: String,
            required: true,
        },
        tool: {
            type: String,
            default: null,
        },
        sentTime: {
            type: String,
            required: true,
        },
        direction: {
            type: String,
            required: true,
        },
        position: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

// Define the schema for lists of message lists with an auto-generated ID
const chatSchema = new mongoose.Schema(
    {
        messages: [messageSchema],
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
            ref: "User", // Reference to the User model
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

// Add indexes
chatSchema.index({ userId: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ userId: 1, updatedAt: -1 });

// Create the Chat model from the schema
const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

export default Chat;
