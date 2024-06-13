import mongoose from "mongoose";

// Define the individual message schema
const messageSchema = new mongoose.Schema(
    {
        payload: {
            type: String,
            required: true,
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

// Add an index on userId
chatSchema.index({ userId: 1 });

// Create the Chat model from the schema
const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);

export default Chat;
