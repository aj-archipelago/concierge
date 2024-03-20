import mongoose from "mongoose";
import Workspace from "../../models/workspace";
import WorkspaceMembership from "../../models/workspace-membership";
import { getCurrentUser } from "../../utils/auth";

export async function getWorkspace(id) {
    let workspace;

    if (mongoose.isObjectIdOrHexString(id)) {
        workspace = await Workspace.findOne({ _id: id });
    } else {
        workspace = await Workspace.findOne({ slug: id });
    }

    const user = await getCurrentUser();

    if (!workspace) {
        return;
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