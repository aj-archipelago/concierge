import mongoose from "mongoose";
import uploadedDocsSchema from "./uploaded-docs.mjs";

// Define the User schema
const userSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        aiMemorySelfModify: {
            type: Boolean,
            required: true,
            default: true,
        },
        contextId: {
            type: String,
            required: true,
            trim: true,
        },
        aiMemory: {
            type: String,
            required: false,
            trim: true,
            default: "{}",
        },
        uploadedDocs: {
            type: [uploadedDocsSchema],
            required: false,
            default: [],
        },
        recentChatIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "Chat",
            required: false,
        },
        activeChatId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: false,
        },
        lastActiveAt: {
            type: Date,
            required: false,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    },
);

userSchema.virtual("initials").get(function () {
    return this.name
        .split(" ")
        .map((n) => n[0]?.toUpperCase() || "")
        .join("");
});

// add index on userId
userSchema.index({ userId: 1 });

// Create the User model from the schema
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;