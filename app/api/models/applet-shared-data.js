import mongoose from "mongoose";

export const appletSharedDataSchema = new mongoose.Schema(
    {
        appletId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Applet",
            required: true,
        },
        key: {
            type: String,
            required: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            default: {},
        },
        revision: {
            type: Number,
            required: true,
            default: 1,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

appletSharedDataSchema.index({ appletId: 1, key: 1 }, { unique: true });

const AppletSharedData =
    mongoose.models.AppletSharedData ||
    mongoose.model("AppletSharedData", appletSharedDataSchema);

export default AppletSharedData;
