import mongoose from "mongoose";

// RequestProgress is deprecated. This model is used to migrate the tasks
// to the new Task model. When all users are migrated in production,
// the RequestProgress model can be deleted.
const requestProgressSchema = new mongoose.Schema(
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
        dismissed: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    },
);

requestProgressSchema.index({ cortexRequestId: 1 });
requestProgressSchema.index({ createdAt: -1 });
requestProgressSchema.index({ owner: 1 });

const RequestProgress =
    mongoose.models?.RequestProgress ||
    mongoose.model("RequestProgress", requestProgressSchema);

// Add a function to sync indexes when needed
RequestProgress.syncIndexes?.();

export default RequestProgress;
