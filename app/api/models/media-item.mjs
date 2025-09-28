import mongoose from "mongoose";

const mediaItemSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        taskId: {
            type: String,
            required: true,
            index: true,
        },
        cortexRequestId: {
            type: String,
            required: true,
            index: true,
        },
        prompt: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["image", "video"],
            required: true,
        },
        model: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "pending",
        },
        // Media URLs
        url: String,
        azureUrl: String,
        gcsUrl: String,
        // Video-specific fields
        duration: Number,
        generateAudio: Boolean,
        resolution: String,
        cameraFixed: Boolean,
        // Input images for video generation
        inputImageUrl: String,
        inputImageUrl2: String,
        inputImageUrl3: String,
        // Metadata
        created: {
            type: Number,
            default: () => Math.floor(Date.now() / 1000),
        },
        completed: Number,
        // Error information
        error: {
            code: String,
            message: String,
        },
        // Settings used for generation
        settings: mongoose.Schema.Types.Mixed,
    },
    {
        timestamps: true,
    },
);

// Compound index for efficient queries
mediaItemSchema.index({ user: 1, created: -1 });
mediaItemSchema.index({ user: 1, status: 1 });
mediaItemSchema.index({ user: 1, type: 1, created: -1 }); // For filtering by type
mediaItemSchema.index({ user: 1, status: 1, created: -1 }); // For filtering by status with sorting

// Ensure unique taskId per user
mediaItemSchema.index({ user: 1, taskId: 1 }, { unique: true });

const MediaItem =
    mongoose.models.MediaItem || mongoose.model("MediaItem", mediaItemSchema);

export default MediaItem;
