import mongoose from "mongoose";

export const SHARE_ENTITY_TYPES = [
    "chat",
    "workspace",
    "applet",
    "automation",
    "article",
];
export const SHARE_ROLES = ["viewer", "editor"];

const recipientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        role: {
            type: String,
            enum: SHARE_ROLES,
            default: "viewer",
            required: true,
        },
        addedAt: { type: Date, default: Date.now },
    },
    { _id: false },
);

const shareSchema = new mongoose.Schema(
    {
        // Plain string (not enum) so future entity types do not require a
        // schema migration. The API layer validates against SHARE_ENTITY_TYPES.
        entityType: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        link: {
            enabled: { type: Boolean, default: false },
            role: { type: String, enum: SHARE_ROLES, default: "viewer" },
        },
        recipients: { type: [recipientSchema], default: [] },
    },
    { timestamps: true },
);

shareSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
shareSchema.index({ "recipients.userId": 1 });

const Share = mongoose.models?.Share || mongoose.model("Share", shareSchema);

export default Share;
