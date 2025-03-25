import mongoose from "mongoose";

const requestProgressSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            required: true,
            unique: true,
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

requestProgressSchema.index({ requestId: 1 });
requestProgressSchema.index({ createdAt: -1 });
requestProgressSchema.index({ owner: 1 });

const RequestProgress =
    mongoose.models.RequestProgress ||
    mongoose.model("RequestProgress", requestProgressSchema);

export default RequestProgress;
