import mongoose from "mongoose";

// user-workspace membership model
const workspaceMembership = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workspace",
        },
    },
    {
        timestamps: true,
    },
);

// unique index
workspaceMembership.index({ user: 1, workspace: 1 }, { unique: true });

// Create the WorkspaceMembership model from the schema
const WorkspaceMembership =
    mongoose.models.WorkspaceMembership ||
    mongoose.model("WorkspaceMembership", workspaceMembership);

export default WorkspaceMembership;
