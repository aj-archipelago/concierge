import mongoose from "mongoose";

export const NOTIFICATION_TYPES = ["resource-shared"];

const notificationSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        dismissed: {
            type: Boolean,
            default: false,
        },
        read: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    },
);

notificationSchema.index({ owner: 1, createdAt: -1 });
notificationSchema.index({ owner: 1, dismissed: 1, createdAt: -1 });
notificationSchema.index({ owner: 1, read: 1, dismissed: 1, createdAt: -1 });

const Notification =
    mongoose.models?.Notification ||
    mongoose.model("Notification", notificationSchema);

export default Notification;
