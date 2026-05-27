import mongoose from "mongoose";

// Define the Workspace schema
export const appletSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        html: {
            type: String,
            required: false,
        },
        htmlVersions: [
            {
                content: {
                    type: String,
                    required: false,
                },
                contentUrl: {
                    type: String,
                    required: false,
                },
                contentBlobPath: {
                    type: String,
                    required: false,
                },
                contentHash: {
                    type: String,
                    required: false,
                },
                contentSize: {
                    type: Number,
                    required: false,
                },
                contentContextId: {
                    type: String,
                    required: false,
                },
                timestamp: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        publishedVersionIndex: {
            type: Number,
            required: false,
            default: null, // No version published by default
        },
        publishedContentUrl: {
            type: String,
            required: false,
        },
        publishedContentBlobPath: {
            type: String,
            required: false,
        },
        publishedContentHash: {
            type: String,
            required: false,
        },
        publishedContentSize: {
            type: Number,
            required: false,
        },
        publishedContentContextId: {
            type: String,
            required: false,
        },
        publishedContentVersionIndex: {
            type: Number,
            required: false,
        },
        publishedContentTimestamp: {
            type: Date,
            required: false,
        },
        messages: [
            {
                role: {
                    type: String,
                    required: true,
                },
                content: {
                    type: String,
                    required: true,
                },
                linkToVersion: {
                    type: Number,
                    required: false,
                },
            },
        ],
        suggestions: [
            {
                name: {
                    type: String,
                    required: true,
                },
                uxDescription: {
                    type: String,
                    required: true,
                },
            },
        ],
        name: {
            type: String,
            required: false,
        },
        version: {
            type: Number,
            required: false,
            default: 1,
        },
        filePath: {
            type: String,
            required: false,
        },
        sdkSuspendedAt: {
            type: Date,
            required: false,
        },
        sdkSuspendedUntil: {
            type: Date,
            required: false,
        },
        sdkSuspendedReason: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    },
);

// add index on owner
appletSchema.index({ owner: 1 });
appletSchema.index({ owner: 1, version: 1, updatedAt: -1 });

// Create the Workspace model from the schema
const Applet = mongoose.models.Applet || mongoose.model("Applet", appletSchema);

export default Applet;
