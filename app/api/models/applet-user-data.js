import mongoose from "mongoose";

export const appletUserDataSchema = new mongoose.Schema(
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
        key: {
            type: String,
            required: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            default: null,
        },
        valueBytes: {
            type: Number,
            required: true,
            default: 0,
        },
    },
    {
        timestamps: true,
    },
);

appletUserDataSchema.index(
    { appletId: 1, userId: 1, key: 1 },
    { unique: true },
);

const AppletUserData =
    mongoose.models.AppletUserData ||
    mongoose.model("AppletUserData", appletUserDataSchema);

export default AppletUserData;
