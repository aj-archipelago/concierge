import crypto from "crypto";
import mongoose from "mongoose";
import Workspace from "../../models/workspace";
import WorkspaceMembership from "../../models/workspace-membership";
import { getCurrentUser } from "../../utils/auth";

export async function getWorkspace(id) {
    let workspace;

    if (mongoose.isObjectIdOrHexString(id)) {
        workspace = await Workspace.findOne({ _id: id }).populate({
            path: "prompts",
            populate: {
                path: "files",
                model: "File",
            },
        });
    } else {
        workspace = await Workspace.findOne({ slug: id }).populate({
            path: "prompts",
            populate: {
                path: "files",
                model: "File",
            },
        });
    }

    const user = await getCurrentUser();

    if (!workspace) {
        return;
    }

    // Migration: Generate contextKey for existing workspaces without one
    if (!workspace.contextKey) {
        console.log(
            `Workspace ${workspace._id} has no contextKey, generating one`,
        );
        const newContextKey = crypto.randomBytes(32).toString("hex");
        try {
            await Workspace.findByIdAndUpdate(workspace._id, {
                contextKey: newContextKey,
            });
            workspace.contextKey = newContextKey;
        } catch (err) {
            console.log("Error saving workspace contextKey: ", err);
        }
    }

    let membership;
    if (!workspace.owner?.equals(user._id)) {
        // check if user is a member of the workspace
        membership = await WorkspaceMembership.findOne({
            user: user._id,
            workspace: workspace._id,
        });
    }

    workspace = workspace.toJSON();
    workspace.joined = !!membership;
    return workspace;
}
