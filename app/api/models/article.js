import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        title: {
            type: String,
            default: "",
            trim: true,
        },
        workspacePath: {
            type: String,
            required: true,
            trim: true,
        },
        fileHash: { type: String, default: null },
        blobPath: { type: String, default: null },
        filename: { type: String, default: null },
    },
    { timestamps: true },
);

articleSchema.index({ owner: 1, workspacePath: 1 }, { unique: true });

const Article =
    mongoose.models?.Article || mongoose.model("Article", articleSchema);

export default Article;
