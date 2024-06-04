import mongoose from "mongoose";
import uploadedDocsSchema from "./uploaded-docs";
import chatSchema from "./chat";

// Define the User schema
const userSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            trim: true, // Trims whitespace from the userId
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true, // Trims whitespace from the username
            minlength: 3, // Minimum length of the username
        },
        name: {
            type: String,
            required: true,
            trim: true, // Trims whitespace from the name
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
        savedChats: {
            type: [chatSchema],
            required: false,
            default: [],
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
