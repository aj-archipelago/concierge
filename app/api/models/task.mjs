import mongoose from "mongoose";

export const taskSchema = new mongoose.Schema(
    {
        dispatchPending: { type: Boolean },
        executionStartedAt: { type: Date },
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
                "waiting",
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
        assistantEntityId: String,
        assistantRootId: mongoose.Schema.Types.ObjectId,
        assistantTurn: { type: Number, default: 0 },
        assistantDepth: { type: Number, default: 0 },
        assistantPending: { type: Boolean, default: false },
        assistantDispatches: { type: [String], default: undefined },
        // Private task/question context must not appear in shared run responses
        // or embedded task snapshots. Only continuation code opts into reading it.
        assistantContext: { type: mongoose.Schema.Types.Mixed, select: false },
        assistantTeam: { type: mongoose.Schema.Types.Mixed, select: false },
        assistantTeamRevision: { type: Number, default: 0 },
        assistantOutcome: { type: mongoose.Schema.Types.Mixed, select: false },
        assistantSelfContinue: { type: Boolean, default: false },
        assistantIncompleteTurns: { type: Number, default: 0 },
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
                    "applet_metadata",
                    "applet_sdk",
                    "automation",
                ],
                default: "unknown",
            },
            appletId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Applet",
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
            widgetHtmlOutputPath: {
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
        outputExpiredAt: { type: Date, default: null },
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

taskSchema.index({ dispatchPending: 1, createdAt: 1 });
taskSchema.index({ type: 1, status: 1, createdAt: 1 });
taskSchema.index({ owner: 1, automationRefId: 1, type: 1, status: 1 });
taskSchema.index({ cortexRequestId: 1 });
taskSchema.index({ status: 1, assistantPending: 1, updatedAt: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ createdAt: -1, _id: -1 });
taskSchema.index({ owner: 1 });
taskSchema.index({ owner: 1, assistantRootId: 1 });
taskSchema.index({ owner: 1, status: 1, dismissed: 1, createdAt: -1 });
taskSchema.index({ owner: 1, "automation.automationId": 1, createdAt: -1 });
taskSchema.index({ owner: 1, automationRefId: 1, createdAt: -1 });

const Task = mongoose.models?.Task || mongoose.model("Task", taskSchema);

export default Task;
