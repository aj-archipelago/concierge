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
        aiName: {
            type: String,
            required: false,
            default: "Labeeb",
        },
        aiStyle: {
            type: String,
            required: true,
            default: "OpenAI",
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
        role: {
            type: String,
            required: true,
            enum: ["user", "admin"],
            default: "user",
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

// Create the User model from the schema
const User = mongoose.models?.User || mongoose.model("User", userSchema);

export default User;
