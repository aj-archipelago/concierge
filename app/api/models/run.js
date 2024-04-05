import mongoose from "mongoose";

// Define the Run schema
const runSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workspace",
        },
        output: {
            type: String,
        },
        // expire in 15 days
        expireAt: {
            type: Date,
            default: Date.now(),
            expires: 15 * 24 * 60 * 60,
        },
    },
    {
        timestamps: true,
    },
);

// add index on owner
runSchema.index({ owner: 1 });
runSchema.index({ createdAt: -1 });

// Create the Run model from the schema
const Run = mongoose.models.Run || mongoose.model("Run", runSchema);

export default Run;
