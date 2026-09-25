import mongoose from "mongoose";

// One durable request/reply envelope. Content is encrypted by src/db.mjs;
// only routing and delivery state are queried.
const schema = new mongoose.Schema(
    {
        owner: { type: mongoose.Schema.Types.ObjectId, required: true },
        sourceTaskId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sourceTurn: { type: Number, required: true },
        fromEntityId: { type: String, required: true },
        toEntityId: String, // absent for a question to the user
        taskId: mongoose.Schema.Types.ObjectId,
        chatId: mongoose.Schema.Types.ObjectId,
        status: {
            type: String,
            enum: ["pending", "answered", "failed"],
            default: "pending",
        },
        purpose: {
            type: String,
            enum: ["assignment", "question", "review"],
            default: "assignment",
        },
        delivered: { type: Boolean, default: false },
        payload: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);
schema.index({ sourceTaskId: 1, sourceTurn: 1 });
schema.index({ status: 1, updatedAt: 1 });
schema.index({ taskId: 1, status: 1 });
schema.index({ createdAt: 1, _id: 1 });
export default mongoose.models.AssistantMessage ||
    mongoose.model("AssistantMessage", schema);
