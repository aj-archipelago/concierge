import mongoose from "mongoose";
import "./file";

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
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "File",
                },
            ],
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
const AppletFile =
    mongoose.models.AppletFile ||
    mongoose.model("AppletFile", appletFileSchema);

export default AppletFile;
