import mongoose from "mongoose";

export const appletSharedDataRevisionSchema = new mongoose.Schema(
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
        revision: {
            type: Number,
            required: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        reason: {
            type: String,
            required: true,
            enum: ["replace", "reset", "restore"],
            default: "replace",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

appletSharedDataRevisionSchema.index({
    appletId: 1,
    key: 1,
    revision: -1,
});

const AppletSharedDataRevision =
    mongoose.models.AppletSharedDataRevision ||
    mongoose.model("AppletSharedDataRevision", appletSharedDataRevisionSchema);

export default AppletSharedDataRevision;
