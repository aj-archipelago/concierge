import mongoose from "mongoose";

// Define the WorkspaceState schema
const workspaceStateSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workspace",
        },
        inputText: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
);

// add index on owner
workspaceStateSchema.index({ user: 1, workspace: 1 });

// Create the WorkspaceState model from the schema
const WorkspaceState =
    mongoose.models.WorkspaceState ||
    mongoose.model("WorkspaceState", workspaceStateSchema);

export default WorkspaceState;
