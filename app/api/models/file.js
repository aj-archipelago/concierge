import mongoose from "mongoose";

// Define the File schema
export const fileSchema = new mongoose.Schema(
    {
        filename: {
            type: String,
            required: true,
        },
        originalName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        url: {
            type: String,
            required: true,
        },
        gcsUrl: {
            type: String,
            required: false,
        },
        hash: {
            type: String,
            required: true,
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
        // Add references to track which user uploaded the file
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Error state for files that failed validation/refresh
        error: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    },
);

// Create index on owner for efficient lookups
fileSchema.index({ owner: 1 });
fileSchema.index({ uploadedAt: -1 });

// Create the File model from the schema
const File = mongoose.models?.File || mongoose.model("File", fileSchema);

export default File;
