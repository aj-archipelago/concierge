import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
    {
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        category: {
            type: String,
            required: true,
            enum: ["bug", "idea", "question", "other"],
            default: "bug",
        },
        status: {
            type: String,
            required: true,
            enum: ["open", "resolved"],
            default: "open",
        },
        screenshotUrl: {
            type: String,
            required: false,
            trim: true,
        },
        pageUrl: {
            type: String,
            required: false,
            trim: true,
        },
        userAgent: {
            type: String,
            required: false,
            trim: true,
        },
        source: {
            type: String,
            required: true,
            enum: ["user", "agent"],
            default: "user",
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        userName: {
            type: String,
            required: false,
            trim: true,
        },
        username: {
            type: String,
            required: false,
            trim: true,
        },
        resolvedAt: {
            type: Date,
            required: false,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
    },
    {
        timestamps: true,
    },
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1 });

const Feedback =
    mongoose.models?.Feedback || mongoose.model("Feedback", feedbackSchema);

export default Feedback;
