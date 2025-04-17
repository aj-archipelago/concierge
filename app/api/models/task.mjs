import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
    {
        // Cortex request ID
        cortexRequestId: {
            type: String,
            required: false,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        progress: {
            type: Number,
            required: true,
            default: 0,
        },
        data: mongoose.Schema.Types.Mixed,
        statusText: String,
        status: {
            type: String,
            enum: [
                "pending",
                "in_progress",
                "completed",
                "failed",
                "cancelled",
            ],
            default: "pending",
        },
        error: String,
        type: {
            type: String,
            required: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        invokedFrom: {
            source: {
                type: String,
                enum: ["unknown", "chat", "video_page"],
                default: "unknown",
            },
            chatId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Chat",
            },
        },
        dismissed: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    },
);

taskSchema.index({ cortexRequestId: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ owner: 1 });

const Task = mongoose.models?.Task || mongoose.model("Task", taskSchema);

// Add a function to sync indexes when needed
Task.syncIndexes?.();

export default Task;
