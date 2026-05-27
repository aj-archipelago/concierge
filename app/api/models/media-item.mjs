import mongoose from "mongoose";

const MAX_INPUT_IMAGE_REFERENCES = 14;
const MAX_INPUT_VIDEO_REFERENCES = 1;
const inputImageUrlFields = Object.fromEntries(
    Array.from({ length: MAX_INPUT_IMAGE_REFERENCES }, (_, index) => [
        index === 0 ? "inputImageUrl" : `inputImageUrl${index + 1}`,
        String,
    ]),
);
const inputImageRoleFields = Object.fromEntries(
    Array.from({ length: MAX_INPUT_IMAGE_REFERENCES }, (_, index) => [
        index === 0 ? "inputImageRole" : `inputImageRole${index + 1}`,
        String,
    ]),
);
const inputVideoUrlFields = Object.fromEntries(
    Array.from({ length: MAX_INPUT_VIDEO_REFERENCES }, (_, index) => [
        index === 0 ? "inputVideoUrl" : `inputVideoUrl${index + 1}`,
        String,
    ]),
);
const inputVideoRoleFields = Object.fromEntries(
    Array.from({ length: MAX_INPUT_VIDEO_REFERENCES }, (_, index) => [
        index === 0 ? "inputVideoRole" : `inputVideoRole${index + 1}`,
        String,
    ]),
);

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
            enum: ["image", "video", "audio"],
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
        thumbnailUrl: String,
        thumbnailAzureUrl: String,
        thumbnailGcsUrl: String,
        thumbnailBlobPath: String,
        thumbnailHash: String,
        // File hash for file collection integration
        hash: String,
        blobPath: String,
        outputFolder: String,
        // Video-specific fields
        duration: Number,
        generateAudio: Boolean,
        resolution: String,
        cameraFixed: Boolean,
        // Input image references used for derivative image/video/audio generation
        ...inputImageUrlFields,
        ...inputImageRoleFields,
        // Input video references used for video extension
        ...inputVideoUrlFields,
        ...inputVideoRoleFields,
        // Input audio reference used for audio-to-audio generation
        inputAudioUrl: String,
        inputAudioBlobPath: String,
        inputAudioHash: String,
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
        // Tags for organization and filtering
        tags: {
            type: [String],
            default: [],
            index: true,
        },
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
mediaItemSchema.index({ user: 1, tags: 1, created: -1 }); // For filtering by tags

// Ensure unique taskId per user
mediaItemSchema.index({ user: 1, taskId: 1 }, { unique: true });

const MediaItem =
    mongoose.models.MediaItem || mongoose.model("MediaItem", mediaItemSchema);

export default MediaItem;
