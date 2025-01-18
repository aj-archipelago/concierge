import mongoose from "mongoose";

const autogenRunSchema = new mongoose.Schema({
    _id: mongoose.Schema.Types.ObjectId,
    requestId: String,
    requestMessage: String,
    progress: Number,
    data: String,
    contextId: String,
    conversation: [mongoose.Schema.Types.Mixed],
    createdAt: Date,
    insertionTime: Date,
    startedAt: Date,
});

// Add index at schema level
autogenRunSchema.index({ requestId: 1, contextId: 1 });

const AutogenRun =
    mongoose.models.AutogenRun ||
    mongoose.model("AutogenRun", autogenRunSchema);

export default AutogenRun;
