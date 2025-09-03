import mongoose from "mongoose";

// Define the AppletData schema
export const appletDataSchema = new mongoose.Schema(
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
        data: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            default: {},
        },
    },
    {
        timestamps: true,
    },
);

// Create compound index on appletId and userId for efficient lookups
appletDataSchema.index({ appletId: 1, userId: 1 }, { unique: true });

// Create the AppletData model from the schema
const AppletData =
    mongoose.models.AppletData ||
    mongoose.model("AppletData", appletDataSchema);

export default AppletData;
