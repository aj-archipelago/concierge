import mongoose from "mongoose";

// Define the AppletFile schema
export const appletFileSchema = new mongoose.Schema(
    {
        appletId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Applet",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        files: {
            type: [{
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
                uploadedAt: {
                    type: Date,
                    default: Date.now,
                },
            }],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

// Create compound index on appletId and userId for efficient lookups
appletFileSchema.index({ appletId: 1, userId: 1 }, { unique: true });

// Create the AppletFile model from the schema
const AppletFile = mongoose.models.AppletFile || mongoose.model("AppletFile", appletFileSchema);

export default AppletFile; 