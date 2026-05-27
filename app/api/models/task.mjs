import mongoose from "mongoose";

export const taskSchema = new mongoose.Schema(
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
                "abandoned",
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
                enum: [
                    "unknown",
                    "chat",
                    "video_page",
                    "media_page",
                    "write_page_featured_image",
                    "canvas_new_image",
                    "canvas_image_modify",
                    "automation",
                ],
                default: "unknown",
            },
            chatId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Chat",
            },
        },
        // Denormalized for CSFLE-safe queries (avoid "automation.automationId" in filters).
        automationRefId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Automation",
            default: null,
        },
        automation: {
            automationId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Automation",
            },
            trigger: {
                type: String,
                enum: ["manual", "scheduled"],
            },
            scheduledFor: {
                type: Date,
            },
            outputPath: {
                type: String,
            },
            htmlOutputPath: {
                type: String,
            },
            htmlOutputPreview: {
                type: String,
            },
        },
        lastHeartbeat: {
            type: Date,
            default: null,
        },
        dismissed: {
            type: Boolean,
            default: false,
        },
        // BullMQ job ID
        jobId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

taskSchema.index({ cortexRequestId: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ owner: 1 });
taskSchema.index({ owner: 1, "automation.automationId": 1, createdAt: -1 });
taskSchema.index({ owner: 1, automationRefId: 1, createdAt: -1 });

const Task = mongoose.models?.Task || mongoose.model("Task", taskSchema);

// Add a function to sync indexes when needed
Task.syncIndexes?.();

export default Task;
